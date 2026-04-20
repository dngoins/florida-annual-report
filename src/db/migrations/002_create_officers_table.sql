-- Migration: 002_create_officers_table.sql
-- Description: Creates the officers table for storing company officer/director information
-- AzureSQL compatible

-- Create officers table
CREATE TABLE officers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    name NVARCHAR(255) NOT NULL,
    title NVARCHAR(100) NOT NULL,
    address NVARCHAR(500),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Foreign key to companies table
    CONSTRAINT FK_officers_company_id FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE
);

-- Index on company_id for fast joins
CREATE INDEX IX_officers_company_id ON officers(company_id);

-- Composite index for company + title lookups
CREATE INDEX IX_officers_company_title ON officers(company_id, title);

-- Index on name for search queries
CREATE INDEX IX_officers_name ON officers(name);

GO

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER TR_officers_updated_at
ON officers
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE officers
    SET updated_at = GETUTCDATE()
    FROM officers o
    INNER JOIN inserted i ON o.id = i.id;
END;
GO
