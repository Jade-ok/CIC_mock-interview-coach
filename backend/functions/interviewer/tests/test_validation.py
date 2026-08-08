"""Tests for interviewer.validation.validate_input"""

from interviewer.validation import validate_input

ERROR_MSG = "analyst_output is required and must be a non-empty object"


class TestValidPayload:
    def test_returns_analyst_output_and_none(self):
        analyst_output = {"candidate_profile": {"name": "Alice"}}
        payload = {"analyst_output": analyst_output}

        result, error = validate_input(payload)

        assert result == analyst_output
        assert error is None


class TestMissingAnalystOutputKey:
    def test_missing_key_returns_none_and_error(self):
        payload = {"other_key": "value"}

        result, error = validate_input(payload)

        assert result is None
        assert error == ERROR_MSG


class TestEmptyDictAnalystOutput:
    def test_empty_dict_returns_none_and_error(self):
        payload = {"analyst_output": {}}

        result, error = validate_input(payload)

        assert result is None
        assert error == ERROR_MSG


class TestNonDictAnalystOutput:
    def test_string_analyst_output(self):
        payload = {"analyst_output": "not a dict"}

        result, error = validate_input(payload)

        assert result is None
        assert error == ERROR_MSG

    def test_list_analyst_output(self):
        payload = {"analyst_output": [1, 2, 3]}

        result, error = validate_input(payload)

        assert result is None
        assert error == ERROR_MSG

    def test_none_analyst_output(self):
        payload = {"analyst_output": None}

        result, error = validate_input(payload)

        assert result is None
        assert error == ERROR_MSG


class TestNonDictPayload:
    def test_list_payload(self):
        result, error = validate_input([1, 2, 3])

        assert result is None
        assert error == ERROR_MSG

    def test_string_payload(self):
        result, error = validate_input("hello")

        assert result is None
        assert error == ERROR_MSG
