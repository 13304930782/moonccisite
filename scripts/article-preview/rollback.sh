#!/usr/bin/env bash
# Execute as a nohup child shell with the BACKUP path printed by deploy.sh.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass BACKUP directory}")
exec python3 "$backup/deploy.py" rollback "$backup"
