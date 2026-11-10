#!/usr/bin/env python3
"""Entry point: python vfa.py <command> ...  (see `python vfa.py -h`)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vfa.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
