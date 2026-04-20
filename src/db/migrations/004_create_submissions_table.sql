-- Migration: 004_create_submissions_table.sql
-- Description: Creates the submissions table for tracking Sunbiz submission attempts
-- AzureSQL compatible
-- 
-- IMPORTANT: This table enforces the CONSTITUTION.md requirement that
-- submissions require explicit user approval (user_approved = 1)

-- Create submissions table
CREATE TABLE submissions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    filing_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    user_approved BIT NOT NULL DEFAULT 0,
    attempt_number INT NOT NULL DEFAULT 1,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message NVARCHAR(MAX) NULL,
    screenshot_url NVARCHAR(500) NULL,
    submitted_at DATETIME2 NULL,
    completed_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Foreign key to filings table
    CONSTRAINT FK_submissions_filing_id FOREIGN KEY (filing_id)
        REFERENCES filings(id)
        ON DELETE CASCADE,
    
    -- Status must be one of the allowed values
    CONSTRAINT CK_submissions_status CHECK (status IN ('pending', 'in_progress', 'awaiting_captcha', 'awaiting_payment', 'completed', 'failed', 'escalated')),
    
    -- Maximum 3 retry attempts per filing (per CONSTITUTION.md)
    CONSTRAINT CK_submissions_attempt_number CHECK (attempt_number BETWEEN 1 AND 3)
);

-- Index on filing_id for fast joins
CREATE INDEX IX_submissions_filing_id ON submissions(filing_id);

-- Index on user_id for user-specific queries
CREATE INDEX IX_submissions_user_id ON submissions(user_id);

-- Index on status for filtering
CREATE INDEX IX_submissions_status ON submissions(status);

-- Index on created_at for time-based queries
CREATE INDEX IX_submissions_created_at ON submissions(created_at);

-- Composite index for finding user's pending submissions
CREATE INDEX IX_submissions_user_status ON submissions(user_id, status);

GO

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER TR_submissions_updated_at
ON submissions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE submissions
    SET updated_at = GETUTCDATE()
    FROM submissions s
    INNER JOIN inserted i ON s.id = i.id;
END;
GO

-- Trigger to enforce user_approved requirement before status can be 'in_progress' or beyond
-- This implements CONSTITUTION.md: "Submission to Sunbiz requires explicit user approval"
CREATE TRIGGER TR_submissions_require_approval
ON submissions
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Check if any inserted/updated row has a non-pending status without user approval
    IF EXISTS (
        SELECT 1 FROM inserted i
        WHERE i.status NOT IN ('pending', 'failed', 'escalated')
        AND i.user_approved = 0
    )
    BEGIN
        RAISERROR ('Cannot proceed with submission: user_approved must be true (CONSTITUTION.md requirement)', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO
