#!/usr/bin/env python3
"""Local screenshot importer that updates the CardRank catalogue and assets."""

from __future__ import annotations

import json
import math
import os
import re
import secrets
import subprocess
import tempfile
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from PIL import Image, ImageOps
except ImportError:
    raise SystemExit("Pillow is required. Install it with: python3 -m pip install -r CardImporter/requirements.txt")


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
INCOMING = ROOT / "incoming"
OUTPUT = PROJECT_ROOT / "app"
CARDS_JSON = OUTPUT / "cards.json"
IMAGES = PROJECT_ROOT / "assets" / "memories"
REPORTS = ROOT / "reports"
TEMPLATES = ROOT / "templates"
OCR_SWIFT = ROOT / "recognize_ocr.swift"
SUPPORTED = {".png", ".jpg", ".jpeg"}
FAVORITES = {"xavier", "zayne", "rafayel", "sylus", "caleb"}
PREVIEW_RELATIVE = (0.067, 0.075, 0.239)
OCR_RELATIVE = (0.322, 0.099, 0.410, 0.050)
TYPE_ROI = (2, 118, 31, 28)
STARS_ROI = (81, 118, 69, 28)
WEBP_QUALITY = 95
TYPE_MIN_CORRELATION = 0.50
TYPE_MIN_MARGIN = 0.15
RARITY_MIN_TEMPLATE_CORRELATION = 0.50
RARITY_MIN_COMPONENT_BALANCE = 0.65

FILENAME_RE = re.compile(r"^(?P<date>\d{1,2}\.\d{1,2}\.\d{2}(?:\d{2})?)(?:_(?P<suffix>.*))?$")
PAIR_RE = re.compile(r"^(?P<myth>.+)_(?P<order>[12])$", re.IGNORECASE)


def parse_filename(path: Path) -> Dict[str, Any]:
    match = FILENAME_RE.fullmatch(path.stem)
    if not match:
        raise ValueError("filename must start with D.M.YY or D.M.YYYY (day and month may be zero-padded)")
    raw_date = match.group("date")
    parts = raw_date.split(".")
    day, month, year = (int(part) for part in parts)
    if len(parts[-1]) == 2:
        year += 2000
    try:
        parsed = date(year, month, day)
    except ValueError as error:
        raise ValueError("invalid date in filename: {}".format(error))

    suffix = match.group("suffix")
    # Repeated trailing underscores can distinguish screenshots with the same
    # date. They carry no myth metadata unless followed by a pair suffix.
    if suffix is not None and not suffix.strip("_"):
        suffix = None
    myth_name = None
    myth_order = None
    if suffix:
        pair = PAIR_RE.fullmatch(suffix)
        if not pair:
            raise ValueError("filename suffix must end in _1 or _2 for a Solar myth pair")
        myth_name = re.sub(r"\s+", " ", pair.group("myth").replace("_", " ")).strip()
        if not myth_name:
            raise ValueError("myth name is empty")
        myth_order = int(pair.group("order"))
    return {"releaseDate": parsed.isoformat(), "mythName": myth_name, "mythOrder": myth_order}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^\w-]", "", value, flags=re.UNICODE)
    return re.sub(r"_+", "_", value).strip("_") or "card"


