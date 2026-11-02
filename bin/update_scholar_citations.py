#!/usr/bin/env python
"""Fetch a validated Scholar snapshot; never invent counts or publish changes."""

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import parse_qs, urlparse

import yaml


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_SCHOLAR_ID = "qc6CJjYAAAAJ"
PUBLICATIONS_PAGES = ("_pages/publications.md", "_pages/ko-publications.md")


def profile_url(user_id):
    return f"https://scholar.google.com/citations?user={user_id}"


def read_yaml(path):
    with path.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def load_scholar_user_id(root=ROOT):
    config = read_yaml(root / "_data/socials.yml")
    user_id = config.get("scholar_userid") if isinstance(config, dict) else None
    if not isinstance(user_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{12}", user_id):
        raise ValueError("_data/socials.yml must contain a valid scholar_userid")
    if user_id == EXAMPLE_SCHOLAR_ID:
        raise ValueError("The upstream Einstein example account must not be used")
    for page in PUBLICATIONS_PAGES:
        text = (root / page).read_text(encoding="utf-8")
        urls = re.findall(r"https?://scholar\.google\.com/citations\?[^\s)\"<>]+", text)
        page_ids = {value for url in urls for value in parse_qs(urlparse(url).query).get("user", [])}
        if page_ids != {user_id}:
            raise ValueError(f"Scholar account mismatch in {page}: {page_ids} != {user_id}")
    return user_id


def validate_papers(papers, user_id):
    if not isinstance(papers, dict):
        raise ValueError("papers must be a mapping")
    for key, paper in papers.items():
        if not isinstance(key, str) or not re.fullmatch(re.escape(user_id) + r":[A-Za-z0-9_-]+", key):
            raise ValueError(f"Publication ID does not belong to {user_id}: {key}")
        if not isinstance(paper, dict) or not isinstance(paper.get("title"), str) or not paper["title"].strip():
            raise ValueError(f"Missing publication title: {key}")
        count = paper.get("citations")
        if type(count) is not int or count < 0:
            raise ValueError(f"Missing or invalid citation count: {key}")


def validate_snapshot(data, user_id):
    if not isinstance(data, dict) or not isinstance(data.get("metadata"), dict):
        raise ValueError("Citation snapshot must include provenance metadata")
    metadata = data["metadata"]
    if metadata.get("scholar_userid") != user_id or metadata.get("source_url") != profile_url(user_id):
        raise ValueError("Citation snapshot belongs to a different or unverified account")
    validate_papers(data.get("papers"), user_id)
    updated = metadata.get("last_updated")
    if data["papers"]:
        if not isinstance(updated, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", updated):
            raise ValueError("Nonempty citation snapshot requires a verified update date")
        datetime.strptime(updated, "%Y-%m-%d")
    elif updated is not None:
        raise ValueError("Empty snapshot must not claim a successful fetch date")


def fetch_snapshot(client, user_id, today):
    client.set_timeout(15)
    client.set_retries(3)
    author = client.search_author_id(user_id)
    author = client.fill(author, sections=["publications"])
    if not isinstance(author, dict) or author.get("scholar_id") != user_id:
        raise ValueError("Google Scholar returned an unexpected author account")
    publications = author.get("publications")
    if not isinstance(publications, list) or not publications:
        raise ValueError("Google Scholar returned no publications; existing data was not changed")
    papers = {}
    for publication in publications:
        # Use the author-qualified ID, never a bare pub_id or a substring match.
        key = publication.get("author_pub_id")
        if not key or key in papers:
            raise ValueError(f"Missing or duplicate author publication ID: {key}")
        bib = publication.get("bib", {})
        papers[key] = {
            "title": bib.get("title"),
            "year": bib.get("pub_year"),
            # Absence is an error; only an explicit numeric zero means zero citations.
            "citations": publication.get("num_citations"),
        }
    data = {
        "metadata": {"scholar_userid": user_id, "source_url": profile_url(user_id), "last_updated": today},
        "papers": papers,
    }
    validate_snapshot(data, user_id)
    return data


def write_snapshot(path, data):
    # Replace only after serialization completes, so errors/timeouts cannot truncate the cache.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            yaml.safe_dump(data, stream, allow_unicode=True, width=1000, sort_keys=True)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def update_citations(root=ROOT, client=None, today=None):
    user_id = load_scholar_user_id(root)
    path = root / "_data/citations.yml"
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = None
    if path.exists():
        try:
            existing = read_yaml(path)
            validate_snapshot(existing, user_id)
        except (ValueError, yaml.YAMLError) as error:
            print(f"Ignoring unverified cache: {error}", file=sys.stderr)
            existing = None
    if existing and existing["papers"] and existing["metadata"]["last_updated"] == today:
        print("Validated citation snapshot is already up to date today")
        return
    if client is None:
        from scholarly import scholarly

        client = scholarly
    print(f"Fetching citations from {profile_url(user_id)}")
    data = fetch_snapshot(client, user_id, today)
    if existing and existing["papers"] == data["papers"]:
        print("Verified citation counts are unchanged; retaining the previous snapshot date")
        return
    write_snapshot(path, data)
    print(f"Saved {len(data['papers'])} verified publication counts to {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="Validate settings and saved data without contacting Google")
    args = parser.parse_args()
    try:
        if args.validate_only:
            user_id = load_scholar_user_id()
            validate_snapshot(read_yaml(ROOT / "_data/citations.yml"), user_id)
            print(f"Scholar settings and saved citation provenance are valid for {user_id}")
        else:
            update_citations()
    except Exception as error:
        print(f"Citation update failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
