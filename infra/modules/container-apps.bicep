// Azure Container Apps Module
// Hosts backend services and Next.js frontend
// Compliance: TLS 1.2+, managed identity for Key Vault access

@description('Resource location')
param location string

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Base name for resources')
param baseName string

@description('Key Vault URI for secrets')
param keyVaultUri string

@description('Backend container image')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Frontend container image')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Minimum replicas for backend')
param backendMinReplicas int = environment == 'prod' ? 2 : 0

@description('Maximum replicas for backend')
param backendMaxReplicas int = environment == 'prod' ? 10 : 2

@description('Minimum replicas for frontend')
param frontendMinReplicas int = environment == 'prod' ? 2 : 0

@description('Maximum replicas for frontend')
param frontendMaxReplicas int = environment == 'prod' ? 5 : 2

var containerAppEnvName = 'cae-${baseName}-${environment}'
var backendAppName = 'ca-backend-${baseName}-${environment}'
var frontendAppName = 'ca-frontend-${baseName}-${environment}'
var logAnalyticsName = 'log-${baseName}-${environment}'

// Log Analytics Workspace for Container Apps
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: environment == 'prod' ? 90 : 30
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

// Container Apps Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    zoneRedundant: environment == 'prod'
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    managedBy: 'bicep'
  }
}

// Backend Container App (API + Playwright automation)
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        corsPolicy: {
          allowedOrigins: environment == 'prod' ? ['https://${frontendAppName}.${containerAppEnv.properties.defaultDomain}'] : ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      secrets: [
        {
          name: 'keyvault-uri'
          value: keyVaultUri
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: json(environment == 'prod' ? '1.0' : '0.5')
            memory: environment == 'prod' ? '2Gi' : '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: environment == 'prod' ? 'production' : 'development'
            }
            {
              name: 'AZURE_KEYVAULT_URI'
              secretRef: 'keyvault-uri'
            }
            {
              name: 'PORT'
              value: '3001'
            }
          ]
        }
      ]
      scale: {
        minReplicas: backendMinReplicas
        maxReplicas: backendMaxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    component: 'backend'
    managedBy: 'bicep'
  }
}

// Frontend Container App (Next.js)
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      secrets: [
        {
          name: 'backend-url'
          value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: json(environment == 'prod' ? '0.5' : '0.25')
            memory: environment == 'prod' ? '1Gi' : '0.5Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: environment == 'prod' ? 'production' : 'development'
            }
            {
              name: 'NEXT_PUBLIC_API_URL'
              secretRef: 'backend-url'
            }
          ]
        }
      ]
      scale: {
        minReplicas: frontendMinReplicas
        maxReplicas: frontendMaxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    environment: environment
    application: 'florida-annual-report'
    component: 'frontend'
    managedBy: 'bicep'
  }
}

@description('Container Apps Environment name')
output containerAppEnvName string = containerAppEnv.name

@description('Backend app name')
output backendAppName string = backendApp.name

@description('Backend app FQDN')
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn

@description('Backend app principal ID (for Key Vault access)')
output backendPrincipalId string = backendApp.identity.principalId

@description('Frontend app name')
output frontendAppName string = frontendApp.name

@description('Frontend app FQDN')
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn

@description('Frontend app principal ID')
output frontendPrincipalId string = frontendApp.identity.principalId

@description('Log Analytics workspace ID')
output logAnalyticsWorkspaceId string = logAnalytics.id
