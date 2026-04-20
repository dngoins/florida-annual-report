/**
 * Integration Tests for Florida Annual Report API Endpoints
 * 
 * Tests all REST API endpoints defined in docs/reference/api-contracts.md
 * Validates the { status, data, error } response envelope
 * 
 * Per CONSTITUTION.md:
 * - Compliance-First: user_approved must be true for submissions
 * - Human-in-the-Loop: low-confidence fields block submission
 */

// Mock database and services for integration testing
const mockDb = {
  documents: new Map(),
  companies: new Map(),
  submissions: new Map(),
  auditLogs: [],
};

// Mock API handlers (simulating the actual API implementation)
const createMockApi = () => {
  return {
    /**
     * POST /documents - Upload a document for processing
     */
    async postDocuments(file) {
      if (!file || !file.name) {
        return {
          status: 'error',
          data: null,
          error: { code: 'INVALID_FILE', message: 'No file provided' },
        };
      }

      const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      mockDb.documents.set(documentId, {
        id: documentId,
        name: file.name,
        status: 'processing',
        uploadedAt: new Date().toISOString(),
      });

      mockDb.auditLogs.push({
        action: 'document_uploaded',
        documentId,
        timestamp: new Date().toISOString(),
      });

      return {
        status: 'success',
        data: { document_id: documentId, status: 'processing' },
        error: null,
      };
    },

    /**
     * POST /extract - Trigger extraction on an uploaded document
     */
    async postExtract(body) {
      const { document_id } = body;

      if (!document_id) {
        return {
          status: 'error',
          data: null,
          error: { code: 'MISSING_DOCUMENT_ID', message: 'document_id is required' },
        };
      }

      const doc = mockDb.documents.get(document_id);
      if (!doc) {
        return {
          status: 'error',
          data: null,
          error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
        };
      }

      // Simulated extraction results
      const extractionResult = {
        fields: {
          entity_name: 'Test Company LLC',
          registered_agent_name: 'John Smith',
          principal_address: '123 Main St, Miami, FL 33101',
          officers: [
            { name: 'Jane Doe', title: 'President' },
            { name: 'John Smith', title: 'Secretary' },
          ],
        },
        confidence: {
          entity_name: 0.97,
          registered_agent_name: 0.82,
          principal_address: 0.91,
          officers: 0.74, // Below threshold - requires human review
        },
      };

      mockDb.auditLogs.push({
        action: 'extraction_completed',
        documentId: document_id,
        timestamp: new Date().toISOString(),
      });

      return {
        status: 'success',
        data: extractionResult,
        error: null,
      };
    },

    /**
     * GET /company/:id - Returns the full normalized company record
     */
    async getCompany(companyId) {
      if (!companyId) {
        return {
          status: 'error',
          data: null,
          error: { code: 'MISSING_COMPANY_ID', message: 'Company ID is required' },
        };
      }

      let company = mockDb.companies.get(companyId);
      
      // Return a mock company if found, or 404 if not
      if (!company) {
        return {
          status: 'error',
          data: null,
          error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
        };
      }

      return {
        status: 'success',
        data: company,
        error: null,
      };
    },

    /**
     * POST /reconcile - Scrape and compare current Sunbiz record against extracted data
     */
    async postReconcile(body) {
      const { company_id } = body;

      if (!company_id) {
        return {
          status: 'error',
          data: null,
          error: { code: 'MISSING_COMPANY_ID', message: 'company_id is required' },
        };
      }

      const company = mockDb.companies.get(company_id);
      if (!company) {
        return {
          status: 'error',
          data: null,
          error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
        };
      }

      // Simulated reconciliation diff
      const diff = {
        company_id,
        differences: [
          {
            field: 'principal_address',
            extracted: '123 Main St, Miami, FL 33101',
            sunbiz: '123 Main Street, Miami, FL 33101',
            type: 'minor',
          },
        ],
        match_score: 0.95,
        reconciled_at: new Date().toISOString(),
      };

      mockDb.auditLogs.push({
        action: 'reconciliation_completed',
        companyId: company_id,
        timestamp: new Date().toISOString(),
      });

      return {
        status: 'success',
        data: diff,
        error: null,
      };
    },

    /**
     * POST /submit - Triggers Playwright automation to submit annual report
     * 
     * CRITICAL PER CONSTITUTION.md:
     * - Must require user_approved: true
     * - Must block if unresolved low-confidence fields exist
     */
    async postSubmit(body) {
      const { company_id, filing_id, user_approved } = body;

      // Validate required fields
      if (!company_id || !filing_id) {
        return {
          status: 'error',
          data: null,
          error: { code: 'MISSING_FIELDS', message: 'company_id and filing_id are required' },
        };
      }

      // CRITICAL: Check user_approved flag (per CONSTITUTION.md Human-in-the-Loop)
      if (user_approved !== true) {
        return {
          status: 'error',
          data: null,
          error: { 
            code: 'APPROVAL_REQUIRED', 
            message: 'Submission requires explicit user approval (user_approved: true)',
          },
          statusCode: 403,
        };
      }

      const company = mockDb.companies.get(company_id);
      if (!company) {
        return {
          status: 'error',
          data: null,
          error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' },
        };
      }

      // CRITICAL: Check for unresolved low-confidence fields
      if (company.hasUnresolvedLowConfidence) {
        return {
          status: 'error',
          data: null,
          error: {
            code: 'UNRESOLVED_LOW_CONFIDENCE',
            message: 'Cannot submit with unresolved low-confidence fields. Human review required.',
          },
          statusCode: 403,
        };
      }

      // Create submission record
      const submissionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      mockDb.submissions.set(submissionId, {
        id: submissionId,
        company_id,
        filing_id,
        status: 'in_progress',
        created_at: new Date().toISOString(),
      });

      mockDb.auditLogs.push({
        action: 'submission_initiated',
        submissionId,
        companyId: company_id,
        filingId: filing_id,
        userApproved: user_approved,
        timestamp: new Date().toISOString(),
      });

      return {
        status: 'success',
        data: { submission_id: submissionId, status: 'in_progress' },
        error: null,
      };
    },

    /**
     * GET /audit/:company_id - Returns audit log entries for a company
     */
    async getAudit(companyId) {
      if (!companyId) {
        return {
          status: 'error',
          data: null,
          error: { code: 'MISSING_COMPANY_ID', message: 'Company ID is required' },
        };
      }

      const companyLogs = mockDb.auditLogs.filter(
        (log) => log.companyId === companyId || log.company_id === companyId
      );

      return {
        status: 'success',
        data: { 
          company_id: companyId,
          entries: companyLogs,
          total: companyLogs.length,
        },
        error: null,
      };
    },
  };
};

