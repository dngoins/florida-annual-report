/**
 * Sunbiz reconciliation diff engine.
 *
 * @module sunbiz/diff
 */

const { normalizeName, normalizeAddress, equalsNormalized } = require('./normalize');

const SCALAR_FIELDS = [
  { key: 'entity_name', label: 'Entity name', sunbizPath: 'entityName', normalizer: normalizeName },
  {
    key: 'registered_agent_name',
    label: 'Registered agent',
    sunbizPath: 'registeredAgent.name',
    normalizer: normalizeName,
  },
  {
    key: 'principal_address',
    label: 'Principal address',
    sunbizPath: 'principalAddress',
    normalizer: normalizeAddress,
  },
  {
    key: 'mailing_address',
    label: 'Mailing address',
    sunbizPath: 'mailingAddress',
    normalizer: normalizeAddress,
  },
];

function getPath(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, part) => (acc ? acc[part] : null), obj);
}

function diff(extracted, sunbiz) {
  const fields = [];

  for (const spec of SCALAR_FIELDS) {
    const extractedValue = extracted ? extracted[spec.key] ?? null : null;
    const sunbizValue = getPath(sunbiz, spec.sunbizPath) ?? null;
    let status;
    if (!extractedValue && !sunbizValue) status = 'match';
    else if (!extractedValue) status = 'missing_extracted';
    else if (!sunbizValue) status = 'missing_sunbiz';
    else status = equalsNormalized(extractedValue, sunbizValue, spec.normalizer)
      ? 'match'
      : 'mismatch';
    fields.push({
      field: spec.key,
      fieldLabel: spec.label,
      current_value: sunbizValue,
      extracted_value: extractedValue,
      status,
    });
  }

  const extractedOfficers = Array.isArray(extracted?.officers) ? extracted.officers : [];
  const sunbizOfficers = Array.isArray(sunbiz?.officers) ? sunbiz.officers : [];

  // Match on name + title (Florida entities frequently have the same person
  // in several officer roles, e.g. President AND Treasurer).
  const officerKey = (o) => `${normalizeName(o.name)}|${(o.title || '').toLowerCase().trim()}`;
  const sunbizPool = sunbizOfficers.map((o) => ({ o, key: officerKey(o), used: false }));

  const matched = [];
  const changed = [];
  const added = [];
  const removed = [];

  for (const ext of extractedOfficers) {
    const key = officerKey(ext);
    // Prefer an exact (name+title) match; fall back to first unused same-name record.
    let slot = sunbizPool.find((s) => !s.used && s.key === key);
    if (!slot) {
      const extName = normalizeName(ext.name);
      slot = sunbizPool.find((s) => !s.used && normalizeName(s.o.name) === extName);
    }
    if (!slot) {
      added.push(ext);
      continue;
    }
    slot.used = true;
    const sb = slot.o;
    const titleMatch = equalsNormalized(ext.title, sb.title);
    const addressMatch = equalsNormalized(ext.address, sb.address, normalizeAddress);
    if (titleMatch && addressMatch) {
      matched.push({ name: ext.name, title: ext.title, address: ext.address });
    } else {
      changed.push({
        name: ext.name,
        title: { extracted: ext.title, sunbiz: sb.title, match: titleMatch },
        address: { extracted: ext.address ?? null, sunbiz: sb.address ?? null, match: addressMatch },
      });
    }
  }
  for (const slot of sunbizPool) {
    if (!slot.used) removed.push(slot.o);
  }

  const matching = fields.filter((f) => f.status === 'match').length;
  const mismatched = fields.filter((f) => f.status === 'mismatch').length;
  const missing = fields.filter(
    (f) => f.status === 'missing_extracted' || f.status === 'missing_sunbiz',
  ).length;

  return {
    summary: {
      totalFields: fields.length,
      matchingFields: matching,
      mismatchedFields: mismatched,
      missingFields: missing,
      matchPercentage: fields.length
        ? Math.round((matching / fields.length) * 100)
        : 0,
      officersMatched: matched.length,
      officersChanged: changed.length,
      officersAdded: added.length,
      officersRemoved: removed.length,
    },
    fields,
    officers: { matched, changed, added, removed },
  };
}

module.exports = { diff, SCALAR_FIELDS };
