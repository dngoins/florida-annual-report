/**
 * Sunbiz value normalization helpers.
 *
 * Used by the diff engine so that two values that differ only in
 * whitespace, punctuation, casing, or trivial formatting are treated
 * as equal. We never mutate the original values — only the strings
 * used for comparison.
 *
 * @module sunbiz/normalize
 */

const STATE_ABBREV = {
  florida: 'FL',
  fla: 'FL',
};

function basicNormalize(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/g, '')
    .toLowerCase();
}

function normalizeName(value) {
  if (!value) return '';
  let v = basicNormalize(value);
  v = v.replace(
    /\s+(sec(retary)?|pres(ident)?|vp|vice|treas(urer)?|dir(ector)?|mgr|manager|ceo|cfo|coo|dr|mr|ms|mrs|jr|sr|phd|rabbah|madame|esq)\.?$/i,
    '',
  );
  v = v.replace(/\bincorporated\b/g, 'inc').replace(/\binc\.?$/g, 'inc');
  v = v.replace(/\bcorporation\b/g, 'corp').replace(/\bcorp\.?$/g, 'corp');
  v = v.replace(/\bcompany\b/g, 'co').replace(/\bco\.?$/g, 'co');
  v = v.replace(/\bl\.l\.c\.?\b/g, 'llc');
  return v.replace(/\s+/g, ' ').trim();
}

function normalizeAddress(value) {
  if (!value) return '';
  let v = basicNormalize(value);
  v = v.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const suffixes = [
    [/\bstreet\b/g, 'st'],
    [/\bavenue\b/g, 'ave'],
    [/\bboulevard\b/g, 'blvd'],
    [/\bdrive\b/g, 'dr'],
    [/\bplace\b/g, 'pl'],
    [/\bcircle\b/g, 'cir'],
    [/\bcourt\b/g, 'ct'],
    [/\broad\b/g, 'rd'],
    [/\blane\b/g, 'ln'],
    [/\bsuite\b/g, 'ste'],
    [/\bp\.?o\.?\s*box\b/g, 'po box'],
  ];
  for (const [re, repl] of suffixes) v = v.replace(re, repl);
  for (const [name, abbr] of Object.entries(STATE_ABBREV)) {
    v = v.replace(new RegExp(`\\b${name}\\b`, 'g'), abbr.toLowerCase());
  }
  v = v.replace(/\bfl\.\s*/g, 'fl ');
  v = v.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return v;
}

function equalsNormalized(a, b, normalizer = basicNormalize) {
  const na = normalizer(a);
  const nb = normalizer(b);
  if (!na && !nb) return true;
  return na === nb;
}

module.exports = {
  basicNormalize,
  normalizeName,
  normalizeAddress,
  equalsNormalized,
};
