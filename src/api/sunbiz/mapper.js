/**
 * Map the flat extracted fields (snake_case strings) produced by the
 * extraction service into the structured shape FillAnnualReport /
 * the submission engine expects.
 *
 * Extraction output (example):
 *   {
 *     entity_name: 'THOTHPRIME ...',
 *     principal_address: '1440 CORAL RIDGE DR STE 454, CORAL SPRINGS, FL 33071',
 *     mailing_address: 'PO BOX 741913 BOYNTON BEACH, FL 33474',
 *     registered_agent_name: 'JANET GOINS',
 *     officers: [{ title, name, address }, ...]
 *   }
 *
 * Sunbiz shape (target):
 *   {
 *     documentNumber, entityName,
 *     principalAddress:  { streetAddress, city, state, zipCode },
 *     mailingAddress:    { streetAddress, city, state, zipCode },
 *     registeredAgent:   { name, streetAddress, city, state, zipCode },
 *     officers:          [{ title, name, address }],
 *     signature
 *   }
 *
 * @module sunbiz/mapper
 */

/**
 * Parse a single-line US address into structured parts.
 * Tolerates Florida-style flat strings like:
 *   "1440 CORAL RIDGE DR STE 454, CORAL SPRINGS, FL 33071"
 *   "PO BOX 741913 BOYNTON BEACH, FL. 33474"
 *
 * Returns { streetAddress, city, state, zipCode }. Any field that can't be
 * parsed is returned as ''.
 */
function parseFlatAddress(input) {
  const empty = { streetAddress: '', city: '', state: '', zipCode: '' };
  if (!input || typeof input !== 'string') return empty;

  const raw = input.replace(/\s+/g, ' ').trim();
  // Pull ZIP code off the end (5 or 5-4).
  const zipMatch = raw.match(/\b(\d{5}(?:-\d{4})?)\b\s*$/);
  const zipCode = zipMatch ? zipMatch[1] : '';
  let rest = zipMatch ? raw.slice(0, zipMatch.index).trim() : raw;

  // Strip trailing punctuation (e.g. "FL.").
  rest = rest.replace(/[.,\s]+$/g, '');

  // State (2-letter abbreviation or "Florida"/"FL.") at the end.
  let state = '';
  const stateMatch = rest.match(/(?:,?\s*)\b(FL|FLA|FLORIDA|[A-Z]{2})\.?\s*$/i);
  if (stateMatch) {
    state = stateMatch[1].toUpperCase().replace(/^FLORIDA$|^FLA$/, 'FL');
    rest = rest.slice(0, stateMatch.index).trim().replace(/[.,]+$/g, '');
  }

  // Split remaining on commas; last comma-segment is the city, the rest joined is street.
  let streetAddress = '';
  let city = '';
  if (rest.includes(',')) {
    const parts = rest.split(',').map((s) => s.trim()).filter(Boolean);
    city = parts.pop() || '';
    streetAddress = parts.join(', ');
  } else {
    // No commas — try to split off a trailing all-caps city name (2-3 words).
    const m = rest.match(/^(.*?)\s+([A-Z][A-Z\s]{2,})$/);
    if (m) {
      streetAddress = m[1].trim();
      city = m[2].trim();
    } else {
      streetAddress = rest;
    }
  }

  return { streetAddress, city, state, zipCode };
}

/**
 * Map extracted fields → Sunbiz form input shape.
 *
 * @param {Object} extracted     - Output from the extraction service.
 * @param {Object} [overrides]   - User-supplied values (document number,
 *                                 signature, etc.) that aren't in the
 *                                 extracted data.
 */
function mapExtractedToSunbiz(extracted, overrides = {}) {
  const f = extracted || {};
  const principalAddress = parseFlatAddress(f.principal_address);
  const mailingAddress = parseFlatAddress(f.mailing_address);
  // Registered agent address is rarely separable from the agent name in our
  // current extraction; default to the principal address when missing.
  const agentAddress = parseFlatAddress(f.registered_agent_address || f.principal_address);

  return {
    documentNumber: overrides.documentNumber || '',
    entityName: f.entity_name || '',
    principalAddress,
    mailingAddress,
    registeredAgent: {
      name: f.registered_agent_name || '',
      ...agentAddress,
    },
    officers: Array.isArray(f.officers)
      ? f.officers.map((o) => ({
          title: o.title || '',
          name: o.name || '',
          address: o.address || '',
        }))
      : [],
    signature: overrides.signature || '',
  };
}

module.exports = { mapExtractedToSunbiz, parseFlatAddress };
