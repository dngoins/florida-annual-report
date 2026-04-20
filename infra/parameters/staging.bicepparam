using '../main.bicep'

// Staging Environment Parameters
// Similar to production but with lower capacity/cost

param environment = 'staging'
param baseName = 'flar'
param location = 'eastus'

// SQL Configuration - use secure parameter for password
param sqlAdminLogin = 'flaradmin'
// Note: sqlAdminPassword should be provided at deployment time via --parameters flag
// Example: az deployment group create ... --parameters sqlAdminPassword='YOUR_SECURE_PASSWORD'

// Container images - placeholder, replace with actual ACR images
param backendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param frontendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Azure AD configuration - recommended for staging
// Replace with actual values from your Azure AD tenant
param sqlAadAdminObjectId = ''
param sqlAadAdminLoginName = ''
param additionalKeyVaultAccessPrincipalIds = []
