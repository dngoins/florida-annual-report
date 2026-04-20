-- Migration: 003_create_filings_table.sql
-- Description: Creates the filings table for tracking annual report filing records
-- AzureSQL compatible

-- Create filings table
CREATE TABLE filings (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    year INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    submitted_at DATETIME2 NULL,
    confirmation_number NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Foreign key to companies table
    CONSTRAINT FK_filings_company_id FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE,
    
    -- Status must be one of the allowed values
    CONSTRAINT CK_filings_status CHECK (status IN ('pending', 'submitted', 'confirmed', 'rejected')),
    
    -- Only one filing per company per year
    CONSTRAINT UQ_filings_company_year UNIQUE (company_id, year)
);

-- Index on company_id for fast joins
CREATE INDEX IX_filings_company_id ON filings(company_id);

-- Index on status for filtering by status
CREATE INDEX IX_filings_status ON filings(status);

-- Index on year for filtering by year
CREATE INDEX IX_filings_year ON filings(year);

-- Composite index for common query patterns
CREATE INDEX IX_filings_year_status ON filings(year, status);

-- Index on confirmation_number for lookups
CREATE INDEX IX_filings_confirmation_number ON filings(confirmation_number) WHERE confirmation_number IS NOT NULL;

GO

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER TR_filings_updated_at
ON filings
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE filings
    SET updated_at = GETUTCDATE()
    FROM filings f
    INNER JOIN inserted i ON f.id = i.id;
END;
GO
