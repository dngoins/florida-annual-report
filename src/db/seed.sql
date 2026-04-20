-- Seed Data: Sample test data for one company
-- This file creates sample data for development and testing purposes
-- Run AFTER all migrations have been applied

-- ============================================================================
-- Sample Company: Acme Corporation
-- ============================================================================

DECLARE @company_id UNIQUEIDENTIFIER = NEWID();
DECLARE @filing_id UNIQUEIDENTIFIER = NEWID();
DECLARE @submission_id UNIQUEIDENTIFIER = NEWID();
DECLARE @user_id UNIQUEIDENTIFIER = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'; -- Sample user ID

-- Insert sample company
INSERT INTO companies (id, entity_name, document_number, principal_address, mailing_address, registered_agent_name, registered_agent_address)
VALUES (
    @company_id,
    'ACME CORPORATION',
    'P12345678',
    '123 MAIN STREET, SUITE 100, MIAMI, FL 33101-1234',
    '123 MAIN STREET, SUITE 100, MIAMI, FL 33101-1234',
    'JOHN DOE',
    '456 LEGAL AVENUE, MIAMI, FL 33102-5678'
);

-- Insert sample officers
INSERT INTO officers (company_id, name, title, address)
VALUES 
    (@company_id, 'JANE SMITH', 'President', '789 EXECUTIVE DRIVE, MIAMI, FL 33103'),
    (@company_id, 'JOHN DOE', 'Secretary', '456 LEGAL AVENUE, MIAMI, FL 33102-5678'),
    (@company_id, 'ALICE JOHNSON', 'Treasurer', '321 FINANCE BLVD, MIAMI, FL 33104'),
    (@company_id, 'BOB WILLIAMS', 'Director', '555 BOARD STREET, MIAMI, FL 33105');

-- Insert sample filing for current year
INSERT INTO filings (id, company_id, year, status)
VALUES (
    @filing_id,
    @company_id,
    YEAR(GETUTCDATE()),
    'pending'
);

-- Insert sample submission attempt (not yet approved)
INSERT INTO submissions (id, filing_id, user_id, user_approved, attempt_number, status)
VALUES (
    @submission_id,
    @filing_id,
    @user_id,
    0, -- Not yet approved
    1,
    'pending'
);

-- Insert sample audit log entries
INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, before_state, after_state, ip_address, user_agent)
VALUES 
    -- Company created
    (
        @user_id,
        'CREATE',
        'company',
        @company_id,
        NULL,
        '{"entity_name":"ACME CORPORATION","document_number":"P12345678"}',
        '192.168.1.100',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ),
    -- Filing created
    (
        @user_id,
        'CREATE',
        'filing',
        @filing_id,
        NULL,
        '{"year":' + CAST(YEAR(GETUTCDATE()) AS NVARCHAR(4)) + ',"status":"pending"}',
        '192.168.1.100',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ),
    -- Submission attempt created
    (
        @user_id,
        'CREATE',
        'submission',
        @submission_id,
        NULL,
        '{"attempt_number":1,"status":"pending","user_approved":false}',
        '192.168.1.100',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

-- ============================================================================
-- Verification Queries
-- ============================================================================

PRINT 'Seed data inserted successfully. Running verification queries...';
PRINT '';

-- Verify company
SELECT 'Companies' AS TableName, COUNT(*) AS RecordCount FROM companies;

-- Verify officers
SELECT 'Officers' AS TableName, COUNT(*) AS RecordCount FROM officers;

-- Verify filings
SELECT 'Filings' AS TableName, COUNT(*) AS RecordCount FROM filings;

-- Verify submissions
SELECT 'Submissions' AS TableName, COUNT(*) AS RecordCount FROM submissions;

-- Verify audit logs
SELECT 'Audit Logs' AS TableName, COUNT(*) AS RecordCount FROM audit_logs;

PRINT '';
PRINT 'Seed data verification complete.';
