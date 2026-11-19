# CardRank card importer

The importer is a local tool for adding memories to `app/cards.json` and their WebP images to `assets/memories/`.

## Run

1. Put screenshots in `CardImporter/incoming/`.
2. Double-click `CardImporter/RunImporter.command`.
3. Review the per-file results in Terminal and the JSON report in `CardImporter/reports/`.

Successfully imported screenshots are removed from `incoming/`. Files that fail validation or processing stay there.

## Screenshot filenames

- Most memories: `DD.MM.YY.PNG` or `DD.MM.YYYY.PNG`.
- 5★ Solar myth pairs: `DD.MM.YY_myth_name_1.PNG` and `DD.MM.YY_myth_name_2.PNG`.

For a myth pair, the screenshot OCR supplies each memory's name. The filename suffix supplies the shared myth name and pair order. A myth suffix is only accepted for 5★ Solar memories. 3★ and 4★ memories are also supported.

Supported image formats are PNG and JPEG. The importer recognizes screenshots locally with Apple Vision, uses the templates in `CardImporter/templates/`, and requires Python 3, Swift, and Pillow. Install Pillow with:

```sh
python3 -m pip install --user -r CardImporter/requirements.txt
```

The tool does not make network requests. Successfully processed screenshots are cropped into WebP without upscaling and saved at quality 95.
