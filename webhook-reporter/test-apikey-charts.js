#!/usr/bin/env node

/**
 * 测试API Key图表生成功能
 * 使用方法: node test-apikey-charts.js
 */

const WebhookChartGenerator = require('./src/chart-generator')
const fs = require('fs')
const path = require('path')

// 模拟配置
const config = {
  charts: {
    enabled: {
      systemOverview: false,
      modelDistribution: false,
      usageTrend: false,
      apiKeysTrend: false,
      apiKeyUsage: true,
      apiKeyCost: true,
      apiKeyActivity: true
    },
    theme: 'light',
    width: 900,
    height: 450
  }
}

// 模拟API Key数据
const mockDashboardData = {
  // API Keys详细使用数据
  apiKeysDetailedUsage: {
    apiKeysUsage: [
      {
        id: 'cr_test_key_001',
        name: 'Test App 1',
        isActive: true,
        todayRequests: 156,
        totalRequests: 12811,
        todayCost: 0.0234,
        totalCost: 1.2567
      },
      {
        id: 'cr_test_key_002',
        name: 'Test App 2',
        isActive: true,
        todayRequests: 89,
        totalRequests: 4867,
        todayCost: 0.0156,
        totalCost: 0.8934
      },
      {
        id: 'cr_test_key_003',
        name: 'Data Analytics',
        isActive: false,
        todayRequests: 23,
        totalRequests: 878,
        todayCost: 0.0034,
        totalCost: 0.1234
      },
      {
        id: 'cr_test_key_004',
        name: 'Bot Assistant',
        isActive: true,
        todayRequests: 67,
        totalRequests: 2345,
        todayCost: 0.0089,
        totalCost: 0.4567
      },
      {
        id: 'cr_test_key_005',
        name: 'Content Gen',
        isActive: true,
        todayRequests: 134,
        totalRequests: 5678,
        todayCost: 0.0198,
        totalCost: 0.7890
      }
    ]
  },

  // API Keys趋势数据
  apiKeysTrend: {
    data: [
      {
        label: '01-01',
        apiKeys: {
          'cr_test_key_001': { requests: 145, tokens: 23400 },
          'cr_test_key_002': { requests: 87, tokens: 15600 },
          'cr_test_key_003': { requests: 34, tokens: 5600 },
          'cr_test_key_004': { requests: 56, tokens: 8900 },
          'cr_test_key_005': { requests: 123, tokens: 19800 }
        }
      },
      {
        label: '01-02',
        apiKeys: {
          'cr_test_key_001': { requests: 156, tokens: 25200 },
          'cr_test_key_002': { requests: 89, tokens: 16800 },
          'cr_test_key_003': { requests: 23, tokens: 3400 },
          'cr_test_key_004': { requests: 67, tokens: 10200 },
          'cr_test_key_005': { requests: 134, tokens: 21600 }
        }
      },
      {
        label: '01-03',
        apiKeys: {
          'cr_test_key_001': { requests: 167, tokens: 26800 },
          'cr_test_key_002': { requests: 92, tokens: 17400 },
          'cr_test_key_003': { requests: 18, tokens: 2900 },
          'cr_test_key_004': { requests: 71, tokens: 11400 },
          'cr_test_key_005': { requests: 145, tokens: 23400 }
        }
      }
    ],
    topApiKeys: ['cr_test_key_001', 'cr_test_key_002', 'cr_test_key_005', 'cr_test_key_004', 'cr_test_key_003']
  }
}

async function testApiKeyCharts() {
  console.log('🧪 Starting API Key charts generation test...')

  try {
    const generator = new WebhookChartGenerator(config)
    
    console.log('📊 Generating API Key usage statistics chart...')
    const usageChart = await generator.generateApiKeyUsageChart(mockDashboardData.apiKeysDetailedUsage)
    if (usageChart) {
      const usagePath = path.join(__dirname, 'test-api-key-usage.png')
      await fs.promises.writeFile(usagePath, usageChart)
      console.log(`✅ API Key usage chart generated: ${usagePath}`)
    } else {
      console.log('❌ Failed to generate API Key usage chart')
    }

    console.log('💰 Generating API Key cost distribution chart...')
    const costChart = await generator.generateApiKeyCostChart(mockDashboardData.apiKeysDetailedUsage)
    if (costChart) {
      const costPath = path.join(__dirname, 'test-api-key-cost.png')
      await fs.promises.writeFile(costPath, costChart)
      console.log(`✅ API Key cost chart generated: ${costPath}`)
    } else {
      console.log('❌ Failed to generate API Key cost chart')
    }

    console.log('📈 Generating API Key activity trend chart...')
    const activityChart = await generator.generateApiKeyActivityChart(mockDashboardData.apiKeysTrend)
    if (activityChart) {
      const activityPath = path.join(__dirname, 'test-api-key-activity.png')
      await fs.promises.writeFile(activityPath, activityChart)
      console.log(`✅ API Key activity chart generated: ${activityPath}`)
    } else {
      console.log('❌ Failed to generate API Key activity chart')
    }

    console.log('\n🎉 All API Key chart tests completed!')
    console.log('📝 Check points:')
    console.log('   - Number label positioning')
    console.log('   - X and Y axis labels clarity')
    console.log('   - Chart titles and legends')
    console.log('   - Colors and styling')
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message)
    console.error(error.stack)
  }
}

// 运行测试
if (require.main === module) {
  testApiKeyCharts()
}

module.exports = { testApiKeyCharts, mockDashboardData }