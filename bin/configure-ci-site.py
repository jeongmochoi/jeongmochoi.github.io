#!/usr/bin/env python3
"""Prepare the checked-out Jekyll configuration for CI without a third-party action.

Only _config.yml in the runner workspace is modified. CI never commits this file.
"""

import argparse
import os
import re
from pathlib import Path


def replace_nested_scalar(lines, section, key, value):
    heading = f"{section}:"
    positions = [i for i, line in enumerate(lines) if line.strip() == heading and not line.startswith((" ", "\t"))]
    if len(positions) != 1:
        raise ValueError(f"Expected exactly one root YAML section {section!r}")
    start = positions[0] + 1
    matches = []
    for i in range(start, len(lines)):
        line = lines[i]
        if line.strip() and not line[0].isspace() and not line.startswith("#"):
            break
        if re.match(rf"^  {re.escape(key)}:", line):
            matches.append(i)
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {section}.{key} entry")
    lines[matches[0]] = f"  {key}: {value}\n"


def replace_root_scalar(lines, key, value):
    positions = [i for i, line in enumerate(lines) if re.match(rf"^{re.escape(key)}:", line)]
    if len(positions) != 1:
        raise ValueError(f"Expected exactly one root YAML key {key!r}")
    lines[positions[0]] = f"{key}: {value}\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear-baseurl", action="store_true")
    args = parser.parse_args()

    repository = os.environ.get("GITHUB_REPOSITORY", "")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", repository):
        raise ValueError("GITHUB_REPOSITORY must be an owner/repository slug")

    config_path = Path("_config.yml")
    lines = config_path.read_text(encoding="utf-8").splitlines(keepends=True)
    replace_nested_scalar(lines, "giscus", "repo", repository)
    if args.clear_baseurl:
        replace_root_scalar(lines, "baseurl", "")
    config_path.write_text("".join(lines), encoding="utf-8")
    print(f"CI configuration prepared for {repository} (not committed)")


if __name__ == "__main__":
    main()
