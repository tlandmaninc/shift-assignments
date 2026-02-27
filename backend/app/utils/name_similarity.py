"""Multi-strategy name similarity detection for finding duplicate employees."""

from difflib import SequenceMatcher

from app.utils.name_translator import (
    is_hebrew,
    normalize_name,
    translate_hebrew_to_english,
)

# Minimum similarity score to consider two employees as potential duplicates
DUPLICATE_THRESHOLD = 0.70


def compute_name_similarity(name_a: str, name_b: str) -> tuple[float, str]:
    """
    Compute similarity between two names using multiple strategies.

    Returns (score, match_type) where score is 0.0-1.0 and match_type
    describes which strategy matched.

    Strategies (checked in order, highest score wins):
    1. Hebrew↔English dictionary match
    2. Name containment (one name is a token-prefix of the other)
    3. Cross-language containment via dictionary translation
    4. Token overlap (Jaccard similarity on name words)
    5. Fuzzy string similarity (SequenceMatcher)
    """
    norm_a = normalize_name(name_a)
    norm_b = normalize_name(name_b)

    if not norm_a or not norm_b:
        return 0.0, "none"

    # Exact normalized match
    if norm_a == norm_b:
        return 1.0, "exact"

    best_score = 0.0
    best_type = "none"

    # Strategy 1: Hebrew↔English dictionary match
    score = _hebrew_english_score(name_a, name_b, norm_a, norm_b)
    if score > best_score:
        best_score, best_type = score, "hebrew_english"

    # Strategy 2: Name containment (same language)
    score = _containment_score(norm_a, norm_b)
    if score > best_score:
        best_score, best_type = score, "name_contained"

    # Strategy 3: Cross-language containment via dictionary
    score = _cross_language_containment_score(name_a, name_b, norm_a, norm_b)
    if score > best_score:
        best_score, best_type = score, "cross_language"

    # Strategy 4: Token overlap (Jaccard)
    score = _token_overlap_score(norm_a, norm_b)
    if score > best_score:
        best_score, best_type = score, "token_overlap"

    # Strategy 5: Fuzzy string similarity
    score = _fuzzy_score(norm_a, norm_b)
    if score > best_score:
        best_score, best_type = score, "fuzzy"

    return best_score, best_type


def find_all_duplicates(employees: list[dict]) -> list[dict]:
    """
    Find all potential duplicate pairs among active employees.

    Returns list of dicts sorted by similarity descending:
    {
        "employee_a": dict,
        "employee_b": dict,
        "name_a": str,
        "name_b": str,
        "similarity": float,
        "match_type": str,
    }
    """
    active = [e for e in employees if e.get("is_active", True)]
    duplicates = []
    seen_pairs: set[tuple[int, int]] = set()

    for i, emp_a in enumerate(active):
        for emp_b in active[i + 1:]:
            id_a = emp_a.get("id", 0)
            id_b = emp_b.get("id", 0)
            pair_key = (min(id_a, id_b), max(id_a, id_b))
            if pair_key in seen_pairs:
                continue

            name_a = emp_a.get("name", "")
            name_b = emp_b.get("name", "")
            score, match_type = compute_name_similarity(name_a, name_b)

            if score >= DUPLICATE_THRESHOLD:
                duplicates.append({
                    "employee_a": emp_a,
                    "employee_b": emp_b,
                    "name_a": name_a,
                    "name_b": name_b,
                    "similarity": round(score, 2),
                    "match_type": match_type,
                })
                seen_pairs.add(pair_key)

    duplicates.sort(key=lambda d: d["similarity"], reverse=True)
    return duplicates


# --- Strategy implementations ---


def _hebrew_english_score(
    name_a: str, name_b: str, norm_a: str, norm_b: str
) -> float:
    """Check if one name is the Hebrew↔English dictionary translation of the other."""
    a_hebrew = is_hebrew(name_a)
    b_hebrew = is_hebrew(name_b)

    # Both same language — dictionary match doesn't apply
    if a_hebrew == b_hebrew:
        return 0.0

    hebrew_name = name_a if a_hebrew else name_b
    english_norm = norm_b if a_hebrew else norm_a

    translated = translate_hebrew_to_english(hebrew_name)
    if translated and normalize_name(translated) == english_norm:
        return 0.95

    return 0.0


def _containment_score(norm_a: str, norm_b: str) -> float:
    """
    Check if one name's tokens are fully contained in the other's tokens.

    E.g. "roei" is contained in "roei vaknin" → 0.90
    """
    tokens_a = set(norm_a.split())
    tokens_b = set(norm_b.split())

    if not tokens_a or not tokens_b:
        return 0.0

    # One must be a strict subset of the other
    if tokens_a < tokens_b or tokens_b < tokens_a:
        smaller = min(len(tokens_a), len(tokens_b))
        larger = max(len(tokens_a), len(tokens_b))
        # Scale: single-token match against 2 tokens = 0.90,
        # single-token against 3 = 0.85, etc.
        return 0.80 + (0.10 * smaller / larger)

    return 0.0


def _cross_language_containment_score(
    name_a: str, name_b: str, norm_a: str, norm_b: str
) -> float:
    """
    Translate Hebrew name to English, then check token containment.

    E.g. "קורן דקל בנסון" → "Koren Dekel" (first-name partial match)
         compared against "Koren Dekel" → containment match.
    """
    a_hebrew = is_hebrew(name_a)
    b_hebrew = is_hebrew(name_b)

    if a_hebrew == b_hebrew:
        return 0.0

    hebrew_name = name_a if a_hebrew else name_b
    english_norm = norm_b if a_hebrew else norm_a

    translated = translate_hebrew_to_english(hebrew_name)
    if not translated:
        return 0.0

    translated_norm = normalize_name(translated)
    translated_tokens = set(translated_norm.split())
    english_tokens = set(english_norm.split())

    if not translated_tokens or not english_tokens:
        return 0.0

    # Check token overlap between translated Hebrew and the English name
    overlap = translated_tokens & english_tokens
    if not overlap:
        return 0.0

    union = translated_tokens | english_tokens
    jaccard = len(overlap) / len(union)

    # If exact match after translation, defer to _hebrew_english_score
    if jaccard == 1.0:
        return 0.0

    # Boost if one is a proper subset of the other
    if translated_tokens < english_tokens or english_tokens < translated_tokens:
        return max(0.85, jaccard)

    # Partial overlap
    return jaccard if jaccard >= 0.5 else 0.0


def _token_overlap_score(norm_a: str, norm_b: str) -> float:
    """
    Compute Jaccard similarity on name tokens.

    E.g. "john a smith" vs "john smith" → 2/3 = 0.67
    """
    tokens_a = set(norm_a.split())
    tokens_b = set(norm_b.split())

    if not tokens_a or not tokens_b:
        return 0.0

    overlap = tokens_a & tokens_b
    if not overlap:
        return 0.0

    union = tokens_a | tokens_b
    return len(overlap) / len(union)


def _fuzzy_score(norm_a: str, norm_b: str) -> float:
    """Compute fuzzy string similarity using SequenceMatcher."""
    return SequenceMatcher(None, norm_a, norm_b).ratio()
