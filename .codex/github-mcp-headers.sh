#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$project_root/.env"

if [ ! -r "$env_file" ]; then
  printf '%s\n' "Missing .env with GITHUB_PAT" >&2
  exit 1
fi

set -a
. "$env_file"
set +a

: "${GITHUB_PAT:?GITHUB_PAT is required}"
printf '{"Authorization":"Bearer %s"}\n' "$GITHUB_PAT"
