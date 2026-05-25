/**
 * Sunbiz client facade.
 *
 * Currently delegates to the mock client. The real Playwright-based
 * scraper will live alongside this module and be selected when
 * SUNBIZ_MOCK is explicitly set to "0".
 *
 * @module sunbiz/client
 */

const mockClient = require('./mockClient');

const USE_MOCK = process.env.SUNBIZ_MOCK !== '0';

async function lookupByDocumentNumber(documentNumber) {
  if (USE_MOCK) return mockClient.lookupByDocumentNumber(documentNumber);
  return {
    found: false,
    error: 'Live Sunbiz scraping is not implemented yet. Set SUNBIZ_MOCK=1 to use canned data.',
  };
}

async function searchByName(entityName) {
  if (USE_MOCK) return mockClient.searchByName(entityName);
  return {
    found: false,
    error: 'Live Sunbiz scraping is not implemented yet. Set SUNBIZ_MOCK=1 to use canned data.',
  };
}

module.exports = { lookupByDocumentNumber, searchByName };
