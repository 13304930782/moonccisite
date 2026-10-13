#!/usr/bin/env bash
# Execute as a nohup child shell; never source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec python3 deploy.py
