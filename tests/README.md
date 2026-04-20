# Test Suite Documentation

This document describes the test structure and how to run tests for the Florida Annual Report Automation Platform.

> **Per CONSTITUTION.md Principle VI:** Tests are written before implementation (TDD).

---

## Test Structure

```
tests/
├── conftest.py          # Pytest shared fixtures
├── setup.js             # Jest global setup
├── README.md            # This file
├── unit/                # Fast, isolated tests
│   ├── smoke.test.js    # Jest smoke tests
│   └── test_smoke.py    # Pytest smoke tests
├── integration/         # Component interaction tests
│   └── .gitkeep
└── e2e/                 # Full workflow tests (browser automation)
    └── .gitkeep
```

---

## Test Types

### Unit Tests (`tests/unit/`)

- **Purpose:** Test individual functions/classes in isolation
- **Speed:** Fast (< 100ms per test)
- **Dependencies:** Mocked; no external services
- **Run frequency:** On every commit

### Integration Tests (`tests/integration/`)

- **Purpose:** Test interactions between components
- **Speed:** Moderate (may require database, APIs)
- **Dependencies:** May use test databases, mock services
- **Run frequency:** Before merge, in CI

### E2E Tests (`tests/e2e/`)

- **Purpose:** Verify complete user workflows
- **Speed:** Slow (uses Playwright browser automation)
- **Dependencies:** Full application stack
- **Run frequency:** Pre-release, nightly CI

---

## Running Tests

### Prerequisites

```bash
# Node.js dependencies
npm install

# Python dependencies
pip install -r requirements.txt
```

### Node.js (Jest)

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only e2e tests
npm run test:e2e

# Run with coverage report
npm run test:coverage

# Watch mode (re-run on file changes)
npm run test:watch
```

### Python (Pytest)

```bash
# Run all tests
pytest

# Run only unit tests
pytest tests/unit/

# Run only integration tests
pytest tests/integration/

# Run only e2e tests
pytest tests/e2e/

# Run with coverage
pytest --cov=src --cov-report=html

# Run with verbose output
pytest -v

# Run specific marker
pytest -m unit
pytest -m integration
pytest -m e2e
```

---

## Test Markers (Pytest)

Custom markers are defined in `pytest.ini`:

| Marker | Description |
|--------|-------------|
| `@pytest.mark.unit` | Unit tests (fast, isolated) |
| `@pytest.mark.integration` | Integration tests |
| `@pytest.mark.e2e` | End-to-end tests |
| `@pytest.mark.slow` | Slow tests (excluded from quick runs) |
| `@pytest.mark.extraction` | Document extraction pipeline tests |
| `@pytest.mark.sunbiz` | Sunbiz automation tests |

### Usage

```python
import pytest

@pytest.mark.unit
def test_my_function():
    assert my_function() == expected

@pytest.mark.integration
@pytest.mark.slow
def test_database_connection():
    # This test is both an integration test and slow
    pass
```

---

## Shared Fixtures (Pytest)

Common fixtures are defined in `tests/conftest.py`:

| Fixture | Description |
|---------|-------------|
| `project_root` | Path to repository root |
| `tests_dir` | Path to tests directory |
| `src_dir` | Path to src directory |
| `sample_company` | Mock company data |
| `sample_audit_entry` | Mock audit log entry |
| `sample_extraction_result` | Mock document extraction result |
| `confidence_threshold` | 0.75 threshold value |
| `filing_window` | Filing window dates |

### Usage

```python
def test_company_validation(sample_company):
    assert sample_company["document_number"].startswith("P")
```

---

## Test Utilities (Jest)

Global utilities are available via `global.testUtils` (defined in `tests/setup.js`):

| Utility | Description |
|---------|-------------|
| `CONFIDENCE_THRESHOLD` | 0.75 threshold value |
| `FILING_WINDOW` | Filing window date constants |
| `isWithinFilingWindow(date)` | Check if date is in filing window |
| `createMockAuditEntry(overrides)` | Generate mock audit entry |

### Usage

```javascript
test('example', () => {
  const { CONFIDENCE_THRESHOLD } = global.testUtils;
  expect(CONFIDENCE_THRESHOLD).toBe(0.75);
});
```

---

## Coverage Requirements

Per project standards, minimum coverage thresholds are:

- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

View coverage reports:

```bash
# Jest
npm run test:coverage
open coverage/lcov-report/index.html

# Pytest
pytest --cov=src --cov-report=html
open htmlcov/index.html
```

---

## Writing New Tests

### TDD Workflow

Per CONSTITUTION.md Principle VI:

1. **Write test first** - Define expected behavior
2. **Verify test fails** - Confirm test is valid
3. **Implement code** - Make test pass
4. **Refactor** - Clean up while keeping tests green

### Test Naming Conventions

**Jest:**
```javascript
describe('ComponentName', () => {
  describe('methodName', () => {
    test('should do something when condition', () => {});
    test('should throw error when invalid input', () => {});
  });
});
```

**Pytest:**
```python
class TestComponentName:
    def test_method_does_something_when_condition(self):
        pass
    
    def test_method_raises_error_when_invalid_input(self):
        pass
```

### Golden File Tests (Extraction Pipeline)

For extraction pipeline changes, use golden file tests:

```python
def test_extraction_matches_golden_file(golden_output):
    result = extract_document(test_input)
    assert result == golden_output
```

---

## CI Integration

Tests run automatically in GitHub Actions:

- **Unit tests:** On every push and PR
- **Integration tests:** On PR to main
- **E2E tests:** Nightly and pre-release

---

## Troubleshooting

### Jest tests fail to run

```bash
# Clear Jest cache
npx jest --clearCache

# Check Node version (requires 18+)
node --version
```

### Pytest tests fail to run

```bash
# Check Python version (requires 3.10+)
python --version

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Coverage not meeting threshold

```bash
# Generate detailed coverage report
npm run test:coverage
pytest --cov=src --cov-report=term-missing

# Identify uncovered lines and add tests
```
