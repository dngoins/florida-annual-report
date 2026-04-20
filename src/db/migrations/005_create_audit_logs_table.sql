-- Migration: 005_create_audit_logs_table.sql
-- Description: Creates the audit_logs table for immutable action logging
-- AzureSQL compatible
--
-- CRITICAL: This table is APPEND-ONLY per CONSTITUTION.md Section IV
-- "audit_logs is append-only — no updates or deletes permitted"
-- 
-- This migration includes INSTEAD OF triggers that PREVENT any UPDATE or DELETE operations

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    action_type NVARCHAR(50) NOT NULL,
    entity_type NVARCHAR(50) NOT NULL,
    entity_id UNIQUEIDENTIFIER NOT NULL,
    before_state NVARCHAR(MAX) NULL,
    after_state NVARCHAR(MAX) NULL,
    ip_address NVARCHAR(45) NULL,
    user_agent NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    
    -- NOTE: No updated_at column - this table is append-only
    -- NOTE: No foreign keys - audit logs must persist even if referenced entities are deleted
);

-- Index on user_id for user activity queries
CREATE INDEX IX_audit_logs_user_id ON audit_logs(user_id);

-- Index on action_type for filtering by action
CREATE INDEX IX_audit_logs_action_type ON audit_logs(action_type);

-- Index on entity_type and entity_id for entity history queries
CREATE INDEX IX_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Index on created_at for time-based queries and retention policies
CREATE INDEX IX_audit_logs_created_at ON audit_logs(created_at);

-- Composite index for common query: user actions in time range
CREATE INDEX IX_audit_logs_user_time ON audit_logs(user_id, created_at);

GO

-- ============================================================================
-- APPEND-ONLY ENFORCEMENT TRIGGERS
-- These triggers prevent UPDATE and DELETE operations on audit_logs
-- per CONSTITUTION.md Section IV: "Audit Immutability"
-- ============================================================================

-- Trigger to PREVENT UPDATE operations
CREATE TRIGGER TR_audit_logs_prevent_update
ON audit_logs
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR ('UPDATE operations are not permitted on audit_logs table. This table is append-only per CONSTITUTION.md Section IV: Audit Immutability.', 16, 1);
    -- Do not perform any update - the operation is completely blocked
END;
GO

-- Trigger to PREVENT DELETE operations
CREATE TRIGGER TR_audit_logs_prevent_delete
ON audit_logs
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR ('DELETE operations are not permitted on audit_logs table. This table is append-only per CONSTITUTION.md Section IV: Audit Immutability.', 16, 1);
    -- Do not perform any delete - the operation is completely blocked
END;
GO
