using '../main.bicep'

// Production Environment Parameters
// High-availability, geo-redundant configuration

param environment = 'prod'
param baseName = 'flar'
param location = 'eastus'

// SQL Configuration - use secure parameter for password
param sqlAdminLogin = 'flaradmin'
// IMPORTANT: sqlAdminPassword MUST be provided at deployment time via --parameters flag
// Use a strong, unique password stored in a secure location
// Example: az deployment group create ... --parameters sqlAdminPassword='$(az keyvault secret show ...)'

// Container images - replace with actual ACR images before production deployment
param backendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param frontendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Azure AD configuration - REQUIRED for production
// Replace with actual values from your Azure AD tenant
param sqlAadAdminObjectId = ''  // TODO: Set Azure AD admin object ID
param sqlAadAdminLoginName = '' // TODO: Set Azure AD admin login name

// Additional service principals that need Key Vault access (CI/CD, etc.)
param additionalKeyVaultAccessPrincipalIds = []
