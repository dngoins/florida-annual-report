// Azure SQL Database Module
// Primary database for companies, filings, officers, submissions, audit_logs
// Compliance: TLS 1.2+, AES-256 encryption at rest

@description('Resource location')
param location string

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Base name for resources')
param baseName string

@description('SQL Server administrator login')
param sqlAdminLogin string

@secure()
@description('SQL Server administrator password')
param sqlAdminPassword string

@description('Azure AD admin object ID for SQL Server')
param aadAdminObjectId string = ''

@description('Azure AD admin login name')
param aadAdminLoginName string = ''

@description('SKU name for the database')
param skuName string = environment == 'prod' ? 'S2' : 'Basic'

@description('DTU capacity for the database')
param skuCapacity int = environment == 'prod' ? 50 : 5

var serverName = 'sql-${baseName}-${environment}'
var databaseName = 'sqldb-${baseName}-${environment}'

resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: serverName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

// Azure AD administrator (optional, for production)
resource sqlAadAdmin 'Microsoft.Sql/servers/administrators@2023-05-01-preview' = if (!empty(aadAdminObjectId)) {
  parent: sqlServer
  name: 'ActiveDirectory'
  properties: {
    administratorType: 'ActiveDirectory'
    login: aadAdminLoginName
    sid: aadAdminObjectId
    tenantId: subscription().tenantId
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  sku: {
    name: skuName
    capacity: skuCapacity
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: environment == 'prod' ? 53687091200 : 2147483648 // 50GB prod, 2GB dev
    zoneRedundant: environment == 'prod'
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

// Transparent Data Encryption (AES-256)
resource transparentDataEncryption 'Microsoft.Sql/servers/databases/transparentDataEncryption@2023-05-01-preview' = {
  parent: sqlDatabase
  name: 'current'
  properties: {
    state: 'Enabled'
  }
}

// Allow Azure services to access
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAllAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Auditing for compliance
resource sqlAuditing 'Microsoft.Sql/servers/auditingSettings@2023-05-01-preview' = if (environment == 'prod') {
  parent: sqlServer
  name: 'default'
  properties: {
    state: 'Enabled'
    isAzureMonitorTargetEnabled: true
    retentionDays: 90
  }
}

@description('SQL Server fully qualified domain name')
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName

@description('SQL Server name')
output sqlServerName string = sqlServer.name

@description('SQL Database name')
output databaseName string = sqlDatabase.name

@description('SQL Connection string (without password)')
output connectionStringTemplate string = 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${sqlDatabase.name};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
