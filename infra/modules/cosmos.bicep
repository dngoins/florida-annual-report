// Azure CosmosDB Module
// Stores processed Markdown documents
// Compliance: AES-256 encryption at rest, TLS 1.2+

@description('Resource location')
param location string

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Base name for resources')
param baseName string

@description('Enable free tier (only one per subscription)')
param enableFreeTier bool = environment == 'dev'

@description('Total throughput limit (RU/s)')
param totalThroughputLimit int = environment == 'prod' ? 10000 : 1000

var accountName = 'cosmos-${baseName}-${environment}'
var databaseName = 'florida-annual-report'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableFreeTier
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: environment == 'prod'
      }
    ]
    capabilities: environment != 'prod' ? [
      {
        name: 'EnableServerless'
      }
    ] : []
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: environment == 'prod' ? 240 : 1440
        backupRetentionIntervalInHours: environment == 'prod' ? 720 : 168
        backupStorageRedundancy: environment == 'prod' ? 'Geo' : 'Local'
      }
    }
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: environment == 'prod' ? {
      throughput: 400
    } : {}
  }
}

// Container for processed documents (Markdown)
resource documentsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'processed-documents'
  properties: {
    resource: {
      id: 'processed-documents'
      partitionKey: {
        paths: ['/companyId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/content/*'
          }
        ]
      }
      defaultTtl: -1
    }
    options: environment == 'prod' ? {
      throughput: 400
    } : {}
  }
}

// Container for filing history
resource filingHistoryContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'filing-history'
  properties: {
    resource: {
      id: 'filing-history'
      partitionKey: {
        paths: ['/companyId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
      }
      defaultTtl: -1
    }
    options: environment == 'prod' ? {
      throughput: 400
    } : {}
  }
}

@description('CosmosDB account name')
output cosmosAccountName string = cosmosAccount.name

@description('CosmosDB account ID')
output cosmosAccountId string = cosmosAccount.id

@description('CosmosDB endpoint')
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint

@description('Database name')
output databaseName string = cosmosDatabase.name
