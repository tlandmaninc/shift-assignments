"""Tests for chat tool registry, parsing, and execution."""

from unittest.mock import patch, MagicMock
from app.services.chat_tools import (
    parse_tool_calls,
    execute_tool,
    build_tools_prompt,
    CHAT_TOOLS,
)


class TestParseToolCalls:
    def test_parses_valid_tool_call(self):
        text = '```tool_call\n{"tool": "list_shift_types", "params": {}}\n```'
        result = parse_tool_calls(text)
        assert len(result) == 1
        assert result[0]["tool"] == "list_shift_types"
        assert result[0]["params"] == {}

    def test_parses_tool_with_params(self):
        text = '```tool_call\n{"tool": "get_shift_type", "params": {"key": "ect"}}\n```'
        result = parse_tool_calls(text)
        assert len(result) == 1
        assert result[0]["params"]["key"] == "ect"

    def test_parses_multiple_tool_calls(self):
        text = (
            'Some text\n'
            '```tool_call\n{"tool": "list_shift_types", "params": {}}\n```\n'
            'More text\n'
            '```tool_call\n{"tool": "get_shift_type", "params": {"key": "er"}}\n```'
        )
        result = parse_tool_calls(text)
        assert len(result) == 2

    def test_ignores_malformed_json(self):
        text = '```tool_call\n{not valid json}\n```'
        result = parse_tool_calls(text)
        assert result == []

    def test_ignores_missing_tool_key(self):
        text = '```tool_call\n{"params": {"key": "ect"}}\n```'
        result = parse_tool_calls(text)
        assert result == []

    def test_ignores_regular_code_blocks(self):
        text = '```python\nprint("hello")\n```'
        result = parse_tool_calls(text)
        assert result == []

    def test_empty_text(self):
        assert parse_tool_calls("") == []

    def test_no_tool_calls(self):
        assert parse_tool_calls("Just a normal response with no tools.") == []


class TestExecuteTool:
    def test_unknown_tool(self):
        result = execute_tool("nonexistent_tool", {})
        assert result["success"] is False
        assert "Unknown tool" in result["error"]

    def test_admin_required_blocks_non_admin(self):
        user = {"role": "basic", "email": "user@test.com"}
        result = execute_tool("create_shift_type", {"key": "test"}, user)
        assert result["success"] is False
        assert "admin" in result["error"].lower()

    def test_admin_required_blocks_no_user(self):
        result = execute_tool("create_shift_type", {"key": "test"}, None)
        assert result["success"] is False
        assert "admin" in result["error"].lower()

    def test_list_shift_types_succeeds(self):
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_types.return_value = {
                "ect": {"label": "ECT", "color": "#3B82F6"},
            }
            result = execute_tool("list_shift_types", {})
        assert result["success"] is True
        assert "shift_types" in result["result"]
        assert result["result"]["count"] == 1

    def test_get_shift_type_not_found(self):
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            result = execute_tool("get_shift_type", {"key": "nonexistent"})
        assert result["success"] is False
        assert "not found" in result["error"]

    def test_get_shift_type_found(self):
        cfg = {"label": "ECT", "color": "#3B82F6", "slots": 1}
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = cfg
            result = execute_tool("get_shift_type", {"key": "ect"})
        assert result["success"] is True
        assert result["result"]["label"] == "ECT"

    def test_create_shift_type_as_admin(self):
        admin = {"role": "admin", "email": "admin@test.com"}
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            mock_storage.save_shift_type.return_value = {"label": "Night Rounds"}
            result = execute_tool(
                "create_shift_type",
                {
                    "key": "night_rounds",
                    "label": "Night Rounds",
                    "color": "#8B5CF6",
                    "start_time": "T220000",
                    "end_time": "T060000",
                    "next_day_end": True,
                    "slots": 1,
                    "exclude_weekends": False,
                    "calendar_title": "Night Rounds Shift",
                },
                admin,
            )
        assert result["success"] is True
        assert result["result"]["created"] is True

    def test_validate_shift_type_as_admin(self):
        admin = {"role": "admin", "email": "admin@test.com"}
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            mock_storage.get_shift_types.return_value = {"ect": {}}
            result = execute_tool(
                "validate_shift_type",
                {
                    "key": "night_rounds",
                    "label": "Night Rounds",
                    "color": "#8B5CF6",
                    "start_time": "T220000",
                    "end_time": "T060000",
                    "next_day_end": True,
                    "slots": 1,
                    "exclude_weekends": False,
                    "calendar_title": "Night Rounds Shift",
                },
                admin,
            )
        assert result["success"] is True
        assert result["result"]["valid"] is True

    def test_read_only_tools_allow_non_admin(self):
        user = {"role": "basic", "email": "user@test.com"}
        with patch("app.services.chat_tools.storage") as mock_storage:
            mock_storage.get_shift_types.return_value = {}
            result = execute_tool("list_shift_types", {}, user)
        assert result["success"] is True


class TestBuildToolsPrompt:
    def test_returns_string(self):
        prompt = build_tools_prompt()
        assert isinstance(prompt, str)

    def test_contains_all_tools(self):
        prompt = build_tools_prompt()
        for tool_name in CHAT_TOOLS:
            assert tool_name in prompt

    def test_marks_admin_tools(self):
        prompt = build_tools_prompt()
        assert "(admin only)" in prompt

    def test_contains_color_map(self):
        prompt = build_tools_prompt()
        assert "purple=#8B5CF6" in prompt
        assert "blue=#3B82F6" in prompt
        assert "red=#EF4444" in prompt

    def test_contains_time_conversion_rules(self):
        prompt = build_tools_prompt()
        assert "T220000" in prompt
        assert "T060000" in prompt
        assert "next_day_end=true" in prompt

    def test_contains_key_label_derivation(self):
        prompt = build_tools_prompt()
        assert "night_rounds" in prompt
        assert "Night Rounds" in prompt

    def test_forbids_asking_for_technical_details(self):
        prompt = build_tools_prompt()
        assert "NEVER ask users for hex color codes" in prompt
        assert "iCal time formats" in prompt

    def test_tool_calls_described_as_internal(self):
        prompt = build_tools_prompt()
        assert "INTERNAL" in prompt
