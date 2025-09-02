#!/usr/bin/env node

/**
 * Webhook图表调试工具
 * 帮助用户诊断配置和图表生成问题
 */

const { loadConfig } = require('./src/config')

async function debugConfiguration() {
  console.log('🔧 Webhook Chart Configuration Debugger')
  console.log('=====================================\n')

  try {
    // 1. 检查环境变量
    console.log('📋 Environment Variables Check:')
    const chartEnvVars = [
      'DASHBOARD_CHART_SYSTEM_OVERVIEW',
      'DASHBOARD_CHART_MODEL_DISTRIBUTION', 
      'DASHBOARD_CHART_USAGE_TREND',
      'DASHBOARD_CHART_API_KEYS_TREND',
      'DASHBOARD_CHART_API_KEY_USAGE',
      'DASHBOARD_CHART_API_KEY_COST',
      'DASHBOARD_CHART_API_KEY_ACTIVITY'
    ]

    chartEnvVars.forEach(envVar => {
      const value = process.env[envVar]
      const status = value === undefined ? '⚠️ UNDEFINED' : value === 'true' ? '✅ TRUE' : '❌ FALSE'
      console.log(`  ${envVar}: ${status}${value !== undefined ? ` (${value})` : ''}`)
    })

    console.log('\n📊 Webhook Configuration:')
    const webhookEnvVars = [
      'DASHBOARD_WEBHOOK_ENABLE',
      'DASHBOARD_WEBHOOK_URL',
      'DASHBOARD_WEBHOOK_TYPE',
      'DASHBOARD_WEBHOOK_INTERVAL'
    ]

    webhookEnvVars.forEach(envVar => {
      const value = process.env[envVar]
      const display = envVar === 'DASHBOARD_WEBHOOK_URL' && value ? 
        `${value.substring(0, 30)}...` : value || 'NOT SET'
      console.log(`  ${envVar}: ${display}`)
    })

    // 2. 加载配置并显示最终结果
    console.log('\n🔧 Loading Configuration...')
    const config = loadConfig()

    // 3. 检查图表配置匹配
    console.log('\n🎯 Configuration Validation:')
    
    const enabledCount = Object.values(config.charts.enabled).filter(Boolean).length
    const totalCount = Object.keys(config.charts.enabled).length
    
    console.log(`  📊 Total chart types: ${totalCount}`)
    console.log(`  ✅ Enabled charts: ${enabledCount}`)
    console.log(`  ❌ Disabled charts: ${totalCount - enabledCount}`)

    if (enabledCount === 0) {
      console.log('\n⚠️  WARNING: No charts are enabled!')
      console.log('   This will result in text-only webhook messages.')
      console.log('   Set at least one DASHBOARD_CHART_* environment variable to "true".')
    }

    // 4. 预测期望行为
    console.log('\n🔮 Expected Behavior:')
    console.log('  When you run the webhook push, you should see:')
    
    const enabledCharts = Object.entries(config.charts.enabled)
      .filter(([_, enabled]) => enabled)
      .map(([key, _]) => key)

    if (enabledCharts.length > 0) {
      console.log('  📈 Generated charts:')
      enabledCharts.forEach(chart => {
        console.log(`    • ${chart}`)
      })
    } else {
      console.log('  📄 Only text summary (no charts)')
    }

    const disabledCharts = Object.entries(config.charts.enabled)
      .filter(([_, enabled]) => !enabled)
      .map(([key, _]) => key)

    if (disabledCharts.length > 0) {
      console.log('  🚫 Charts that will NOT be generated:')
      disabledCharts.forEach(chart => {
        console.log(`    • ${chart}`)
      })
    }

    // 5. 故障排除建议
    console.log('\n🛠️  Troubleshooting Tips:')
    
    if (enabledCount === 0) {
      console.log('  1. Set environment variables in your .env file')
      console.log('     Example: DASHBOARD_CHART_API_KEY_USAGE=true')
    }
    
    if (!process.env.DASHBOARD_WEBHOOK_URL) {
      console.log('  2. Make sure DASHBOARD_WEBHOOK_URL is configured')
    }
    
    if (process.env.DASHBOARD_WEBHOOK_ENABLE !== 'true') {
      console.log('  3. Set DASHBOARD_WEBHOOK_ENABLE=true to enable automatic sending')
    }

    console.log('  4. Run with --dry-run first to test configuration')
    console.log('     docker-compose exec webhook-reporter node src/app.js --dry-run')
    
    console.log('  5. Check logs for detailed chart generation status')
    console.log('     docker-compose logs webhook-reporter')

    // 6. 配置示例
    console.log('\n📝 Configuration Example for your use case:')
    console.log('# Enable only API Key related charts')
    console.log('DASHBOARD_CHART_API_KEY_USAGE=true')
    console.log('DASHBOARD_CHART_API_KEY_COST=true') 
    console.log('DASHBOARD_CHART_API_KEY_ACTIVITY=true')
    console.log('DASHBOARD_CHART_USAGE_TREND=true')
    console.log('DASHBOARD_CHART_API_KEYS_TREND=true')
    console.log('DASHBOARD_CHART_SYSTEM_OVERVIEW=false')
    console.log('DASHBOARD_CHART_MODEL_DISTRIBUTION=false')

    console.log('\n✨ Debug completed successfully!')

  } catch (error) {
    console.error('\n❌ Debug failed:', error.message)
    console.log('\nThis usually means:')
    console.log('  - Configuration file is missing or invalid')
    console.log('  - Environment variables are not accessible')
    console.log('  - There is a syntax error in the configuration')
    
    process.exit(1)
  }
}

// 运行调试工具
if (require.main === module) {
  debugConfiguration().catch(error => {
    console.error('💥 Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { debugConfiguration }