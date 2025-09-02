#!/usr/bin/env node

/**
 * 测试 webhook-reporter 配置读取
 * 验证环境变量是否正确解析
 */

// 模拟用户的环境变量
process.env.DASHBOARD_CHART_API_KEY_USAGE = 'true'
process.env.DASHBOARD_CHART_API_KEY_COST = 'true'
process.env.DASHBOARD_CHART_API_KEY_ACTIVITY = 'false'
process.env.DASHBOARD_CHART_SYSTEM_OVERVIEW = 'false'
process.env.DASHBOARD_CHART_MODEL_DISTRIBUTION = 'false'
process.env.DASHBOARD_CHART_USAGE_TREND = 'false'
process.env.DASHBOARD_CHART_API_KEYS_TREND = 'false'

const { loadConfig } = require('./src/config')

console.log('🧪 Testing webhook-reporter configuration loading...\n')

try {
  const config = loadConfig()
  
  console.log('📋 Configuration test results:')
  console.log('=====================================')
  
  const enabled = config.charts.enabled
  
  // 检查每个图表配置
  const tests = [
    { name: 'systemOverview', expected: false, actual: enabled.systemOverview },
    { name: 'modelDistribution', expected: false, actual: enabled.modelDistribution },
    { name: 'usageTrend', expected: false, actual: enabled.usageTrend },
    { name: 'apiKeysTrend', expected: false, actual: enabled.apiKeysTrend },
    { name: 'apiKeyUsage', expected: true, actual: enabled.apiKeyUsage },
    { name: 'apiKeyCost', expected: true, actual: enabled.apiKeyCost },
    { name: 'apiKeyActivity', expected: false, actual: enabled.apiKeyActivity }
  ]
  
  let allPassed = true
  
  tests.forEach(test => {
    const passed = test.expected === test.actual
    const status = passed ? '✅ PASS' : '❌ FAIL'
    const expected = test.expected ? 'ENABLED' : 'DISABLED'
    const actual = test.actual ? 'ENABLED' : 'DISABLED'
    
    console.log(`${status} ${test.name}: expected ${expected}, got ${actual}`)
    
    if (!passed) {
      allPassed = false
    }
  })
  
  console.log('=====================================')
  
  if (allPassed) {
    console.log('🎉 All configuration tests PASSED!')
    console.log('✅ Only apiKeyUsage and apiKeyCost are enabled')
    console.log('✅ All other charts are correctly disabled')
  } else {
    console.log('❌ Some configuration tests FAILED!')
    console.log('⚠️  Check environment variable parsing logic')
  }
  
  console.log('\n📊 Expected chart generation:')
  console.log('  - API Keys Daily Usage Statistics (apiKeyUsage)')
  console.log('  - API Keys Cost Distribution (apiKeyCost)')
  console.log('  - Total charts to generate: 2')
  
} catch (error) {
  console.error('❌ Configuration loading failed:', error.message)
  process.exit(1)
}