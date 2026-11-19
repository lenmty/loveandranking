#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname -- "$SCRIPT_DIR")"
cd "$PROJECT_DIR" || exit 1

python3 "$SCRIPT_DIR/import_cards.py"
STATUS=$?
printf '\nImporter finished with status %s. Press Return to close this window.\n' "$STATUS"
read -r _
exit "$STATUS"
