#!/usr/bin/env python3
"""Build synthetic buggy repos used by the docs and smoke tests.

Usage:
    python scripts/build_target_repos.py              # -> ./targets
    python scripts/build_target_repos.py /tmp/targets  # custom output dir

Depends on Python's stdlib plus `git` on PATH. No other packages.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_NAMES = (
    "bug1-nested-blockon",
    "bug2-csv-bom-decode",
    "bug3-tz-naive-compare",
)


def _git(args: list[str], cwd: Path) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True)


def _commit(repo: Path, message: str, files: list[Path]) -> None:
    rels = [p.relative_to(repo).as_posix() for p in files]
    _git(["add", *rels], repo)
    _git(["commit", "-m", message], repo)


def build_targets(output: Path) -> None:
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    bug1 = output / "bug1-nested-blockon"
    bug1.mkdir(exist_ok=True)
    (bug1 / "setup.py").write_text("from setuptools import setup\nsetup(name='pkg')\n")
    (bug1 / "src").mkdir(exist_ok=True)
    (bug1 / "src" / "pkg").mkdir(exist_ok=True)
    (bug1 / "src" / "pkg" / "__init__.py").write_text("from .lib import run\n")
    (bug1 / "src" / "pkg" / "lib.py").write_text(
        "def run():\n"
        "    items = [1, 2, 3]\n"
        "    for i, x in enumerate(items):\n"
        "        if i == 2:\n"
        "            print(items[i + 1])\n"
    )
    _git(["init", "--initial-branch", "master"], bug1)
    _git(["config", "user.email", "devnull@example.com"], bug1)
    _git(["config", "user.name", "DeadEnd fixture"], bug1)
    _commit(
        bug1,
        "buggy state: nested blockon at index 2",
        [bug1 / "setup.py", bug1 / "src" / "pkg" / "__init__.py", bug1 / "src" / "pkg" / "lib.py"],
    )

    bug2 = output / "bug2-csv-bom-decode"
    bug2.mkdir(exist_ok=True)
    (bug2 / "decode.py").write_text(
        "import csv\n\n"
        "def load(path):\n"
        "    with open(path, encoding='utf-8') as f:\n"
        "        return list(csv.DictReader(f))\n"
    )
    (bug2 / "data.csv").write_bytes(b"\ufeffname,age\nAlice,30\nBob,25\n")
    _git(["init", "--initial-branch", "master"], bug2)
    _git(["config", "user.email", "devnull@example.com"], bug2)
    _git(["config", "user.name", "DeadEnd fixture"], bug2)
    _commit(
        bug2,
        "buggy state: BOM decode assumes utf-8 only",
        [bug2 / "decode.py", bug2 / "data.csv"],
    )

    bug3 = output / "bug3-tz-naive-compare"
    bug3.mkdir(exist_ok=True)
    (bug3 / "compare.py").write_text(
        "from datetime import datetime\n\n"
        "def overlaps(start_a, end_a, start_b, end_b):\n"
        "    return start_a < end_b and start_b < end_a\n"
    )
    (bug3 / "schedule.py").write_text(
        "from datetime import datetime\n\n"
        "def session(now, start, end):\n"
        "    if start <= now <= end:\n"
        "        return True\n"
        "    return False\n"
    )
    _git(["init", "--initial-branch", "master"], bug3)
    _git(["config", "user.email", "devnull@example.com"], bug3)
    _git(["config", "user.name", "DeadEnd fixture"], bug3)
    _commit(
        bug3,
        "buggy state: timezone-naive compare without normalizing",
        [bug3 / "compare.py", bug3 / "schedule.py"],
    )

    for name in REPO_NAMES:
        folder = output / name
        readme = folder / "README.md"
        readme.write_text(
            f"# {name}\n\n"
            f"This folder is a self-contained git repo with a buggy initial commit.\n\n"
            f"To use it as a test repo:\n\n"
            f"```\n"
            f"cd {name}\n"
            f"git init && git add . && git commit -m \"buggy state\"\n"
            f"```\n\n"
            f"The initial commit is already present; the command above is harmless\n"
            f"and makes the repo self-contained if you copy it elsewhere.\n"
        )
        _git(["add", "README.md"], folder)
        _git(["commit", "-m", "docs: how to reuse this test repo"], folder)


def main() -> None:
    if len(sys.argv) > 1:
        out = Path(sys.argv[1])
    else:
        out = Path.cwd() / "targets"
    build_targets(out)
    print(f"wrote targets -> {out}")


if __name__ == "__main__":
    main()
