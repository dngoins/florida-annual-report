/**
 * Document Service Configuration
 * 
 * Environment-based configuration for the document service.
 * All secrets are loaded from environment variables per CLAUDE.md guidelines.
 */

export interface DocumentServiceConfig {
  // Azure Blob Storage
  azure: {
    storageAccountName: string;
    storageAccountKey: string;
    containerName: string;
    connectionString: string;
  };
  
  // Azure SQL Database
  database: {
    server: string;
    database: string;
    user: string;
    password: string;
    port: number;
    encrypt: boolean;
  };
  
  // File upload settings
  upload: {
    maxFileSizeBytes: number;
    allowedMimeTypes: string[];
  };
  
  // Audit logging
  audit: {
    logPath: string;
  };
}

/**
 * Load configuration from environment variables
 * Throws error if required variables are missing
 */
export function loadConfig(): DocumentServiceConfig {
  // Required environment variables
  const requiredEnvVars = [
    'AZURE_STORAGE_ACCOUNT_NAME',
    'AZURE_STORAGE_ACCOUNT_KEY',
    'AZURE_STORAGE_CONNECTION_STRING',
    'DB_SERVER',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
  ];
  
  const missing = requiredEnvVars.filter((v) => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    azure: {
      storageAccountName: process.env.AZURE_STORAGE_ACCOUNT_NAME!,
      storageAccountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY!,
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents',
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
    },
    database: {
      server: process.env.DB_SERVER!,
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      port: parseInt(process.env.DB_PORT || '1433', 10),
      encrypt: process.env.DB_ENCRYPT !== 'false',
    },
    upload: {
      maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '20971520', 10), // 20MB default
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv',
        'text/markdown',
        'text/x-markdown',
        'text/plain',
      ],
    },
    audit: {
      logPath: process.env.AUDIT_LOG_PATH || './audit_logs',
    },
  };
}

/**
 * Create a test configuration for unit tests
 */
export function createTestConfig(): DocumentServiceConfig {
  return {
    azure: {
      storageAccountName: 'testaccount',
      storageAccountKey: 'testkey',
      containerName: 'test-documents',
      connectionString: 'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=testkey;EndpointSuffix=core.windows.net',
    },
    database: {
      server: 'localhost',
      database: 'testdb',
      user: 'testuser',
      password: 'testpassword',
      port: 1433,
      encrypt: false,
    },
    upload: {
      maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv',
        'text/markdown',
        'text/x-markdown',
        'text/plain',
      ],
    },
    audit: {
      logPath: './test_audit_logs',
    },
  };
}
