/**
 * Unit tests for the Sunbiz reconciliation diff engine.
 */

const { diff } = require('../../../src/api/sunbiz/diff');
const { normalizeName, normalizeAddress } = require('../../../src/api/sunbiz/normalize');

describe('sunbiz/normalize', () => {
  test('normalizeName strips trailing honorifics', () => {
    expect(normalizeName('JANET GOINS SEC')).toBe(normalizeName('Janet Goins'));
    expect(normalizeName('DWIGHT GOINS PHD.')).toBe(normalizeName('Dwight Goins'));
  });

  test('normalizeName treats Inc / Incorporated as equal', () => {
    expect(normalizeName('Thothprime Engineering Inc')).toBe(
      normalizeName('THOTHPRIME ENGINEERING INCORPORATED'),
    );
  });

  test('normalizeAddress collapses ST/STREET and FL./Florida', () => {
    expect(normalizeAddress('123 Palm Beach Boulevard, Miami, Florida 33139')).toBe(
      normalizeAddress('123 PALM BEACH BLVD, MIAMI, FL. 33139'),
    );
  });

  test('normalizeAddress collapses Suite / STE', () => {
    expect(normalizeAddress('1440 CORAL RIDGE DRIVE SUITE 454, CORAL SPRINGS, FL 33071')).toBe(
      normalizeAddress('1440 CORAL RIDGE DR STE 454, CORAL SPRINGS, FL 33071'),
    );
  });
});

describe('sunbiz/diff scalar fields', () => {
  const sunbiz = {
    entityName: 'ACME CORP',
    registeredAgent: { name: 'Jane Doe' },
    principalAddress: '123 MAIN ST, MIAMI, FL 33101',
    mailingAddress: 'PO BOX 9, MIAMI, FL 33101',
    officers: [],
  };

  test('returns match for identical normalized values', () => {
    const r = diff(
      {
        entity_name: 'Acme Corporation',
        registered_agent_name: 'JANE DOE',
        principal_address: '123 Main Street, Miami, Florida 33101',
        mailing_address: 'P.O. BOX 9, MIAMI, FL. 33101',
        officers: [],
      },
      sunbiz,
    );
    expect(r.summary.matchingFields).toBe(4);
    expect(r.summary.mismatchedFields).toBe(0);
    expect(r.summary.matchPercentage).toBe(100);
  });

  test('flags mismatches', () => {
    const r = diff(
      {
        entity_name: 'Acme Corp',
        registered_agent_name: 'John Smith',
        principal_address: '999 OTHER ST, MIAMI, FL 33101',
        mailing_address: 'PO BOX 9, MIAMI, FL 33101',
        officers: [],
      },
      sunbiz,
    );
    const mismatched = r.fields.filter((f) => f.status === 'mismatch');
    expect(mismatched.map((f) => f.field).sort()).toEqual([
      'principal_address',
      'registered_agent_name',
    ]);
  });

  test('flags missing extracted values', () => {
    const r = diff(
      { entity_name: null, principal_address: null, mailing_address: null, officers: [] },
      sunbiz,
    );
    expect(r.fields.find((f) => f.field === 'entity_name').status).toBe('missing_extracted');
  });
});

describe('sunbiz/diff officers', () => {
  test('matches officers by normalized name', () => {
    const sunbiz = {
      entityName: 'X',
      registeredAgent: { name: 'A' },
      principalAddress: '',
      mailingAddress: '',
      officers: [
        { title: 'President', name: 'DWIGHT GOINS', address: 'PO BOX 1, MIAMI, FL 33101' },
        { title: 'Director', name: 'NESEERT GOINS', address: '500 ATLANTIC AVE, DELRAY BEACH, FL 33483' },
      ],
    };
    const extracted = {
      entity_name: 'X',
      registered_agent_name: 'A',
      principal_address: '',
      mailing_address: '',
      officers: [
        { title: 'President', name: 'DWIGHT GOINS PHD.', address: 'P.O. BOX 1, MIAMI, FL 33101' },
        { title: 'Director', name: 'NESEERT GOINS', address: '1440 CORAL RIDGE DR, CORAL SPRINGS, FL 33071' },
        { title: 'Treasurer', name: 'NEW PERSON', address: 'somewhere' },
      ],
    };
    const r = diff(extracted, sunbiz);
    expect(r.officers.matched).toHaveLength(1);
    expect(r.officers.matched[0].name).toBe('DWIGHT GOINS PHD.');
    expect(r.officers.changed).toHaveLength(1);
    expect(r.officers.changed[0].name).toBe('NESEERT GOINS');
    expect(r.officers.changed[0].address.match).toBe(false);
    expect(r.officers.added).toHaveLength(1);
    expect(r.officers.added[0].name).toBe('NEW PERSON');
    expect(r.officers.removed).toHaveLength(0);
  });
});
