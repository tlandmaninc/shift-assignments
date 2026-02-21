"""Tests for utility functions (date_utils, name_translator)."""

from datetime import date

from app.utils.date_utils import (
    get_month_dates,
    get_excluded_dates,
    format_date_with_day,
    parse_month_year,
    format_month_year,
)
from app.utils.name_translator import (
    is_hebrew,
    translate_hebrew_to_english,
    normalize_name,
)


# ── date_utils ──────────────────────────────────────────────────────────────


class TestGetMonthDates:
    def test_february_non_leap(self):
        dates = get_month_dates(2025, 2)
        assert len(dates) == 28
        assert dates[0] == date(2025, 2, 1)
        assert dates[-1] == date(2025, 2, 28)

    def test_january(self):
        dates = get_month_dates(2026, 1)
        assert len(dates) == 31

    def test_leap_february(self):
        dates = get_month_dates(2024, 2)
        assert len(dates) == 29


class TestGetExcludedDates:
    def test_ect_excludes_fri_sat_tue(self):
        """ECT shift type should exclude Fri, Sat, and Tue by default."""
        included, excluded = get_excluded_dates(2026, 3, shift_type="ect")
        weekdays_included = {d.weekday() for d in included}
        # Friday=4, Saturday=5, Tuesday=1 should be excluded
        assert 4 not in weekdays_included
        assert 5 not in weekdays_included
        assert 1 not in weekdays_included

    def test_ect_include_tuesdays(self):
        """When include_tuesdays=True, Tuesdays should appear in included."""
        included, excluded = get_excluded_dates(
            2026, 3, include_tuesdays=True, shift_type="ect"
        )
        weekdays_included = {d.weekday() for d in included}
        assert 1 in weekdays_included
        # Fri/Sat still excluded
        assert 4 not in weekdays_included
        assert 5 not in weekdays_included

    def test_247_includes_all_days(self):
        """24/7 shift type (internal) should include all days of month."""
        included, excluded = get_excluded_dates(2026, 3, shift_type="internal")
        total = len(included) + len(excluded)
        assert total == 31
        # No day excluded by default for 24/7 types
        assert len(excluded) == 0

    def test_additional_excluded_dates(self):
        """Extra dates can be manually excluded."""
        included, excluded = get_excluded_dates(
            2026, 3,
            additional_excluded=["2026-03-01"],
            shift_type="internal",
        )
        assert date(2026, 3, 1) in excluded
        assert date(2026, 3, 1) not in included

    def test_force_included_overrides(self):
        """Force-included dates override default exclusion rules."""
        # 2026-03-06 is a Friday (would be excluded for ECT)
        included, excluded = get_excluded_dates(
            2026, 3,
            force_included=["2026-03-06"],
            shift_type="ect",
        )
        assert date(2026, 3, 6) in included


class TestFormatDateWithDay:
    def test_format(self):
        d = date(2026, 2, 1)
        result = format_date_with_day(d)
        assert "February" in result
        assert "2026" in result
        assert "Sunday" in result


class TestParseMonthYear:
    def test_basic(self):
        year, month = parse_month_year("2026-03")
        assert year == 2026
        assert month == 3


class TestFormatMonthYear:
    def test_basic(self):
        assert format_month_year(2026, 3) == "2026-03"

    def test_padding(self):
        assert format_month_year(2026, 1) == "2026-01"


# ── name_translator ────────────────────────────────────────────────────────


class TestIsHebrew:
    def test_hebrew_text(self):
        assert is_hebrew("סתיו לנדמן") is True

    def test_english_text(self):
        assert is_hebrew("Stav Landman") is False

    def test_empty(self):
        assert is_hebrew("") is False


class TestTranslateHebrewToEnglish:
    def test_known_name(self):
        result = translate_hebrew_to_english("סתיו לנדמן")
        assert result == "Stav Landman"

    def test_first_name_only(self):
        result = translate_hebrew_to_english("סתיו")
        assert result == "Stav"

    def test_untranslatable(self):
        result = translate_hebrew_to_english("שם לא ידוע")
        assert result is None

    def test_english_input_returns_none(self):
        result = translate_hebrew_to_english("John Doe")
        assert result is None


class TestNormalizeName:
    def test_case_insensitive(self):
        assert normalize_name("Stav Landman") == normalize_name("stav landman")

    def test_whitespace_collapse(self):
        assert normalize_name("  Stav   Landman  ") == "stav landman"

    def test_empty(self):
        assert normalize_name("") == ""
