// Azure BLOB Storage Module
// Stores raw documents, receipts, screenshots
// Compliance: Private containers, SAS tokens, AES-256 encryption

@description('Resource location')
param location string

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Base name for resources')
param baseName string

@description('Storage account SKU')
param skuName string = environment == 'prod' ? 'Standard_GRS' : 'Standard_LRS'

// Storage account names must be 3-24 chars, lowercase letters and numbers only
var storageAccountName = toLower(replace('st${baseName}${environment}', '-', ''))

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: length(storageAccountName) > 24 ? substring(storageAccountName, 0, 24) : storageAccountName
  location: location
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
    }
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
  }
}

// Container for raw documents (private)
resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'Raw uploaded documents'
    }
  }
}

// Container for receipts (private)
resource receiptsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'receipts'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'Filing receipts from Sunbiz'
    }
  }
}

// Container for screenshots (private)
resource screenshotsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'screenshots'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'Submission screenshots for audit'
    }
  }
}

// Container for audit logs (private)
resource auditContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'audit-logs'
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'Audit log archives'
    }
  }
}

@description('Storage account name')
output storageAccountName string = storageAccount.name

@description('Storage account ID')
output storageAccountId string = storageAccount.id

@description('Blob endpoint')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Primary connection string reference (use Key Vault to store actual value)')
output connectionStringReference string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=[RETRIEVE_FROM_KEYVAULT]'
