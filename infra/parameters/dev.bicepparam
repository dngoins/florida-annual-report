using '../main.bicep'

// Development Environment Parameters
// Low-cost configuration for development and testing

param environment = 'dev'
param baseName = 'flar'
param location = 'eastus'

// SQL Configuration - use secure parameter for password
param sqlAdminLogin = 'flaradmin'
// Note: sqlAdminPassword should be provided at deployment time via --parameters flag
// Example: az deployment group create ... --parameters sqlAdminPassword='YOUR_SECURE_PASSWORD'

// Container images - placeholder, replace with actual ACR images
param backendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param frontendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Optional Azure AD configuration (can be empty for dev)
param sqlAadAdminObjectId = ''
param sqlAadAdminLoginName = ''
param additionalKeyVaultAccessPrincipalIds = []
