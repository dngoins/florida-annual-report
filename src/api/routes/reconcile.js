/**
 * Reconcile Route
 *
 * Compares extracted document fields against the live Sunbiz record.
 *
 * POST /reconcile
 *   Request body:
 *     {
 *       document_number?: string,
 *       entity_name?: string,
 *       extracted: {
 *         entity_name, registered_agent_name,
 *         principal_address, mailing_address,
 *         officers: [{ name, title, address }]
 *       }
 *     }
 *   At minimum, the request must include either `document_number` or
 *   `extracted.entity_name` so we can locate the Sunbiz record.
 *
 *   Response:
 *     { status: 'success' | 'not_found', sunbiz, extracted, diff }
 *
 * @module routes/reconcile
 */

const express = require('express');
const router = express.Router();

const client = require('../sunbiz/client');
const { diff } = require('../sunbiz/diff');

router.post('/', async (req, res, next) => {
  try {
    const { document_number: documentNumber, entity_name: entityName, extracted } = req.body || {};

    if (!extracted || typeof extracted !== 'object') {
      return res.error('extracted fields are required', 400);
    }
    if (!documentNumber && !entityName && !extracted.entity_name) {
      return res.error('document_number or entity_name is required', 400);
    }

    const lookup = documentNumber
      ? await client.lookupByDocumentNumber(documentNumber)
      : await client.searchByName(entityName || extracted.entity_name);

    if (!lookup.found) {
      return res.success({
        status: 'not_found',
        sunbiz: null,
        extracted,
        diff: null,
        error: lookup.error || 'Sunbiz record not found',
      });
    }

    const diffResult = diff(extracted, lookup.data);

    return res.success({
      status: 'success',
      sunbiz: lookup.data,
      extracted,
      diff: diffResult,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
