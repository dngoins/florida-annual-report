/**
 * Jest Configuration for API Gateway Tests
 */

module.exports = {
  testEnvironment: 'node',
  rootDir: '../../../',
  testMatch: ['<rootDir>/tests/unit/api/**/*.test.js'],
  collectCoverageFrom: [
    'src/api/**/*.js',
    '!src/api/config/**'
  ],
  coverageDirectory: '<rootDir>/coverage/api',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  verbose: true
};
