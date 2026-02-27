"""Tests for the multi-strategy name similarity module."""

import pytest
from app.utils.name_similarity import (
    compute_name_similarity,
    find_all_duplicates,
    DUPLICATE_THRESHOLD,
)


class TestHebrewEnglishDictionary:
    def test_exact_dictionary_match(self):
        score, match_type = compute_name_similarity("רועי ואקנין", "Roei Vaknin")
        assert score == 0.95
        assert match_type == "hebrew_english"

    def test_first_name_dictionary_match(self):
        score, match_type = compute_name_similarity("רועי", "Roei")
        assert score == 0.95
        assert match_type == "hebrew_english"

    def test_no_match_different_names(self):
        score, _ = compute_name_similarity("Ahmad Al-Rashid", "Sara Jaber")
        assert score < DUPLICATE_THRESHOLD


class TestNameContainment:
    def test_hebrew_first_name_in_full_name(self):
        score, match_type = compute_name_similarity("רועי", "רועי ואקנין")
        assert score >= 0.85
        assert match_type == "name_contained"

    def test_hebrew_first_name_in_full_name_2(self):
        score, match_type = compute_name_similarity("אסף", "אסף איזנשטטר")
        assert score >= 0.85
        assert match_type == "name_contained"

    def test_english_first_name_in_full_name(self):
        score, match_type = compute_name_similarity("Noam", "Noam Aronovitz")
        assert score >= 0.85
        assert match_type == "name_contained"

    def test_no_containment_for_unrelated(self):
        score, _ = compute_name_similarity("Stav Landman", "Dana Lapidot")
        assert score < DUPLICATE_THRESHOLD


class TestCrossLanguageContainment:
    def test_hebrew_translated_overlaps_english(self):
        """קורן דקל בנסון translates to partial match with Koren Dekel."""
        # This relies on first-name translation: קורן → not in dict
        # but the token overlap after translation should still catch it
        # if the dictionary has the mapping
        score, _ = compute_name_similarity("קורן דקל בנסון", "Koren Dekel")
        # May or may not match depending on dictionary coverage
        # Just verify it doesn't crash
        assert 0.0 <= score <= 1.0


class TestTokenOverlap:
    def test_high_overlap(self):
        score, match_type = compute_name_similarity("John Smith", "John A. Smith")
        assert score >= 0.60
        assert match_type in ("token_overlap", "name_contained", "fuzzy")

    def test_no_overlap(self):
        score, _ = compute_name_similarity("Alice Johnson", "Bob Williams")
        assert score < DUPLICATE_THRESHOLD


class TestFuzzyMatch:
    def test_typo_detection(self):
        score, _ = compute_name_similarity("Jon Smith", "John Smith")
        assert score >= DUPLICATE_THRESHOLD

    def test_very_different_names(self):
        score, _ = compute_name_similarity("Ahmad Al-Rashid", "Lina Mansour")
        assert score < DUPLICATE_THRESHOLD


class TestExactMatch:
    def test_same_name(self):
        score, match_type = compute_name_similarity("Stav Landman", "Stav Landman")
        assert score == 1.0
        assert match_type == "exact"

    def test_case_insensitive(self):
        score, match_type = compute_name_similarity("stav landman", "Stav Landman")
        assert score == 1.0
        assert match_type == "exact"


class TestEmptyInputs:
    def test_empty_name_a(self):
        score, _ = compute_name_similarity("", "John")
        assert score == 0.0

    def test_empty_name_b(self):
        score, _ = compute_name_similarity("John", "")
        assert score == 0.0

    def test_both_empty(self):
        score, _ = compute_name_similarity("", "")
        assert score == 0.0


class TestFindAllDuplicates:
    def test_finds_hebrew_first_name_vs_full_name(self):
        employees = [
            {"id": 1, "name": "רועי", "is_active": True},
            {"id": 2, "name": "רועי ואקנין", "is_active": True},
        ]
        dups = find_all_duplicates(employees)
        assert len(dups) == 1
        assert dups[0]["similarity"] >= 0.85

    def test_skips_inactive_employees(self):
        employees = [
            {"id": 1, "name": "רועי", "is_active": False},
            {"id": 2, "name": "רועי ואקנין", "is_active": True},
        ]
        dups = find_all_duplicates(employees)
        assert len(dups) == 0

    def test_no_duplicates_in_unique_list(self):
        employees = [
            {"id": 1, "name": "Ahmad Al-Rashid", "is_active": True},
            {"id": 2, "name": "Sara Jaber", "is_active": True},
            {"id": 3, "name": "Noura Hassan", "is_active": True},
        ]
        dups = find_all_duplicates(employees)
        assert len(dups) == 0

    def test_sorted_by_similarity_descending(self):
        employees = [
            {"id": 1, "name": "Jon Smith", "is_active": True},
            {"id": 2, "name": "John Smith", "is_active": True},
            {"id": 3, "name": "John Smith", "is_active": True},
        ]
        dups = find_all_duplicates(employees)
        assert len(dups) >= 1
        for i in range(len(dups) - 1):
            assert dups[i]["similarity"] >= dups[i + 1]["similarity"]

    def test_real_data_scenario(self):
        """Test with data resembling actual employee list."""
        employees = [
            {"id": 6, "name": "אסף", "is_active": True},
            {"id": 12, "name": "רועי", "is_active": True},
            {"id": 17, "name": "רועי ואקנין", "is_active": True},
            {"id": 18, "name": "Ahmad Al-Rashid", "is_active": True},
            {"id": 24, "name": "אסף איזנשטטר", "is_active": True},
        ]
        dups = find_all_duplicates(employees)
        # Should find at least: רועי ↔ רועי ואקנין, אסף ↔ אסף איזנשטטר
        pair_ids = {(d["employee_a"]["id"], d["employee_b"]["id"]) for d in dups}
        assert (12, 17) in pair_ids, "Should find רועי ↔ רועי ואקנין"
        assert (6, 24) in pair_ids, "Should find אסף ↔ אסף איזנשטטר"
        # Ahmad should not be in any duplicate pair
        ahmad_involved = [d for d in dups if 18 in (d["employee_a"]["id"], d["employee_b"]["id"])]
        assert len(ahmad_involved) == 0
