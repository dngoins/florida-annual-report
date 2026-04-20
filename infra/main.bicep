// Florida Annual Report - Main Infrastructure Template
// Orchestrates all Azure resources for the platform
// 
// Resources provisioned:
// - Azure Key Vault (secrets management)
// - Azure SQL Database (primary data store)
// - Azure BLOB Storage (documents, receipts, screenshots)
// - Azure CosmosDB (processed Markdown documents)
// - Azure Container Apps (backend API + frontend)

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Base name for resources (will be combined with environment)')
param baseName string = 'flar'

@description('Azure AD Tenant ID')
param tenantId string = subscription().tenantId

@description('SQL Server administrator login')
param sqlAdminLogin string

@secure()
@description('SQL Server administrator password (will be stored in Key Vault)')
param sqlAdminPassword string

@description('Azure AD admin object ID for SQL Server (optional, recommended for prod)')
param sqlAadAdminObjectId string = ''

@description('Azure AD admin login name for SQL Server')
param sqlAadAdminLoginName string = ''

@description('Backend container image')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Frontend container image')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Additional principal IDs that need Key Vault access')
param additionalKeyVaultAccessPrincipalIds array = []

// ============================================================================
// KEY VAULT - Deploy first to store secrets
// ============================================================================
module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
    tenantId: tenantId
    enableSoftDelete: true
    softDeleteRetentionDays: environment == 'prod' ? 90 : 7
  }
}

// ============================================================================
// SQL DATABASE
// ============================================================================
module sqlDatabase 'modules/sql.bicep' = {
  name: 'sql-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
    sqlAdminLogin: sqlAdminLogin
    sqlAdminPassword: sqlAdminPassword
    aadAdminObjectId: sqlAadAdminObjectId
    aadAdminLoginName: sqlAadAdminLoginName
  }
}

// ============================================================================
// BLOB STORAGE
// ============================================================================
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
  }
}

// ============================================================================
// COSMOSDB
// ============================================================================
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
    enableFreeTier: environment == 'dev'
  }
}

// ============================================================================
// CONTAINER APPS
// ============================================================================
module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
    keyVaultUri: keyVault.outputs.keyVaultUri
    backendImage: backendImage
    frontendImage: frontendImage
  }
  dependsOn: [
    keyVault
  ]
}

// ============================================================================
// KEY VAULT ACCESS POLICIES - Grant access to Container Apps
// ============================================================================
module keyVaultAccess 'modules/keyvault.bicep' = {
  name: 'keyVault-access-deployment'
  params: {
    location: location
    environment: environment
    baseName: baseName
    tenantId: tenantId
    accessPrincipalIds: concat([
      containerApps.outputs.backendPrincipalId
      containerApps.outputs.frontendPrincipalId
    ], additionalKeyVaultAccessPrincipalIds)
    enableSoftDelete: true
    softDeleteRetentionDays: environment == 'prod' ? 90 : 7
  }
  dependsOn: [
    containerApps
  ]
}

// ============================================================================
// STORE SECRETS IN KEY VAULT
// ============================================================================
resource keyVaultRef 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVault.outputs.keyVaultName
}

resource sqlConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultRef
  name: 'sql-connection-string'
  properties: {
    value: 'Server=tcp:${sqlDatabase.outputs.sqlServerFqdn},1433;Database=${sqlDatabase.outputs.databaseName};User ID=${sqlAdminLogin};Password=${sqlAdminPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
  }
}

resource storageConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultRef
  name: 'storage-connection-string'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storage.outputs.storageAccountName};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${listKeys(storage.outputs.storageAccountId, '2023-01-01').keys[0].value}'
  }
}

resource cosmosConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultRef
  name: 'cosmos-connection-string'
  properties: {
    value: listConnectionStrings(cosmos.outputs.cosmosAccountId, '2023-11-15').connectionStrings[0].connectionString
  }
}

resource sqlPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultRef
  name: 'sql-admin-password'
  properties: {
    value: sqlAdminPassword
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Key Vault name')
output keyVaultName string = keyVault.outputs.keyVaultName

@description('Key Vault URI')
output keyVaultUri string = keyVault.outputs.keyVaultUri

@description('SQL Server FQDN')
output sqlServerFqdn string = sqlDatabase.outputs.sqlServerFqdn

@description('SQL Database name')
output sqlDatabaseName string = sqlDatabase.outputs.databaseName

@description('Storage account name')
output storageAccountName string = storage.outputs.storageAccountName

@description('Storage blob endpoint')
output storageBlobEndpoint string = storage.outputs.blobEndpoint

@description('CosmosDB account name')
output cosmosAccountName string = cosmos.outputs.cosmosAccountName

@description('CosmosDB endpoint')
output cosmosEndpoint string = cosmos.outputs.cosmosEndpoint

@description('Backend API URL')
output backendUrl string = 'https://${containerApps.outputs.backendFqdn}'

@description('Frontend URL')
output frontendUrl string = 'https://${containerApps.outputs.frontendFqdn}'

@description('Container Apps Environment name')
output containerAppEnvName string = containerApps.outputs.containerAppEnvName
