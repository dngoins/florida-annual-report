# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **Test Framework Setup** (Issue #6)
  - Jest configuration for Node.js testing (`package.json`, `jest.config.js`)
  - Pytest configuration for Python testing (`requirements.txt`, `pytest.ini`)
  - Test directory structure: `tests/unit/`, `tests/integration/`, `tests/e2e/`
  - Shared fixtures in `tests/conftest.py` (Pytest) and `tests/setup.js` (Jest)
  - Jest smoke tests (`tests/unit/smoke.test.js`) validating project conventions
  - Pytest smoke tests (`tests/unit/test_smoke.py`) validating project conventions
  - Comprehensive test documentation in `tests/README.md`
  - npm scripts: `test`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`, `test:watch`
  - Pytest markers: `unit`, `integration`, `e2e`, `slow`, `extraction`, `sunbiz`