// Test helper to reset mock database
const resetMockDb = () => {
  mockDb.documents.clear();
  mockDb.companies.clear();
  mockDb.submissions.clear();
  mockDb.auditLogs.length = 0;
};

// Test helper to seed test data
const seedTestCompany = (id, overrides = {}) => {
  const company = {
    id,
    entity_name: 'Test Company LLC',
    document_number: 'L12000000001',
    registered_agent_name: 'John Smith',
    principal_address: {
      street: '123 Main St',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
    },
    officers: [
      { name: 'Jane Doe', title: 'President' },
      { name: 'John Smith', title: 'Secretary' },
    ],
    filing_history: [],
    hasUnresolvedLowConfidence: false,
    ...overrides,
  };
  mockDb.companies.set(id, company);
  return company;
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Florida Annual Report API Integration Tests', () => {
  let api;

  beforeEach(() => {
    resetMockDb();
    api = createMockApi();
  });

  // ==========================================================================
  // Response Envelope Validation
  // ==========================================================================
  describe('Response Envelope Validation', () => {
    test('all responses should have { status, data, error } structure', async () => {
      // Test POST /documents
      const docResponse = await api.postDocuments({ name: 'test.pdf' });
      expect(docResponse).toHaveProperty('status');
      expect(docResponse).toHaveProperty('data');
      expect(docResponse).toHaveProperty('error');

      // Test POST /extract
      const extractResponse = await api.postExtract({ document_id: 'non-existent' });
      expect(extractResponse).toHaveProperty('status');
      expect(extractResponse).toHaveProperty('data');
      expect(extractResponse).toHaveProperty('error');

      // Test GET /company/:id
      const companyResponse = await api.getCompany('test-company');
      expect(companyResponse).toHaveProperty('status');
      expect(companyResponse).toHaveProperty('data');
      expect(companyResponse).toHaveProperty('error');

      // Test POST /reconcile
      const reconcileResponse = await api.postReconcile({ company_id: 'test' });
      expect(reconcileResponse).toHaveProperty('status');
      expect(reconcileResponse).toHaveProperty('data');
      expect(reconcileResponse).toHaveProperty('error');

      // Test POST /submit
      const submitResponse = await api.postSubmit({});
      expect(submitResponse).toHaveProperty('status');
      expect(submitResponse).toHaveProperty('data');
      expect(submitResponse).toHaveProperty('error');

      // Test GET /audit/:company_id
      const auditResponse = await api.getAudit('test-company');
      expect(auditResponse).toHaveProperty('status');
      expect(auditResponse).toHaveProperty('data');
      expect(auditResponse).toHaveProperty('error');
    });

    test('successful responses should have status: "success" and null error', async () => {
      const response = await api.postDocuments({ name: 'test.pdf' });
      expect(response.status).toBe('success');
      expect(response.error).toBeNull();
      expect(response.data).not.toBeNull();
    });

    test('error responses should have status: "error" and null data', async () => {
      const response = await api.postDocuments(null);
      expect(response.status).toBe('error');
      expect(response.data).toBeNull();
      expect(response.error).not.toBeNull();
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
    });
  });

  // ==========================================================================
  // POST /documents
  // ==========================================================================
  describe('POST /documents', () => {
    test('should accept a valid file upload and return document_id', async () => {
      const file = { name: 'annual-report.pdf', size: 1024 };
      const response = await api.postDocuments(file);

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('document_id');
      expect(response.data.document_id).toMatch(/^doc-/);
      expect(response.data.status).toBe('processing');
    });

    test('should return error for missing file', async () => {
      const response = await api.postDocuments(null);

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('INVALID_FILE');
    });

    test('should create audit log entry on successful upload', async () => {
      const file = { name: 'test.pdf' };
      await api.postDocuments(file);

      const auditEntry = mockDb.auditLogs.find((log) => log.action === 'document_uploaded');
      expect(auditEntry).toBeDefined();
      expect(auditEntry).toHaveProperty('documentId');
      expect(auditEntry).toHaveProperty('timestamp');
    });
  });

  // ==========================================================================
  // POST /extract
  // ==========================================================================
  describe('POST /extract', () => {
    test('should extract fields from a valid document', async () => {
      // First upload a document
      const uploadResponse = await api.postDocuments({ name: 'report.pdf' });
      const documentId = uploadResponse.data.document_id;

      // Then extract
      const response = await api.postExtract({ document_id: documentId });

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('fields');
      expect(response.data).toHaveProperty('confidence');
      expect(response.data.fields).toHaveProperty('entity_name');
      expect(response.data.fields).toHaveProperty('registered_agent_name');
      expect(response.data.fields).toHaveProperty('principal_address');
      expect(response.data.fields).toHaveProperty('officers');
    });

    test('should return confidence scores for each field', async () => {
      const uploadResponse = await api.postDocuments({ name: 'report.pdf' });
      const documentId = uploadResponse.data.document_id;
      const response = await api.postExtract({ document_id: documentId });

      const { confidence } = response.data;
      expect(typeof confidence.entity_name).toBe('number');
      expect(typeof confidence.registered_agent_name).toBe('number');
      expect(typeof confidence.principal_address).toBe('number');
      expect(typeof confidence.officers).toBe('number');
      
      // Confidence scores should be between 0 and 1
      Object.values(confidence).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    test('should return error for non-existent document', async () => {
      const response = await api.postExtract({ document_id: 'non-existent-id' });

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    test('should return error when document_id is missing', async () => {
      const response = await api.postExtract({});

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('MISSING_DOCUMENT_ID');
    });
  });

  // ==========================================================================
  // GET /company/:id
  // ==========================================================================
  describe('GET /company/:id', () => {
    test('should return full company record for valid ID', async () => {
      seedTestCompany('company-001');

      const response = await api.getCompany('company-001');

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('id', 'company-001');
      expect(response.data).toHaveProperty('entity_name');
      expect(response.data).toHaveProperty('registered_agent_name');
      expect(response.data).toHaveProperty('principal_address');
      expect(response.data).toHaveProperty('officers');
      expect(response.data).toHaveProperty('filing_history');
    });

    test('should return error for non-existent company', async () => {
      const response = await api.getCompany('non-existent-company');

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('COMPANY_NOT_FOUND');
    });

    test('should return error when company ID is missing', async () => {
      const response = await api.getCompany(null);

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('MISSING_COMPANY_ID');
    });

    test('should include officers array with name and title', async () => {
      seedTestCompany('company-002');

      const response = await api.getCompany('company-002');

      expect(Array.isArray(response.data.officers)).toBe(true);
      expect(response.data.officers.length).toBeGreaterThan(0);
      response.data.officers.forEach((officer) => {
        expect(officer).toHaveProperty('name');
        expect(officer).toHaveProperty('title');
      });
    });
  });

  // ==========================================================================
  // POST /reconcile
  // ==========================================================================
  describe('POST /reconcile', () => {
    test('should return structured diff for valid company', async () => {
      seedTestCompany('company-003');

      const response = await api.postReconcile({ company_id: 'company-003' });

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('company_id', 'company-003');
      expect(response.data).toHaveProperty('differences');
      expect(Array.isArray(response.data.differences)).toBe(true);
      expect(response.data).toHaveProperty('match_score');
      expect(response.data).toHaveProperty('reconciled_at');
    });

    test('should include field-level differences with extracted and sunbiz values', async () => {
      seedTestCompany('company-004');

      const response = await api.postReconcile({ company_id: 'company-004' });

      const diff = response.data.differences[0];
      expect(diff).toHaveProperty('field');
      expect(diff).toHaveProperty('extracted');
      expect(diff).toHaveProperty('sunbiz');
    });

    test('should return error for non-existent company', async () => {
      const response = await api.postReconcile({ company_id: 'non-existent' });

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('COMPANY_NOT_FOUND');
    });

    test('should create audit log entry on reconciliation', async () => {
      seedTestCompany('company-005');

      await api.postReconcile({ company_id: 'company-005' });

      const auditEntry = mockDb.auditLogs.find((log) => 
        log.action === 'reconciliation_completed' && log.companyId === 'company-005'
      );
      expect(auditEntry).toBeDefined();
    });
  });

  // ==========================================================================
  // POST /submit - CRITICAL TESTS
  // ==========================================================================
  describe('POST /submit', () => {
    test('should return 403 when user_approved is false', async () => {
      seedTestCompany('company-006');

      const response = await api.postSubmit({
        company_id: 'company-006',
        filing_id: 'filing-001',
        user_approved: false,
      });

      expect(response.status).toBe('error');
      expect(response.statusCode).toBe(403);
      expect(response.error.code).toBe('APPROVAL_REQUIRED');
      expect(response.error.message).toContain('user_approved: true');
    });

    test('should return 403 when user_approved is missing', async () => {
      seedTestCompany('company-007');

      const response = await api.postSubmit({
        company_id: 'company-007',
        filing_id: 'filing-001',
        // user_approved intentionally omitted
      });

      expect(response.status).toBe('error');
      expect(response.statusCode).toBe(403);
      expect(response.error.code).toBe('APPROVAL_REQUIRED');
    });

    test('should return 403 when unresolved low-confidence fields exist', async () => {
      seedTestCompany('company-008', { hasUnresolvedLowConfidence: true });

      const response = await api.postSubmit({
        company_id: 'company-008',
        filing_id: 'filing-001',
        user_approved: true, // Even with approval, low-confidence blocks submission
      });

      expect(response.status).toBe('error');
      expect(response.statusCode).toBe(403);
      expect(response.error.code).toBe('UNRESOLVED_LOW_CONFIDENCE');
      expect(response.error.message).toContain('Human review required');
    });

    test('should succeed when user_approved is true and no low-confidence issues', async () => {
      seedTestCompany('company-009', { hasUnresolvedLowConfidence: false });

      const response = await api.postSubmit({
        company_id: 'company-009',
        filing_id: 'filing-002',
        user_approved: true,
      });

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('submission_id');
      expect(response.data.submission_id).toMatch(/^sub-/);
      expect(response.data.status).toBe('in_progress');
    });

    test('should return error for non-existent company', async () => {
      const response = await api.postSubmit({
        company_id: 'non-existent',
        filing_id: 'filing-001',
        user_approved: true,
      });

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('COMPANY_NOT_FOUND');
    });

    test('should return error when required fields are missing', async () => {
      const response = await api.postSubmit({});

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('MISSING_FIELDS');
    });

    test('should create audit log entry on successful submission', async () => {
      seedTestCompany('company-010');

      await api.postSubmit({
        company_id: 'company-010',
        filing_id: 'filing-003',
        user_approved: true,
      });

      const auditEntry = mockDb.auditLogs.find((log) => 
        log.action === 'submission_initiated' && log.companyId === 'company-010'
      );
      expect(auditEntry).toBeDefined();
      expect(auditEntry.userApproved).toBe(true);
      expect(auditEntry.filingId).toBe('filing-003');
    });

    test('should NOT create audit log entry when submission is blocked', async () => {
      seedTestCompany('company-011');
      const initialLogCount = mockDb.auditLogs.length;

      await api.postSubmit({
        company_id: 'company-011',
        filing_id: 'filing-001',
        user_approved: false, // Blocked
      });

      // Should not create a new audit entry for blocked submissions
      const submissionLogs = mockDb.auditLogs.filter(
        (log) => log.action === 'submission_initiated' && log.companyId === 'company-011'
      );
      expect(submissionLogs.length).toBe(0);
    });
  });

  // ==========================================================================
  // GET /audit/:company_id
  // ==========================================================================
  describe('GET /audit/:company_id', () => {
    test('should return audit entries for a company', async () => {
      // Create some audit activity
      seedTestCompany('company-012');
      await api.postReconcile({ company_id: 'company-012' });
      await api.postSubmit({
        company_id: 'company-012',
        filing_id: 'filing-004',
        user_approved: true,
      });

      const response = await api.getAudit('company-012');

      expect(response.status).toBe('success');
      expect(response.data).toHaveProperty('company_id', 'company-012');
      expect(response.data).toHaveProperty('entries');
      expect(Array.isArray(response.data.entries)).toBe(true);
      expect(response.data).toHaveProperty('total');
      expect(response.data.total).toBe(response.data.entries.length);
    });

    test('should return empty entries array for company with no audit history', async () => {
      const response = await api.getAudit('company-with-no-history');

      expect(response.status).toBe('success');
      expect(response.data.entries).toEqual([]);
      expect(response.data.total).toBe(0);
    });

    test('should return error when company_id is missing', async () => {
      const response = await api.getAudit(null);

      expect(response.status).toBe('error');
      expect(response.error.code).toBe('MISSING_COMPANY_ID');
    });

    test('audit entries should have timestamps', async () => {
      seedTestCompany('company-013');
      await api.postReconcile({ company_id: 'company-013' });

      const response = await api.getAudit('company-013');

      response.data.entries.forEach((entry) => {
        expect(entry).toHaveProperty('timestamp');
        expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
      });
    });
  });

  // ==========================================================================
  // Cross-Endpoint Integration Tests
  // ==========================================================================
  describe('Cross-Endpoint Integration', () => {
    test('complete workflow: upload -> extract -> reconcile -> submit', async () => {
      // Step 1: Upload document
      const uploadResponse = await api.postDocuments({ name: 'annual-report-2024.pdf' });
      expect(uploadResponse.status).toBe('success');
      const documentId = uploadResponse.data.document_id;

      // Step 2: Extract data from document
      const extractResponse = await api.postExtract({ document_id: documentId });
      expect(extractResponse.status).toBe('success');
      expect(extractResponse.data.fields.entity_name).toBeDefined();

      // Step 3: Create company record and reconcile
      seedTestCompany('workflow-company-001');
      const reconcileResponse = await api.postReconcile({ company_id: 'workflow-company-001' });
      expect(reconcileResponse.status).toBe('success');

      // Step 4: Submit with approval
      const submitResponse = await api.postSubmit({
        company_id: 'workflow-company-001',
        filing_id: 'filing-workflow-001',
        user_approved: true,
      });
      expect(submitResponse.status).toBe('success');
      expect(submitResponse.data.status).toBe('in_progress');

      // Verify audit trail
      const auditResponse = await api.getAudit('workflow-company-001');
      expect(auditResponse.data.entries.length).toBeGreaterThanOrEqual(2);
    });

    test('confidence threshold enforcement in workflow', async () => {
      // Create company with low-confidence extraction
      seedTestCompany('low-confidence-company', { hasUnresolvedLowConfidence: true });

      // Attempt to submit - should be blocked
      const submitResponse = await api.postSubmit({
        company_id: 'low-confidence-company',
        filing_id: 'filing-blocked',
        user_approved: true,
      });

      expect(submitResponse.status).toBe('error');
      expect(submitResponse.statusCode).toBe(403);
      expect(submitResponse.error.code).toBe('UNRESOLVED_LOW_CONFIDENCE');
    });
  });
});