def find_panel(image: Image.Image) -> Tuple[int, int, int, int]:
    """Locate the movable, centered white information window."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    start_y, stop_y = int(height * 0.16), int(height * 0.56)

    def neutral_white(pixel: Tuple[int, int, int]) -> bool:
        return min(pixel) >= 205 and max(pixel) - min(pixel) <= 50

    top = None
    run_start = None
    run_length = 0
    for y in range(start_y, stop_y):
        count = sum(1 for x in range(width) if neutral_white(pixels[x, y]))
        if count >= int(width * 0.42):
            if run_start is None:
                run_start, run_length = y, 0
            run_length += 1
            if run_length >= 12:
                top = run_start
                break
        else:
            run_start, run_length = None, 0
    if top is None:
        raise ValueError("could not find the white information window")

    sample_start = min(height, top + 10)
    sample_stop = min(height, top + 610)
    sample_height = sample_stop - sample_start
    if sample_height < 100:
        raise ValueError("not enough panel area to determine its sides")
    bright_columns = []
    for x in range(width):
        count = sum(1 for y in range(sample_start, sample_stop) if neutral_white(pixels[x, y]))
        bright_columns.append(count / sample_height >= 0.35)

    spans: List[Tuple[int, int]] = []
    span_start = None
    for x, bright in enumerate(bright_columns):
        if bright and span_start is None:
            span_start = x
        elif not bright and span_start is not None:
            spans.append((span_start, x - 1))
            span_start = None
    if span_start is not None:
        spans.append((span_start, width - 1))

    # The ornamental border can interrupt the bright-column mask by a few pixels.
    merged: List[Tuple[int, int]] = []
    max_gap = max(2, int(width * 0.01))
    for left, right in spans:
        if merged and left - merged[-1][1] - 1 <= max_gap:
            merged[-1] = (merged[-1][0], right)
        else:
            merged.append((left, right))
    broad = [span for span in merged if span[1] - span[0] + 1 >= int(width * 0.45)]
    if not broad:
        raise ValueError("found the top edge but could not determine the window width")
    left, right = max(broad, key=lambda span: span[1] - span[0])
    panel_width = right - left + 1
    if abs((left + right) / 2 - width / 2) > width * 0.06:
        raise ValueError("detected window is not centered")
    return left, top, panel_width, sample_height


def scaled_box(panel: Tuple[int, int, int, int], relative: Tuple[float, ...]) -> Tuple[int, int, int, int]:
    left, top, panel_width, _ = panel
    values = [round(part * panel_width) for part in relative]
    if len(values) == 3:
        x, y, side = values
        return left + x, top + y, side, side
    x, y, width, height = values
    return left + x, top + y, width, height


def remove_white_frame(crop: Image.Image) -> Tuple[Image.Image, Tuple[int, int, int, int]]:
    image = crop.convert("RGB")
    width, height = image.size
    pixels = image.load()
    row_ratios = []
    for y in range(height):
        light = sum(
            1 for x in range(width)
            if min(pixels[x, y]) >= 220 and max(pixels[x, y]) - min(pixels[x, y]) <= 30
        )
        row_ratios.append(light / width)

    top_band = 0
    while top_band < height and row_ratios[top_band] >= 0.90:
        top_band += 1
    trim_top = top_band if top_band >= 2 else 0

    bottom_band = 0
    while bottom_band < height and row_ratios[height - 1 - bottom_band] >= 0.20:
        bottom_band += 1
    bottom_start = height - bottom_band
    dense_bottom = sum(ratio >= 0.90 for ratio in row_ratios[bottom_start:])
    trim_bottom = bottom_band if bottom_band >= 2 and dense_bottom >= 2 else 0

    # Only a nearly solid neutral-white residual row is a frame strip.
    edge_y = height - trim_bottom - 1
    if edge_y >= 0 and row_ratios[edge_y] >= 0.90 and trim_top > 0:
        luma = [sum(pixels[x, edge_y]) / 3 for x in range(width)]
        bright_fraction = sum(value >= 0.70 * 255 for value in luma) / width
        if bright_fraction >= 0.90 and sorted(luma)[width // 2] >= 0.70 * 255:
            trim_top -= 1
            trim_bottom += 1

    usable_height = height - trim_top - trim_bottom
    side = min(width, usable_height)
    left_trim = (width - side) // 2
    right_trim = width - side - left_trim
    vertical_extra = usable_height - side
    top_extra = vertical_extra // 2
    bottom_extra = vertical_extra - top_extra
    top = trim_top + top_extra
    result = image.crop((left_trim, top, width - right_trim, height - trim_bottom - bottom_extra))
    return result, (left_trim, top, right_trim, trim_bottom + bottom_extra)


def crop_box(image: Image.Image, box: Tuple[int, int, int, int]) -> Image.Image:
    x, y, width, height = box
    if x < 0 or y < 0 or x + width > image.width or y + height > image.height:
        raise ValueError("recognition crop falls outside the screenshot")
    return image.crop((x, y, x + width, y + height))


def card_roi(side: int, trims: Tuple[int, int, int, int], preview_size: Tuple[int, int], roi: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
    left_trim, top_trim, _right_trim, _bottom_trim = trims
    x, y, width, height = roi
    bounds = (
        round(x * side / 153) - left_trim,
        round(y * side / 153) - top_trim,
        round((x + width) * side / 153) - left_trim,
        round((y + height) * side / 153) - top_trim,
    )
    return (max(0, bounds[0]), max(0, bounds[1]), min(preview_size[0], bounds[2]), min(preview_size[1], bounds[3]))


def color_rgb(value: Tuple[int, ...]) -> Tuple[float, float, float]:
    return value[0] / 255.0, value[1] / 255.0, value[2] / 255.0


def template_match(actual_image: Image.Image, template_image: Image.Image) -> Tuple[float, float, float]:
    actual = actual_image.convert("RGB")
    template = template_image.convert("RGBA")
    width, height = actual.size
    source = actual.load()
    corners = [source[0, 0], source[width - 1, 0], source[0, height - 1], source[width - 1, height - 1]]
    background = tuple(sum(pixel[channel] for pixel in corners) / (4 * 255.0) for channel in range(3))
    best = (-1.0, float("inf"), 1.0)
    for scale in (0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30):
        tw, th = max(1, round(template.width * scale)), max(1, round(template.height * scale))
        resized = template.resize((tw, th), Image.Resampling.LANCZOS)
        expected_values: List[float] = []
        actual_values: List[float] = []
        absolute_error = 0.0
        channels = 0
        offset_x, offset_y = (width - tw) // 2, (height - th) // 2
        target = resized.load()
        for ty in range(th):
            y = offset_y + ty
            if not 0 <= y < height:
                continue
            for tx in range(tw):
                x = offset_x + tx
                if not 0 <= x < width:
                    continue
                tr, tg, tb, alpha_byte = target[tx, ty]
                alpha = alpha_byte / 255.0
                if alpha < 0.25:
                    continue
                observed = color_rgb(source[x, y])
                expected = (
                    tr / 255.0 * alpha + background[0] * (1 - alpha),
                    tg / 255.0 * alpha + background[1] * (1 - alpha),
                    tb / 255.0 * alpha + background[2] * (1 - alpha),
                )
                absolute_error += sum(abs(observed[i] - expected[i]) for i in range(3))
                channels += 3
                actual_values.append(sum(observed) / 3)
                expected_values.append(sum(expected) / 3)
        if len(actual_values) < 2 or not channels:
            continue
        mean_actual = sum(actual_values) / len(actual_values)
        mean_expected = sum(expected_values) / len(expected_values)
        covariance = sum((a - mean_actual) * (b - mean_expected) for a, b in zip(actual_values, expected_values))
        variance_actual = sum((a - mean_actual) ** 2 for a in actual_values)
        variance_expected = sum((b - mean_expected) ** 2 for b in expected_values)
        correlation = covariance / math.sqrt(variance_actual * variance_expected) if variance_actual and variance_expected else 0.0
        mae = absolute_error / channels * 255.0
        if correlation > best[0]:
            best = (correlation, mae, scale)
    return best


def recognize_type(icon: Image.Image) -> Tuple[Optional[str], Dict[str, Dict[str, float]]]:
    scores: Dict[str, Dict[str, float]] = {}
    for label in ("solar", "lunar"):
        path = TEMPLATES / (label + ".PNG")
        if not path.is_file():
            raise FileNotFoundError("missing type template: {}".format(path))
        with Image.open(path) as opened:
            correlation, mae, scale = template_match(icon, opened)
        scores[label] = {"correlation": correlation, "mae": mae, "scale": scale}
    ranked = sorted(scores.items(), key=lambda item: item[1]["correlation"], reverse=True)
    if ranked[0][1]["correlation"] < TYPE_MIN_CORRELATION:
        return None, scores
    if ranked[0][1]["correlation"] - ranked[1][1]["correlation"] < TYPE_MIN_MARGIN:
        return None, scores
    return ranked[0][0], scores


def connected_components(mask: bytearray, width: int, height: int) -> List[int]:
    visited = bytearray(width * height)
    components: List[int] = []
    for start in range(width * height):
        if not mask[start] or visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        area = 0
        while stack:
            index = stack.pop()
            area += 1
            x, y = index % width, index // width
            for yy in range(max(0, y - 1), min(height, y + 2)):
                row = yy * width
                for xx in range(max(0, x - 1), min(width, x + 2)):
                    neighbour = row + xx
                    if mask[neighbour] and not visited[neighbour]:
                        visited[neighbour] = 1
                        stack.append(neighbour)
        components.append(area)
    return components


def recognize_rarity(stars: Image.Image) -> Tuple[Optional[int], Dict[str, Any]]:
    image = stars.convert("RGB")
    width, height = image.size
    pixels = image.load()
    mask = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            mask[y * width + x] = int(sum(pixels[x, y]) / (3 * 255.0) > 0.65)
    min_area = max(8, round(width * height * 0.02))
    areas = sorted((area for area in connected_components(mask, width, height) if area >= min_area), reverse=True)
    component_count = len(areas)
    scores: Dict[str, Dict[str, float]] = {}
    for count in (3, 4, 5):
        reference = TEMPLATES / "{}stars.PNG".format(count)
        if not reference.is_file():
            return None, {"components": areas, "min_component_area": min_area, "templateScores": scores, "reason": "rarity template is missing: {}".format(reference.name)}
        with Image.open(reference) as template:
            correlation, mae, scale = template_match(image, template)
        scores[str(count)] = {"correlation": correlation, "mae": mae, "scale": scale}

    ranked = sorted(scores.items(), key=lambda item: item[1]["correlation"], reverse=True)
    winner, winning_score = int(ranked[0][0]), ranked[0][1]["correlation"]
    margin = winning_score - ranked[1][1]["correlation"]
    balance = min(areas) / max(areas) if areas else 0.0
    metrics = {"components": areas, "component_count": component_count, "min_component_area": min_area, "component_balance": balance, "templateScores": scores, "best_margin": margin}
    if component_count not in (3, 4, 5) or balance < RARITY_MIN_COMPONENT_BALANCE:
        return None, dict(metrics, reason="bright star components are not cleanly separated")
    component_score = scores.get(str(component_count), {}).get("correlation", -1.0)
    metrics["component_count_template_correlation"] = component_score
    if component_score < RARITY_MIN_TEMPLATE_CORRELATION:
        return None, dict(metrics, reason="bright-component count is not supported by its star template")
    # The stars are individually visible and separated in the crop. Their
    # component count is the direct rarity signal; template matching is a
    # cross-check because color, alpha compositing and the card-art background
    # can make a different template correlate better than the true star row.
    metrics["decision"] = "component_count"
    metrics["template_winner"] = winner
    return component_count, metrics


def prepare_image(source: Path) -> Dict[str, Any]:
    with Image.open(source) as opened:
        screenshot = ImageOps.exif_transpose(opened).convert("RGB")
        screenshot.load()
    panel = find_panel(screenshot)
    raw_box = scaled_box(panel, PREVIEW_RELATIVE)
    raw_preview = crop_box(screenshot, raw_box)
    preview, trims = remove_white_frame(raw_preview)
    type_box = card_roi(raw_box[2], trims, preview.size, TYPE_ROI)
    stars_box = card_roi(raw_box[2], trims, preview.size, STARS_ROI)
    type_crop = preview.crop(type_box)
    stars_crop = preview.crop(stars_box)
    ocr_box = scaled_box(panel, OCR_RELATIVE)
    ocr_crop = crop_box(screenshot, ocr_box)
    # The title row is small in the game screenshot and can wrap onto two
    # lines. Upscaling preserves the crop bounds while giving Vision more
    # pixels per glyph.
    ocr_crop = ocr_crop.resize((ocr_crop.width * 2, ocr_crop.height * 2), Image.Resampling.LANCZOS)
    card_type, type_scores = recognize_type(type_crop)
    rarity, rarity_metrics = recognize_rarity(stars_crop)
    return {
        "preview": preview,
        "ocr_crop": ocr_crop,
        "card_type": card_type,
        "rarity": rarity,
        "type_metrics": type_scores,
        "rarity_metrics": rarity_metrics,
        "panel": {"x": panel[0], "y": panel[1], "width": panel[2]},
        "preview_box": {"x": raw_box[0], "y": raw_box[1], "width": raw_box[2], "height": raw_box[3]},
        "preview_size": list(preview.size),
        "frame_trim": list(trims),
    }


def run_ocr(crops: Dict[str, Image.Image]) -> Dict[str, Any]:
    if not OCR_SWIFT.is_file():
        raise RuntimeError("local OCR helper is missing: {}".format(OCR_SWIFT))
    with tempfile.TemporaryDirectory(prefix="cardrank-ocr-") as temporary:
        temp = Path(temporary)
        cache = temp / "swift-module-cache"
        crop_paths = []
        by_stem = {}
        for index, (name, crop) in enumerate(crops.items()):
            path = temp / ("{:04d}.png".format(index))
            crop.save(path, format="PNG")
            crop_paths.append(str(path))
            by_stem[path.name] = name
        command = ["swift", "-module-cache-path", str(cache), str(OCR_SWIFT)] + crop_paths
        try:
            result = subprocess.run(command, check=False, text=True, capture_output=True)
        except OSError as error:
            raise RuntimeError("could not start local Apple Vision OCR: {}".format(error))
        if result.returncode != 0:
            raise RuntimeError("Apple Vision OCR helper failed: {}".format(result.stderr.strip() or result.stdout.strip() or "no details"))
        observations: Dict[str, Any] = {}
        for line in result.stdout.splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = by_stem.get(item.get("file", ""))
            if key:
                observations[key] = item
        return observations


def parse_ocr(result: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], float, List[Dict[str, Any]]]:
    if result.get("error"):
        raise ValueError("Apple Vision OCR failed: {}".format(result["error"]))
    observations = result.get("observations") or []
    lines: List[Tuple[float, str, float]] = []
    raw_lines: List[Dict[str, Any]] = []
    for observation in observations:
        candidates = observation.get("candidates") or []
        if not candidates:
            continue
        favorite_pattern = re.compile(r"\b(Xavier|Zayne|Rafayel|Caleb|Sylus)\b", re.IGNORECASE)
        best = max(
            candidates,
            key=lambda candidate: (
                bool(favorite_pattern.search(str(candidate.get("text", "")))),
                float(candidate.get("confidence", 0.0)),
            ),
        )
        text = str(best.get("text", "")).strip()
        confidence = float(best.get("confidence", 0.0))
        box = observation.get("box") or [0.0, 0.0, 0.0, 0.0]
        # Vision uses a bottom-left origin; sorting by descending Y joins
        # wrapped title lines in their natural top-to-bottom order.
        lines.append((float(box[1]), text, confidence))
        raw_lines.append({"text": text, "confidence": confidence, "box": box, "candidates": candidates})
    combined = " ".join(text for _y, text, _confidence in sorted(lines, reverse=True))
    match = re.search(r"\b(Xavier|Zayne|Rafayel|Caleb|Sylus)\s*:\s*(.+)$", combined, re.IGNORECASE)
    confidence = min((item[2] for item in lines), default=0.0)
    if not match:
        return None, None, confidence, raw_lines
    favorite = match.group(1).title()
    card_name = re.sub(r"\s+", " ", match.group(2)).strip()
    if favorite.casefold() not in FAVORITES or not card_name:
        return None, None, confidence, raw_lines
    return favorite, card_name, confidence, raw_lines


def load_cards() -> List[Dict[str, Any]]:
    if not CARDS_JSON.exists():
        return []
    try:
        data = json.loads(CARDS_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("could not read app/cards.json: {}".format(error))
    if not isinstance(data, list):
        raise RuntimeError("app/cards.json must contain a JSON array")
    return data


def save_cards_atomically(cards: Sequence[Dict[str, Any]]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=str(OUTPUT), prefix=".cards-", suffix=".tmp", delete=False) as file:
            temp_name = file.name
            json.dump(list(cards), file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_name, str(CARDS_JSON))
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


def next_id(existing: set) -> str:
    while True:
        card_id = "card_{}".format(secrets.token_hex(3))
        if card_id not in existing:
            return card_id


def process_record(source: Path, parsed: Dict[str, Any], analysis: Dict[str, Any], ocr_data: Dict[str, Any], cards: List[Dict[str, Any]]) -> Dict[str, Any]:
    favorite, card_name, confidence, raw_ocr = parse_ocr(ocr_data)
    rarity = analysis["rarity"]
    card_type = analysis["card_type"]
    if favorite is None or card_name is None:
        raise ValueError("favorite/card title could not be confidently parsed from OCR")
    if confidence < 0.40:
        raise ValueError("OCR confidence is too low ({:.3f})".format(confidence))
    if rarity not in (3, 4, 5):
        raise ValueError("rarity is uncertain: {}".format(analysis["rarity_metrics"].get("reason", "no result")))
    if card_type not in ("solar", "lunar"):
        raise ValueError("card type is uncertain")

    myth_name = parsed["mythName"]
    myth_order = parsed["mythOrder"]
    if rarity == 5 and card_type == "solar":
        if not myth_name or myth_order not in (1, 2):
            raise ValueError("5★ Solar filename must end with _myth_name_1 or _myth_name_2")
    elif myth_name is not None or myth_order is not None:
        raise ValueError("myth suffix is only accepted for 5★ Solar cards")

    character = favorite[0].upper() + favorite[1:].lower()
    if any(
        str(card.get("character", "")).casefold() == character.casefold()
        and str(card.get("name", "")).casefold() == card_name.casefold()
        and int(card.get("rarity", -1)) == rarity
        and str(card.get("type", "")).casefold() == card_type
        and str(card.get("releaseDate", "")) == parsed["releaseDate"]
        and card.get("mythOrder") == myth_order
        for card in cards
    ):
        raise ValueError("duplicate card already exists in app/cards.json")

    suffix = "_{}_{}_{}".format(rarity, card_type, parsed["releaseDate"])
    if myth_order:
        suffix += "_pair{}".format(myth_order)
    filename = "{}_{}{}.webp".format(slugify(character), slugify(card_name), suffix)
    destination = IMAGES / filename
    if destination.exists():
        raise ValueError("image already exists in assets/memories: {}".format(filename))

    existing_ids = {str(card.get("id")) for card in cards if card.get("id") is not None}
    card: Dict[str, Any] = {
        "id": next_id(existing_ids),
        "name": card_name,
        "character": character,
        "rarity": rarity,
        "type": card_type,
        "releaseDate": parsed["releaseDate"],
        "image": filename,
    }
    if myth_name is not None:
        card["mythName"] = myth_name
        card["mythOrder"] = myth_order

    IMAGES.mkdir(parents=True, exist_ok=True)
    temp_image = destination.with_name(destination.stem + ".tmp.webp")
    try:
        analysis["preview"].save(temp_image, format="WEBP", quality=WEBP_QUALITY, method=6)
        os.replace(str(temp_image), str(destination))
        save_cards_atomically([*cards, card])
    except Exception:
        temp_image.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise
    source_warning = None
    try:
        source.unlink()
    except OSError as error:
        source_warning = "record saved, but source file could not be removed: {}".format(error)
    return {"card": card, "ocrConfidence": confidence, "ocrRaw": raw_ocr, "sourceWarning": source_warning}


def write_report(report: Dict[str, Any]) -> Path:
    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    path = REPORTS / ("run-{}.json".format(stamp))
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    INCOMING.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if not CARDS_JSON.exists():
        save_cards_atomically([])
    sources = sorted((p for p in INCOMING.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED), key=lambda p: p.name.casefold())
    if not sources:
        print("No PNG/JPEG screenshots found in {}".format(INCOMING))
        return 0

    try:
        cards = load_cards()
    except Exception as error:
        report = {
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "success": 0,
            "failed": len(sources),
            "files": [{"file": source.name, "status": "failed", "error": str(error)} for source in sources],
        }
        report_path = write_report(report)
        print("Could not load app/cards.json: {}".format(error))
        print("All source screenshots were kept. Report: {}".format(report_path))
        return 1
    analyses: Dict[str, Dict[str, Any]] = {}
    crops: Dict[str, Image.Image] = {}
    parse_errors: Dict[str, str] = {}
    report_items: Dict[str, Dict[str, Any]] = {}
    for source in sources:
        try:
            parsed = parse_filename(source)
            analysis = prepare_image(source)
            analysis["filename_data"] = parsed
            analyses[source.name] = analysis
            crops[source.name] = analysis["ocr_crop"]
            report_items[source.name] = {"file": source.name, "status": "pending", "geometry": {k: analysis[k] for k in ("panel", "preview_box", "preview_size", "frame_trim")}, "typeMetrics": analysis["type_metrics"], "rarityMetrics": analysis["rarity_metrics"]}
        except Exception as error:
            parse_errors[source.name] = str(error)
            report_items[source.name] = {"file": source.name, "status": "failed", "error": str(error)}

    ocr_results: Dict[str, Any] = {}
    if crops:
        try:
            ocr_results = run_ocr(crops)
        except Exception as error:
            for name in crops:
                report_items[name]["ocrError"] = str(error)

    success = 0
    failed = 0
    for source in sources:
        item = report_items[source.name]
        if source.name in parse_errors:
            failed += 1
            print("FAILED {}: {}; source kept in incoming".format(source.name, parse_errors[source.name]))
            continue
        try:
            if source.name not in ocr_results:
                raise ValueError(item.get("ocrError", "Apple Vision OCR returned no result"))
            done = process_record(source, analyses[source.name]["filename_data"], analyses[source.name], ocr_results[source.name], cards)
            cards.append(done["card"])
            item.update({"status": "imported", "record": done["card"], "ocrConfidence": done["ocrConfidence"], "ocrRaw": done["ocrRaw"]})
            if done["sourceWarning"]:
                item["warning"] = done["sourceWarning"]
            success += 1
            print("IMPORTED {} — {}: {} ({}★ {})".format(source.name, done["card"]["character"], done["card"]["name"], done["card"]["rarity"], done["card"]["type"]))
            if done["sourceWarning"]:
                print("  Warning: {}".format(done["sourceWarning"]))
        except Exception as error:
            failed += 1
            item["status"] = "failed"
            item["error"] = str(error)
            if source.name in ocr_results:
                try:
                    _fav, _name, conf, raw = parse_ocr(ocr_results[source.name])
                    item["ocrConfidence"], item["ocrRaw"] = conf, raw
                except Exception as ocr_error:
                    item["ocrError"] = str(ocr_error)
            print("FAILED {}: {}; source kept in incoming".format(source.name, error))

    report = {"generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"), "success": success, "failed": failed, "files": list(report_items.values())}
    report_path = write_report(report)
    print("\nFinished: {} imported, {} failed. Report: {}".format(success, failed, report_path))
    print("Failed source screenshots remain in {}.".format(INCOMING))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
