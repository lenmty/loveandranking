# CardRank screenshot importer

## Launch

1. Put game screenshots directly in `CardImporter/incoming/`.
2. Double-click `RunImporter.command` in Finder.
3. Read the per-file results in Terminal. Successfully imported screenshots are removed from `incoming`; files that fail validation or processing stay there.

Supported inputs are PNG and JPEG screenshots at the current game screenshot layout. Recognition runs locally with Apple Vision; Solar/Lunar uses the alpha PNG templates in `tools/card-import/templates/`.

## Screenshot names

- Most cards: `DD.MM.YY.PNG` or `DD.MM.YYYY.PNG`, for example `17.11.26.PNG`.
- 5★ Solar: add the myth after an underscore, for example `17.11.26_Moonlit_Reserve.PNG`. That suffix becomes the card name. Other card names come from OCR; favorites, rarity, and type are always recognized from the screenshot.
- A myth suffix on a card other than 5★ Solar is rejected and the source is kept.

The two-digit year is interpreted as 2000–2099. Supported screenshot extensions are `.png`, `.jpg`, and `.jpeg` (case-insensitive).

## Local requirements

- macOS with Apple Vision and the Swift command-line tool available as `swift`.
- Python 3 and Pillow. Install Pillow if needed with `python3 -m pip install --user -r CardImporter/requirements.txt`.

The importer does not call remote services. It reads the current `app/cards.json` and writes converted previews to `assets/memories/`.

## Image quality and safety

The preview is cropped from the same measured 153×153 area used by the recognition prototype, scaled to the screenshot's actual resolution. It is not resized down or up. The crop is saved as WebP at quality 95 (the old helper used quality 85 and a 600 px downscale).

Each file is validated and recognized before changes are made. JSON is replaced atomically. If saving the JSON fails, the new WebP is removed. A source screenshot is deleted only after its card and image have been saved successfully.
