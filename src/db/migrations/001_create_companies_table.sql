-- Migration: 001_create_companies_table.sql
-- Description: Creates the companies table for storing entity information
-- AzureSQL compatible

-- Create companies table
CREATE TABLE companies (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    entity_name NVARCHAR(255) NOT NULL,
    document_number NVARCHAR(50) NOT NULL UNIQUE,
    principal_address NVARCHAR(500),
    mailing_address NVARCHAR(500),
    registered_agent_name NVARCHAR(255),
    registered_agent_address NVARCHAR(500),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Index on document_number for fast lookups (already unique, but explicit)
CREATE INDEX IX_companies_document_number ON companies(document_number);

-- Index on entity_name for search queries
CREATE INDEX IX_companies_entity_name ON companies(entity_name);

-- Index on created_at for time-based queries
CREATE INDEX IX_companies_created_at ON companies(created_at);

GO

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER TR_companies_updated_at
ON companies
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE companies
    SET updated_at = GETUTCDATE()
    FROM companies c
    INNER JOIN inserted i ON c.id = i.id;
END;
GO
