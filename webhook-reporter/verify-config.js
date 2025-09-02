#!/usr/bin/env node

/**
 * Configuration verification script
 * Checks if environment variables properly control chart generation
 */

const { loadConfig } = require('./src/config')

// Test different environment variable combinations
const testCases = [
  {
    name: 'Only API Key charts enabled',
    env: {
      DASHBOARD_CHART_SYSTEM_OVERVIEW: 'false',
      DASHBOARD_CHART_MODEL_DISTRIBUTION: 'false', 
      DASHBOARD_CHART_USAGE_TREND: 'false',
      DASHBOARD_CHART_API_KEYS_TREND: 'false',
      DASHBOARD_CHART_API_KEY_USAGE: 'true',
      DASHBOARD_CHART_API_KEY_COST: 'true',
      DASHBOARD_CHART_API_KEY_ACTIVITY: 'true'
    },
    expected: ['apiKeyUsage', 'apiKeyCost', 'apiKeyActivity']
  },
  {
    name: 'All charts disabled', 
    env: {
      DASHBOARD_CHART_SYSTEM_OVERVIEW: 'false',
      DASHBOARD_CHART_MODEL_DISTRIBUTION: 'false',
      DASHBOARD_CHART_USAGE_TREND: 'false', 
      DASHBOARD_CHART_API_KEYS_TREND: 'false',
      DASHBOARD_CHART_API_KEY_USAGE: 'false',
      DASHBOARD_CHART_API_KEY_COST: 'false',
      DASHBOARD_CHART_API_KEY_ACTIVITY: 'false'
    },
    expected: []
  },
  {
    name: 'Only system charts enabled',
    env: {
      DASHBOARD_CHART_SYSTEM_OVERVIEW: 'true',
      DASHBOARD_CHART_MODEL_DISTRIBUTION: 'true',
      DASHBOARD_CHART_USAGE_TREND: 'false',
      DASHBOARD_CHART_API_KEYS_TREND: 'false', 
      DASHBOARD_CHART_API_KEY_USAGE: 'false',
      DASHBOARD_CHART_API_KEY_COST: 'false',
      DASHBOARD_CHART_API_KEY_ACTIVITY: 'false'
    },
    expected: ['systemOverview', 'modelDistribution']
  }
]

console.log('🧪 Testing webhook chart configuration...\n')

for (const testCase of testCases) {
  console.log(`📋 Test Case: ${testCase.name}`)
  
  // Set environment variables
  for (const [key, value] of Object.entries(testCase.env)) {
    process.env[key] = value
  }
  
  try {
    // Load configuration
    const config = loadConfig()
    const enabled = config.charts.enabled || {}
    
    // Simulate chart generation logic
    const enabledCharts = []
    
    if (enabled.systemOverview === true) enabledCharts.push('systemOverview')
    if (enabled.modelDistribution === true) enabledCharts.push('modelDistribution') 
    if (enabled.usageTrend === true) enabledCharts.push('usageTrend')
    if (enabled.apiKeysTrend === true) enabledCharts.push('apiKeysTrend')
    if (enabled.apiKeyUsage === true) enabledCharts.push('apiKeyUsage')
    if (enabled.apiKeyCost === true) enabledCharts.push('apiKeyCost') 
    if (enabled.apiKeyActivity === true) enabledCharts.push('apiKeyActivity')
    
    console.log(`   Expected: [${testCase.expected.join(', ')}]`)
    console.log(`   Actual:   [${enabledCharts.join(', ')}]`)
    
    const isCorrect = JSON.stringify(enabledCharts.sort()) === JSON.stringify(testCase.expected.sort())
    console.log(`   Result:   ${isCorrect ? '✅ PASS' : '❌ FAIL'}`)
    
  } catch (error) {
    console.log(`   Error:    ❌ ${error.message}`)
  }
  
  // Clean up environment variables
  for (const key of Object.keys(testCase.env)) {
    delete process.env[key]
  }
  
  console.log()
}

console.log('🎯 Configuration verification completed!')