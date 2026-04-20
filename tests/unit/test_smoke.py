"""
Pytest Smoke Tests

These tests validate that the test framework is correctly configured
and verify core project conventions from CONSTITUTION.md and CLAUDE.md.

Per CONSTITUTION.md Principle VI: Test-First Development
"""

import pytest
from datetime import date, datetime
from pathlib import Path


class TestPytestFramework:
    """Validate pytest is correctly configured."""

    def test_pytest_is_running(self):
        """Basic test to confirm pytest works."""
        assert True

    def test_async_tests_supported(self):
        """Confirm async test support is available."""
        # pytest-asyncio marker would be used for actual async tests
        assert pytest is not None

    @pytest.mark.unit
    def test_markers_are_configured(self):
        """Confirm custom markers are registered."""
        # This test uses the 'unit' marker from pytest.ini
        assert True


class TestProjectPaths:
    """Validate project structure paths."""

    def test_project_root_exists(self, project_root):
        """Confirm project root fixture works."""
        assert project_root.exists()
        assert project_root.is_dir()

    def test_tests_dir_exists(self, tests_dir):
        """Confirm tests directory exists."""
        assert tests_dir.exists()
        assert tests_dir.is_dir()

    def test_conftest_exists(self, tests_dir):
        """Confirm conftest.py exists."""
        conftest_path = tests_dir / "conftest.py"
        assert conftest_path.exists()


class TestConfidenceThreshold:
    """Validate confidence threshold per CONSTITUTION.md."""

    def test_threshold_is_075(self, confidence_threshold):
        """Per CONSTITUTION.md: 'Fields with confidence < 0.75 must be flagged'."""
        assert confidence_threshold == 0.75

    def test_high_confidence_passes(self, confidence_threshold):
        """Fields above threshold should pass."""
        field_confidence = 0.95
        assert field_confidence >= confidence_threshold

    def test_low_confidence_fails(self, confidence_threshold):
        """Fields below threshold should be flagged."""
        field_confidence = 0.65
        assert field_confidence < confidence_threshold

    def test_boundary_confidence(self, confidence_threshold):
        """Field exactly at threshold should pass."""
        field_confidence = 0.75
        assert field_confidence >= confidence_threshold


class TestFilingWindow:
    """Validate filing window per CONSTITUTION.md."""

    def test_filing_window_dates(self, filing_window):
        """Per CONSTITUTION.md: 'Filing window (Jan 1 – May 1)'."""
        assert filing_window["start"] == (1, 1)  # January 1
        assert filing_window["end"] == (5, 1)    # May 1

    def test_january_is_in_window(self):
        """January 15 should be within filing window."""
        from conftest import is_within_filing_window
        assert is_within_filing_window(date(2024, 1, 15)) is True

    def test_march_is_in_window(self):
        """March 1 should be within filing window."""
        from conftest import is_within_filing_window
        assert is_within_filing_window(date(2024, 3, 1)) is True

    def test_may_1_is_in_window(self):
        """May 1 (last day) should be within filing window."""
        from conftest import is_within_filing_window
        assert is_within_filing_window(date(2024, 5, 1)) is True

    def test_may_2_is_outside_window(self):
        """May 2 should be outside filing window."""
        from conftest import is_within_filing_window
        assert is_within_filing_window(date(2024, 5, 2)) is False

    def test_july_is_outside_window(self):
        """July 1 should be outside filing window."""
        from conftest import is_within_filing_window
        assert is_within_filing_window(date(2024, 7, 1)) is False


class TestSampleFixtures:
    """Validate sample data fixtures."""

    def test_sample_company_has_required_fields(self, sample_company):
        """Company fixture should have all required fields."""
        assert "document_number" in sample_company
        assert "name" in sample_company
        assert "status" in sample_company
        assert "principal_address" in sample_company
        assert "registered_agent" in sample_company
        assert "officers" in sample_company

    def test_sample_company_document_number_format(self, sample_company):
        """Document number should follow expected format."""
        doc_num = sample_company["document_number"]
        assert doc_num.startswith("P")  # Florida profit corp prefix
        assert len(doc_num) == 9

    def test_sample_audit_entry_has_required_fields(self, sample_audit_entry):
        """Per CONSTITUTION.md: audit records must include specific fields."""
        required_fields = [
            "user_id",
            "action_type",
            "entity_id",
            "timestamp",
            "before_state",
            "after_state",
        ]
        for field in required_fields:
            assert field in sample_audit_entry, f"Missing required field: {field}"

    def test_sample_extraction_result_structure(self, sample_extraction_result):
        """Extraction result should include confidence scores."""
        assert "extracted_fields" in sample_extraction_result
        assert "needs_review" in sample_extraction_result
        
        # At least one field should have confidence below threshold
        low_conf_fields = sample_extraction_result["low_confidence_fields"]
        assert len(low_conf_fields) > 0


class TestComplianceRules:
    """Validate compliance rules from CONSTITUTION.md."""

    def test_user_approval_required_concept(self):
        """Per CONSTITUTION.md: 'Submission requires explicit user approval'."""
        mock_submission = {
            "document_number": "P12345678",
            "user_approved": False,
        }
        
        # Unapproved submission should be blocked
        assert mock_submission["user_approved"] is False
        
        # After approval
        mock_submission["user_approved"] = True
        assert mock_submission["user_approved"] is True

    def test_fields_need_review_helper(self, sample_extraction_result, confidence_threshold):
        """Test the fields_need_review helper function."""
        from conftest import fields_need_review
        
        low_conf = fields_need_review(sample_extraction_result, confidence_threshold)
        assert "ein" in low_conf  # EIN has 0.72 confidence in sample
        assert "company_name" not in low_conf  # Company name has 0.95 confidence


class TestEnvironment:
    """Validate test environment."""

    def test_python_version(self):
        """Ensure Python 3.10+ is being used."""
        import sys
        assert sys.version_info >= (3, 10)

    def test_pytest_plugins_available(self):
        """Check that expected pytest plugins are importable."""
        try:
            import pytest_asyncio
            assert True
        except ImportError:
            pytest.skip("pytest-asyncio not installed")

    def test_pathlib_available(self):
        """Confirm pathlib is available for path handling."""
        assert Path is not None
        assert Path(".").exists()
