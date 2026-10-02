#!/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
sha256sum -c SHA256SUMS
exec python3 -u install.py
