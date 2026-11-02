"""Offline regressions: all numeric fixtures below are synthetic test data."""

import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import yaml

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("citations", ROOT / "bin/update_scholar_citations.py")
citations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(citations)
USER = "xHzl8QQAAAAJ"
TODAY = "2026-11-02"


def author_fixture(count=7):
    return {"scholar_id": USER, "publications": [
        {"author_pub_id": f"{USER}:test-paper", "bib": {"title": "Synthetic fixture", "pub_year": "2025"}, "num_citations": count}
    ]}


class CitationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "_data").mkdir()
        (self.root / "_pages").mkdir()
        (self.root / "_data/socials.yml").write_text(f"scholar_userid: {USER}\n")
        for page in citations.PUBLICATIONS_PAGES:
            (self.root / page).write_text(f"[Scholar]({citations.profile_url(USER)})\n")
        self.path = self.root / "_data/citations.yml"
        self.client = Mock()
        self.client.fill.return_value = author_fixture()

    def update(self):
        citations.update_citations(self.root, self.client, TODAY)

    def write(self, data):
        self.path.write_text(yaml.safe_dump(data))

    def snapshot(self, date="2026-11-01"):
        return citations.fetch_snapshot(self.client, USER, date)

    def test_initial_fetch_without_cache(self):
        self.update()
        data = citations.read_yaml(self.path)
        citations.validate_snapshot(data, USER)
        self.assertEqual(data["papers"][f"{USER}:test-paper"]["citations"], 7)
        self.assertEqual(data["metadata"]["last_updated"], TODAY)
        self.client.search_author_id.assert_called_once_with(USER)
        self.client.fill.assert_called_once_with(self.client.search_author_id.return_value, sections=["publications"])

    def test_repository_account_and_empty_snapshot_are_valid(self):
        self.assertEqual(citations.load_scholar_user_id(ROOT), USER)
        citations.validate_snapshot(citations.read_yaml(ROOT / "_data/citations.yml"), USER)
        config = citations.read_yaml(ROOT / "_config.yml")
        self.assertEqual(config["scholar"]["bibliography"], "papers.bib")
        for page in citations.PUBLICATIONS_PAGES:
            self.assertNotIn("papers_einstein", (ROOT / page).read_text())

    def test_each_page_mismatch_fails_before_fetch(self):
        for page in citations.PUBLICATIONS_PAGES:
            with self.subTest(page=page):
                original = (self.root / page).read_text()
                (self.root / page).write_text(original.replace(USER, citations.EXAMPLE_SCHOLAR_ID))
                with self.assertRaises(ValueError):
                    self.update()
                (self.root / page).write_text(original)
        self.client.search_author_id.assert_not_called()

    def test_example_account_rejected_even_if_pages_match(self):
        for path in [self.root / "_data/socials.yml", *[self.root / page for page in citations.PUBLICATIONS_PAGES]]:
            path.write_text(path.read_text().replace(USER, citations.EXAMPLE_SCHOLAR_ID))
        with self.assertRaisesRegex(ValueError, "Einstein"):
            self.update()
        self.client.search_author_id.assert_not_called()

    def test_wrong_account_cache_dated_today_does_not_skip_fetch(self):
        self.write({"metadata": {"last_updated": TODAY}, "papers": {f"{citations.EXAMPLE_SCHOLAR_ID}:test-paper": {"citations": 999}}})
        self.update()
        self.client.search_author_id.assert_called_once_with(USER)
        citations.validate_snapshot(citations.read_yaml(self.path), USER)

    def test_corrupt_cache_can_be_replaced_by_verified_data(self):
        self.path.write_text("papers: [broken\n")
        self.update()
        citations.validate_snapshot(citations.read_yaml(self.path), USER)

    def test_valid_same_day_cache_skips_network(self):
        self.write(self.snapshot(TODAY))
        self.client.reset_mock()
        self.update()
        self.client.search_author_id.assert_not_called()

    def test_unchanged_counts_keep_existing_bytes_and_date(self):
        self.write(self.snapshot())
        before = self.path.read_bytes()
        self.update()
        self.assertEqual(self.path.read_bytes(), before)

    def test_explicit_zero_is_accepted(self):
        self.client.fill.return_value = author_fixture(0)
        self.update()
        self.assertEqual(citations.read_yaml(self.path)["papers"][f"{USER}:test-paper"]["citations"], 0)

    def test_missing_and_invalid_counts_never_become_zero(self):
        before = self.snapshot()
        self.write(before)
        original = self.path.read_bytes()
        for count in (None, -1, True, "7", 1.5):
            with self.subTest(count=count):
                self.client.fill.return_value = author_fixture(count)
                with self.assertRaises(ValueError):
                    self.update()
                self.assertEqual(self.path.read_bytes(), original)
        del self.client.fill.return_value["publications"][0]["num_citations"]
        with self.assertRaises(ValueError):
            self.update()
        self.assertEqual(self.path.read_bytes(), original)

    def test_wrong_author_empty_or_malformed_publications_preserve_cache(self):
        self.write(self.snapshot())
        before = self.path.read_bytes()
        wrong_author = author_fixture()
        wrong_author["scholar_id"] = citations.EXAMPLE_SCHOLAR_ID
        wrong_paper = author_fixture()
        wrong_paper["publications"][0]["author_pub_id"] = f"{citations.EXAMPLE_SCHOLAR_ID}:test-paper"
        missing_id = author_fixture()
        del missing_id["publications"][0]["author_pub_id"]
        duplicate = author_fixture()
        duplicate["publications"] *= 2
        no_title = author_fixture()
        no_title["publications"][0]["bib"] = {}
        for response in (wrong_author, wrong_paper, missing_id, duplicate, no_title, {"scholar_id": USER, "publications": []}, {"scholar_id": USER}):
            with self.subTest(response=response):
                self.client.fill.return_value = response
                with self.assertRaises(ValueError):
                    self.update()
                self.assertEqual(self.path.read_bytes(), before)

    def test_later_bad_publication_prevents_partial_write(self):
        self.write(self.snapshot())
        before = self.path.read_bytes()
        bad = copy.deepcopy(author_fixture()["publications"][0])
        bad["author_pub_id"] = f"{USER}:second-paper"
        del bad["num_citations"]
        self.client.fill.return_value["publications"].append(bad)
        with self.assertRaises(ValueError):
            self.update()
        self.assertEqual(self.path.read_bytes(), before)

    def test_network_failure_preserves_cache(self):
        self.write(self.snapshot())
        before = self.path.read_bytes()
        self.client.fill.side_effect = RuntimeError("Scholar unavailable")
        with self.assertRaises(RuntimeError):
            self.update()
        self.assertEqual(self.path.read_bytes(), before)

    def test_failed_atomic_replace_preserves_cache(self):
        self.path.write_text("previous bytes\n")
        with patch.object(citations.os, "replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                citations.write_snapshot(self.path, self.snapshot())
        self.assertEqual(self.path.read_text(), "previous bytes\n")
        self.assertEqual(list(self.path.parent.glob("*.tmp")), [])

    def test_cli_returns_nonzero_on_error(self):
        with patch("sys.argv", ["update_scholar_citations.py"]), patch.object(citations, "update_citations", side_effect=RuntimeError("failure")):
            self.assertEqual(citations.main(), 1)

    def test_workflow_propagates_success_error_and_timeout(self):
        workflow = citations.read_yaml(ROOT / ".github/workflows/update-citations.yml")
        job = workflow["jobs"]["update-citations"]
        step = next(step for step in job["steps"] if step.get("id") == "run_citation_update")
        self.assertFalse(job.get("continue-on-error", False))
        self.assertFalse(step.get("continue-on-error", False))
        stub = self.root / "timeout"
        stub.write_text('#!/bin/bash\nexit "$TEST_STATUS"\n')
        stub.chmod(0o755)
        for status in (0, 1, 124, 137):
            with self.subTest(status=status):
                output = self.root / f"output-{status}"
                summary = self.root / f"summary-{status}"
                env = {**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}", "TEST_STATUS": str(status), "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
                result = subprocess.run(["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step["run"]], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, status, result.stderr)
                self.assertIn(f"status={status}", output.read_text())
                self.assertIn("succeeded" if status == 0 else f"failed with exit code {status}", summary.read_text())


if __name__ == "__main__":
    unittest.main()
