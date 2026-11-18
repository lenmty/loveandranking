#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
python3 "$SCRIPT_DIR/import_cards.py"
STATUS=$?
printf '\nStandalone importer finished with status %s. Press Return to close.\n' "$STATUS"
read -r _
exit "$STATUS"
