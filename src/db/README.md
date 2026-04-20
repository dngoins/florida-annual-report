# Database Migrations

This directory contains SQL migration scripts for the Florida Annual Report Automation Platform's AzureSQL database.

## Schema Overview

| Table | Description |
|-------|-------------|
| `companies` | Core entity information (entity name, document number, addresses, registered agent) |
| `officers` | Company officers/directors with FK to companies |
| `filings` | Annual report filing records with status tracking |
| `submissions` | Sunbiz submission attempts with user approval enforcement |
| `audit_logs` | **Append-only** immutable audit trail (NO UPDATE/DELETE allowed) |

## Prerequisites

- AzureSQL database instance
- SQL Server Management Studio (SSMS), Azure Data Studio, or `sqlcmd` CLI
- Database connection string with admin privileges

## Running Migrations

### Option 1: Azure Data Studio / SSMS

1. Connect to your AzureSQL database
2. Open each migration file in order (001, 002, 003, 004, 005)
3. Execute each script in sequence

### Option 2: sqlcmd CLI

```bash
# Set your connection details
export DB_SERVER="your-server.database.windows.net"
export DB_NAME="florida_annual_report"
export DB_USER="admin_user"

# Run migrations in order
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i migrations/001_create_companies_table.sql
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i migrations/002_create_officers_table.sql
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i migrations/003_create_filings_table.sql
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i migrations/004_create_submissions_table.sql
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i migrations/005_create_audit_logs_table.sql

# Load seed data (optional, for development/testing)
sqlcmd -S $DB_SERVER -d $DB_NAME -U $DB_USER -i seed.sql
```

### Option 3: Azure Portal Query Editor

1. Navigate to your AzureSQL database in Azure Portal
2. Click "Query editor (preview)" in the left menu
3. Authenticate with your credentials
4. Paste and run each migration script in order

## Migration Order

**IMPORTANT:** Migrations must be run in numerical order due to foreign key dependencies.

```
001_create_companies_table.sql    # No dependencies
002_create_officers_table.sql     # Depends on: companies
003_create_filings_table.sql      # Depends on: companies
004_create_submissions_table.sql  # Depends on: filings
005_create_audit_logs_table.sql   # No FK dependencies (intentional)
```

## Seed Data

The `seed.sql` file contains sample data for development and testing:

- 1 sample company (ACME Corporation)
- 4 officers (President, Secretary, Treasurer, Director)
- 1 pending filing for the current year
- 1 submission attempt (not yet approved)
- 3 audit log entries

**Do NOT run seed.sql in production environments.**

## Verification Queries

After running migrations, verify the schema:

```sql
-- List all tables
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';

-- Verify companies table structure
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'companies';

-- Verify foreign keys
SELECT 
    fk.name AS FK_Name,
    tp.name AS Parent_Table,
    cp.name AS Parent_Column,
    tr.name AS Referenced_Table,
    cr.name AS Referenced_Column
FROM sys.foreign_keys fk
INNER JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
INNER JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id;

-- Verify indexes
SELECT 
    t.name AS Table_Name,
    i.name AS Index_Name,
    i.type_desc AS Index_Type
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
WHERE i.name IS NOT NULL
ORDER BY t.name, i.name;

-- Verify triggers
SELECT 
    t.name AS Table_Name,
    tr.name AS Trigger_Name,
    tr.is_instead_of_trigger
FROM sys.triggers tr
INNER JOIN sys.tables t ON tr.parent_id = t.object_id
ORDER BY t.name, tr.name;
```

## Audit Logs: Append-Only Enforcement

Per `CONSTITUTION.md` Section IV (Audit Immutability), the `audit_logs` table has `INSTEAD OF` triggers that **prevent** any UPDATE or DELETE operations:

```sql
-- This will FAIL with an error:
UPDATE audit_logs SET action_type = 'MODIFIED' WHERE id = '...';
-- Error: UPDATE operations are not permitted on audit_logs table.

-- This will also FAIL:
DELETE FROM audit_logs WHERE created_at < '2024-01-01';
-- Error: DELETE operations are not permitted on audit_logs table.
```

**Audit logs are permanent and immutable.** This is a compliance requirement.

## Troubleshooting

### "Invalid object name" error
Ensure you're running migrations in the correct order. Table dependencies require sequential execution.

### "Foreign key constraint" error
Check that the referenced table exists and has the expected primary key.

### "Permission denied" error
Verify your database user has `CREATE TABLE`, `CREATE INDEX`, and `CREATE TRIGGER` permissions.

### Trigger not firing
Azure SQL Database supports triggers. Verify the trigger was created:
```sql
SELECT name, is_disabled FROM sys.triggers WHERE parent_id = OBJECT_ID('audit_logs');
```

## Rollback

To completely remove all tables (destructive!):

```sql
-- WARNING: This deletes all data!
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS filings;
DROP TABLE IF EXISTS officers;
DROP TABLE IF EXISTS companies;
```

## Future Migrations

When adding new migrations:

1. Create a new file with the next number: `006_description.sql`
2. Include clear comments describing the change
3. Add rollback instructions if applicable
4. Update this README if schema changes significantly
