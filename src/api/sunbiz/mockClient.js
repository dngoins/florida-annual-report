/**
 * Mock Sunbiz client.
 *
 * Returns canned entity data without going out to the live Sunbiz site,
 * so the reconciliation flow can be developed and demoed offline.
 *
 * The mock deliberately introduces small mismatches so the diff UI has
 * something interesting to show:
 *   - mailing address ZIP differs by 1 digit
 *   - one officer (Director) has a different recorded address
 *
 * @module sunbiz/mockClient
 */

const MOCK_ENTITIES = {
  P25000065600: {
    documentNumber: 'P25000065600',
    entityName: 'THOTHPRIME ENGINEERING & DESIGN INSTITUTE INC',
    entityType: 'Florida Profit Corporation',
    status: 'Active',
    filingDate: '12/08/2025',
    lastEvent: 'INCORPORATION',
    lastEventDate: '12/08/2025',
    principalAddress: '1440 CORAL RIDGE DR STE 454, CORAL SPRINGS, FL 33071',
    mailingAddress: 'PO BOX 741913, BOYNTON BEACH, FL 33475',
    registeredAgent: {
      name: 'JANET GOINS',
      address: '1440 CORAL RIDGE DR STE 454, BOYNTON BEACH, FL 33071',
    },
    officers: [
      { title: 'President', name: 'DWIGHT GOINS', address: 'PO BOX 741913, BOYNTON BEACH, FL 33474' },
      { title: 'Vice President', name: 'JANET GOINS', address: 'PO BOX 741913, BOYNTON BEACH, FL 33474' },
      { title: 'Treasurer', name: 'DWIGHT GOINS', address: 'PO BOX 741913, BOYNTON BEACH, FL 33474' },
      { title: 'Secretary', name: 'JANET GOINS', address: 'PO BOX 741913, BOYNTON BEACH, FL 33474' },
      { title: 'Director', name: 'NESEERT GOINS', address: '500 ATLANTIC AVE, DELRAY BEACH, FL 33483' },
    ],
  },
  L99000099999: {
    documentNumber: 'L99000099999',
    entityName: 'SUNSHINE TECH SOLUTIONS LLC',
    entityType: 'Florida Limited Liability Company',
    status: 'Active',
    filingDate: '01/15/2024',
    principalAddress: '123 PALM BEACH BLVD STE 100, MIAMI, FL 33139',
    mailingAddress: 'PO BOX 4567, MIAMI, FL 33140',
    registeredAgent: {
      name: 'JOHN MICHAEL SMITH',
      address: '456 CORPORATE DR, TAMPA, FL 33601',
    },
    officers: [
      { title: 'President', name: 'SARAH ELIZABETH JOHNSON', address: '789 EXECUTIVE WAY, ORLANDO, FL 32801' },
      { title: 'Vice President', name: 'MICHAEL ROBERT CHEN', address: '321 INNOVATION LN, JACKSONVILLE, FL 32202' },
      { title: 'Secretary', name: 'AMANDA LYNN WILLIAMS', address: '555 BUSINESS PARK CIR, FORT LAUDERDALE, FL 33301' },
      { title: 'Treasurer', name: 'DAVID JAMES MARTINEZ', address: '888 COMMERCE ST, TALLAHASSEE, FL 32301' },
    ],
  },
};

async function lookupByDocumentNumber(documentNumber) {
  if (!documentNumber) {
    return { found: false, error: 'documentNumber is required' };
  }
  const key = String(documentNumber).toUpperCase().trim();
  const data = MOCK_ENTITIES[key];
  if (!data) {
    return { found: false, error: `No mock entity for ${key}` };
  }
  await new Promise((r) => setTimeout(r, 150));
  return { found: true, data };
}

async function searchByName(entityName) {
  if (!entityName) return { found: false, error: 'entityName is required' };
  const needle = entityName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const entity of Object.values(MOCK_ENTITIES)) {
    const hay = entity.entityName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (hay.includes(needle) || needle.includes(hay)) {
      await new Promise((r) => setTimeout(r, 150));
      return { found: true, data: entity };
    }
  }
  return { found: false, error: `No mock entity matches "${entityName}"` };
}

module.exports = { lookupByDocumentNumber, searchByName, MOCK_ENTITIES };
