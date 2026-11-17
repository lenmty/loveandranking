#!/usr/bin/env python3
"""
CARD IMPORTER — Love and Deepspace

HOW TO USE
1. Open Terminal.
2. Type:
       python3 add_card.py
   (Leave a space after the command.)
3. Drag one JPEG or PNG image from Finder into the Terminal window.
4. Press Enter.

FILENAME FORMAT
    <character><rarity><type>_<dd.mm.yy or dd.mm.yyyy>_<card_name>.jpg

Examples:
    c5s_11.11.26_Moonlit_Reserve.jpg
    x4l_03.08.2026_Midnight_Whispers.png

Character codes: x = Xavier, z = Zayne, r = Rafayel,
                 s = Sylus, c = Caleb
Rarity:           4 or 5
Type:             s = solar, l = lunar
Date:             dd.mm.yy (interpreted as 20yy) or dd.mm.yyyy

The original image is left untouched.
A WebP copy is saved to assets/memories.
The new card is appended to app/cards.json.
"""

from __future__ import annotations

import json
import re
import secrets
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Ошибка: не найдена библиотека Pillow.")
    print("Установи её командой: python3 -m pip install Pillow")
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parent
JSON_PATH = PROJECT_DIR / "app" / "cards.json"
OUTPUT_DIR = PROJECT_DIR / "assets" / "memories"

CHARACTERS = {
    "x": "Xavier",
    "z": "Zayne",
    "r": "Rafayel",
    "s": "Sylus",
    "c": "Caleb",
}

TYPES = {
    "s": "solar",
    "l": "lunar",
}

MAX_WIDTH = 600
WEBP_QUALITY = 85

FILENAME_PATTERN = re.compile(
    r"^(?P<character>[xzrsc])"
    r"(?P<rarity>[45])"
    r"(?P<type>[sl])_"
    r"(?P<date>\d{2}\.\d{2}\.\d{2}(?:\d{2})?)_"
    r"(?P<name>.+)$",
    re.IGNORECASE,
)


def slugify(value: str) -> str:
    """Create a filesystem-friendly, lowercase filename fragment."""
    value = unicodedata.normalize("NFKC", value).strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^\w-]", "", value, flags=re.UNICODE)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


def parse_filename(source: Path) -> dict:
    match = FILENAME_PATTERN.fullmatch(source.stem)
    if not match:
        raise ValueError(
            "Не удалось разобрать имя файла.\n"
            "Ожидаемый формат: c5s_11.11.26_Moonlit_Reserve.jpg"
        )

    data = match.groupdict()
    character_code = data["character"].lower()
    type_code = data["type"].lower()

    raw_date = data["date"]
    date_format = "%d.%m.%y" if len(raw_date.split(".")[-1]) == 2 else "%d.%m.%Y"
    parsed_date = datetime.strptime(raw_date, date_format).date()

    # Two-digit years are always interpreted as 2000–2099.
    if len(raw_date.split(".")[-1]) == 2:
        parsed_date = parsed_date.replace(year=2000 + parsed_date.year % 100)

    name = data["name"].replace("_", " ").strip()
    name = re.sub(r"\s+", " ", name)
    if not name:
        raise ValueError("В имени файла отсутствует название карточки.")

    return {
        "name": name,
        "character": CHARACTERS[character_code],
        "rarity": int(data["rarity"]),
        "type": TYPES[type_code],
        "releaseDate": parsed_date.isoformat(),
    }


def load_cards() -> list[dict]:
    if not JSON_PATH.exists():
        return []

    try:
        with JSON_PATH.open("r", encoding="utf-8") as file:
            cards = json.load(file)
    except json.JSONDecodeError as error:
        raise ValueError(f"Не удалось прочитать {JSON_PATH}: {error}") from error

    if not isinstance(cards, list):
        raise ValueError("Ожидался JSON-массив карточек в app/cards.json.")

    return cards


def make_card_id(existing_ids: set[str]) -> str:
    while True:
        card_id = f"card_{secrets.token_hex(3)}"
        if card_id not in existing_ids:
            return card_id


def save_webp(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image.load()

        if image.width > MAX_WIDTH:
            new_height = round(image.height * MAX_WIDTH / image.width)
            image = image.resize((MAX_WIDTH, new_height), Image.Resampling.LANCZOS)

        # Preserve transparency when present.
        if "A" in image.getbands():
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")

        image.save(
            destination,
            format="WEBP",
            quality=WEBP_QUALITY,
            method=6,
        )


def main() -> int:
    if len(sys.argv) != 2:
        print("Перетащи один JPEG или PNG после команды python3 add_card.py.")
        return 1

    source = Path(sys.argv[1].strip().strip("'\"")).expanduser()

    if not source.is_file():
        print(f"Файл не найден: {source}")
        return 1

    if source.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        print("Поддерживаются только JPEG и PNG.")
        return 1

    try:
        card_data = parse_filename(source)
        cards = load_cards()

        normalized_name = card_data["name"].casefold()
        for card in cards:
            if (
                str(card.get("character", "")).casefold()
                == card_data["character"].casefold()
                and str(card.get("name", "")).casefold() == normalized_name
            ):
                print(
                    "Похоже, такая карточка уже есть в cards.json:\n"
                    f"{card.get('character')} — {card.get('name')} "
                    f"(ID: {card.get('id', 'без ID')})"
                )
                return 1

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

        image_filename = (
            f"{slugify(card_data['character'])}_"
            f"{slugify(card_data['name'])}.webp"
        )
        destination = OUTPUT_DIR / image_filename

        if destination.exists():
            print(f"Файл назначения уже существует: {destination}")
            print("Ничего не изменено. Проверь, не добавлена ли эта картинка раньше.")
            return 1

        existing_ids = {
            str(card.get("id"))
            for card in cards
            if card.get("id") is not None
        }
        new_card = {
            "id": make_card_id(existing_ids),
            **card_data,
            "image": image_filename,
        }

        # Convert first. If conversion fails, the JSON remains unchanged.
        save_webp(source, destination)

        try:
            updated_cards = [*cards, new_card]
            with JSON_PATH.open("w", encoding="utf-8") as file:
                json.dump(updated_cards, file, ensure_ascii=False, indent=2)
                file.write("\n")
        except Exception:
            destination.unlink(missing_ok=True)
            raise

        print("Карточка успешно добавлена:")
        print(f"  {new_card['character']} — {new_card['name']}")
        print(f"  Изображение: {destination}")
        print(f"  JSON:        {JSON_PATH}")
        print(f"  ID:          {new_card['id']}")
        return 0

    except (ValueError, OSError) as error:
        print(f"Ошибка: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
