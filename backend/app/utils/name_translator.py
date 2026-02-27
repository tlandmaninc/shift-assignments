"""Hebrew to English name translation utility."""

import unicodedata
import re
from typing import Optional, Tuple


# Hebrew to English transliteration mapping for common names
# This is a curated list of known employee names
HEBREW_TO_ENGLISH_NAMES = {
    # Full names
    "סתיו לנדמן": "Stav Landman",
    "מור סגל בן-אור": "Mor Segal Ben-Or",
    "צליל גברון טרנר": "Tzlil Gavron Turner",
    "ליאור חנוך": "Lior Hanoch",
    "נועם ארונוביץ": "Noam Aronovitz",
    "נועם ארונוביץ'": "Noam Aronovitz",  # With geresh
    "דנה לפידות": "Dana Lapidot",
    "טל סקליאר": "Tal Skliar",
    "כרמל מרגלית": "Carmel Margalit",
    "יעל מור שקד": "Yael Mor Shaked",
    "רועי ואקנין": "Roei Vaknin",
    "אסף איזנשטטר": "Asaf Eisenshteter",
    "קורן דקל בנסון": "Koren Dekel Benson",

    # First names only
    "לידור": "Lidor",
    "אסף": "Asaf",
    "רועי": "Roei",
    "יוגב": "Yogev",
    "נועם": "Noam",
    "סתיו": "Stav",
    "מור": "Mor",
    "דנה": "Dana",
    "טל": "Tal",
    "כרמל": "Carmel",
    "יעל": "Yael",
    "צליל": "Tzlil",
    "ליאור": "Lior",
    "קורן": "Koren",
}

# Reverse mapping for English to Hebrew
ENGLISH_TO_HEBREW_NAMES = {v.lower(): k for k, v in HEBREW_TO_ENGLISH_NAMES.items()}


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters."""
    if not text:
        return False
    for char in text:
        if '\u0590' <= char <= '\u05FF':  # Hebrew Unicode block
            return True
    return False


def normalize_name(name: str) -> str:
    """Normalize a name for comparison (lowercase, trimmed, normalized unicode)."""
    if not name:
        return ""
    # Unicode normalization
    normalized = unicodedata.normalize('NFC', name)
    # Trim whitespace and collapse multiple spaces
    normalized = ' '.join(normalized.split())
    return normalized.lower()


def translate_hebrew_to_english(hebrew_name: str) -> Optional[str]:
    """
    Translate a Hebrew name to English.

    Returns the English translation if found, None otherwise.
    """
    if not hebrew_name or not is_hebrew(hebrew_name):
        return None

    normalized = normalize_name(hebrew_name)

    # Try exact match first
    for heb, eng in HEBREW_TO_ENGLISH_NAMES.items():
        if normalize_name(heb) == normalized:
            return eng

    # Try partial match (first name match)
    hebrew_parts = normalized.split()
    if hebrew_parts:
        first_name_heb = hebrew_parts[0]
        for heb, eng in HEBREW_TO_ENGLISH_NAMES.items():
            if normalize_name(heb) == first_name_heb:
                return eng

    return None


def translate_english_to_hebrew(english_name: str) -> Optional[str]:
    """
    Translate an English name to Hebrew.

    Returns the Hebrew translation if found, None otherwise.
    """
    if not english_name or is_hebrew(english_name):
        return None

    normalized = normalize_name(english_name)

    # Try exact match first
    if normalized in ENGLISH_TO_HEBREW_NAMES:
        return ENGLISH_TO_HEBREW_NAMES[normalized]

    # Try partial match (first name match)
    english_parts = normalized.split()
    if english_parts:
        first_name_eng = english_parts[0]
        if first_name_eng in ENGLISH_TO_HEBREW_NAMES:
            return ENGLISH_TO_HEBREW_NAMES[first_name_eng]

    return None


def find_matching_name(name: str, name_list: list[str]) -> Optional[str]:
    """
    Find a matching name in a list of names.

    For Hebrew names, looks for English equivalent.
    For English names, looks for Hebrew equivalent.

    Returns the matching name from the list if found.
    """
    if not name:
        return None

    normalized_input = normalize_name(name)

    # First check for exact match (case-insensitive)
    for candidate in name_list:
        if normalize_name(candidate) == normalized_input:
            return candidate

    # If input is Hebrew, look for English equivalent
    if is_hebrew(name):
        english_translation = translate_hebrew_to_english(name)
        if english_translation:
            for candidate in name_list:
                if normalize_name(candidate) == normalize_name(english_translation):
                    return candidate
    else:
        # If input is English, look for Hebrew equivalent
        hebrew_translation = translate_english_to_hebrew(name)
        if hebrew_translation:
            for candidate in name_list:
                if normalize_name(candidate) == normalize_name(hebrew_translation):
                    return candidate

    return None


def get_translation_pair(name: str) -> Tuple[str, Optional[str]]:
    """
    Get a name and its translation.

    Returns tuple of (original_name, translated_name).
    translated_name is None if no translation found.
    """
    if is_hebrew(name):
        return (name, translate_hebrew_to_english(name))
    else:
        return (name, translate_english_to_hebrew(name))


def add_name_mapping(hebrew_name: str, english_name: str):
    """
    Add a new name mapping to the translation dictionary.

    Note: This only updates the in-memory dictionary.
    For persistence, the mapping should be stored in a config file.
    """
    HEBREW_TO_ENGLISH_NAMES[hebrew_name] = english_name
    ENGLISH_TO_HEBREW_NAMES[english_name.lower()] = hebrew_name
