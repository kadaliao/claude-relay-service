/**
 * Webhook Sender
 * 支持多平台的webhook发送器（Slack、Discord、钉钉、企业微信等）
 */

const axios = require('axios')
const path = require('path')
const fs = require('fs')
const FeishuImageUploader = require('./feishu-image-uploader')

class WebhookSender {
  constructor(config) {
    this.config = config
    this.webhookUrl = config.webhook.url
    this.webhookType = config.webhook.type
    this.timeout = config.webhook.timeout || 30000
    this.retries = config.webhook.retries || 3
  }

  /**
   * 获取图表对应的配置键名
   */
  getConfigKeyForChart(chartKey) {
    const mapping = {
      'systemOverview': 'systemOverview',
      'modelDistribution': 'modelDistribution', 
      'usageTrend': 'usageTrend',
      'apiKeysTrendRequests': 'apiKeysTrend',
      'apiKeysTrendTokens': 'apiKeysTrend',
      'apiKeyUsage': 'apiKeyUsage',
      'apiKeyCost': 'apiKeyCost',
      'apiKeyActivity': 'apiKeyActivity'
    }
    return mapping[chartKey] || chartKey
  }

  /**
   * 基于配置过滤启用的图表
   */
  filterEnabledCharts(charts) {
    console.log('🔍 Filtering charts based on configuration...')
    
    if (!charts || !this.config.charts.enabled) {
      console.warn('  ⚠️ No charts or configuration available')
      return {}
    }
    
    console.log(`  📊 Input charts: ${Object.keys(charts).join(', ')}`)
    
    const enabledCharts = {}
    Object.entries(charts).forEach(([chartKey, chartData]) => {
      // 处理tiny图表命名
      const baseChartKey = chartKey.replace('_tiny', '')
      const configKey = this.getConfigKeyForChart(baseChartKey)
      
      if (this.config.charts.enabled[configKey] === true) {
        enabledCharts[chartKey] = chartData
        console.log(`  ✅ ${chartKey} (${configKey}): INCLUDED`)
      } else {
        console.log(`  ❌ ${chartKey} (${configKey}): FILTERED OUT`)
      }
    })
    
    console.log(`  📊 Output charts: ${Object.keys(enabledCharts).join(', ')}`)
    return enabledCharts
  }

  /**
   * 获取启用的图表列表（按优先级排序）
   */
  getEnabledChartsList() {
    const allPossibleCharts = ['apiKeyUsage', 'apiKeyCost', 'apiKeyActivity', 'systemOverview', 'modelDistribution', 'usageTrend', 'apiKeysTrendRequests', 'apiKeysTrendTokens']
    return allPossibleCharts.filter(chartKey => {
      const configKey = this.getConfigKeyForChart(chartKey)
      return this.config.charts.enabled[configKey] === true
    })
  }

  /**
   * 格式化数字显示
   */
  formatNumber(num) {
    // 处理 undefined/null 值
    if (num == null || isNaN(num)) {
      return '0'
    }

    const n = Number(num)
    if (n >= 1000000) {
      return (n / 1000000).toFixed(2) + 'M'
    } else if (n >= 1000) {
      return (n / 1000).toFixed(2) + 'K'
    }
    return n.toLocaleString()
  }

  /**
   * 格式化费用显示
   */
  formatCost(cost) {
    if (cost == null || isNaN(cost)) {
      return '$0.00'
    }

    const c = Number(cost)
    if (c >= 1) {
      return `$${c.toFixed(2)}`
    } else if (c >= 0.001) {
      return `$${c.toFixed(4)}`
    } else if (c > 0) {
      return `$${c.toFixed(6)}`
    } else {
      return '$0.00'
    }
  }

  /**
   * 格式化运行时间
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) {
      return `${days}天 ${hours}小时`
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  }

  /**
   * 生成文本摘要 - 兼容新的数据结构
   */
  generateTextSummary(dashboardData) {
    // 兼容新的数据结构
    const recentActivity = dashboardData.recentActivity || {}
    const overview = dashboardData.overview || {}
    const systemHealth = dashboardData.systemHealth || {}
    const systemAverages = dashboardData.systemAverages || {}
    const systemCostSummary = dashboardData.systemCostSummary || {}

    // 今日token统计
    const todayInputTokens = recentActivity.inputTokensToday || dashboardData.todayInputTokens || 0
    const todayOutputTokens =
      recentActivity.outputTokensToday || dashboardData.todayOutputTokens || 0
    const todayCacheCreateTokens =
      recentActivity.cacheCreateTokensToday || dashboardData.todayCacheCreateTokens || 0
    const todayCacheReadTokens =
      recentActivity.cacheReadTokensToday || dashboardData.todayCacheReadTokens || 0
    const totalTokensToday =
      todayInputTokens + todayOutputTokens + todayCacheCreateTokens + todayCacheReadTokens

    // 总tokens统计
    const totalInputTokens = overview.totalInputTokensUsed || dashboardData.totalInputTokens || 0
    const totalOutputTokens = overview.totalOutputTokensUsed || dashboardData.totalOutputTokens || 0
    const totalCacheCreateTokens =
      overview.totalCacheCreateTokensUsed || dashboardData.totalCacheCreateTokens || 0
    const totalCacheReadTokens =
      overview.totalCacheReadTokensUsed || dashboardData.totalCacheReadTokens || 0
    const totalTokensAll =
      totalInputTokens + totalOutputTokens + totalCacheCreateTokens + totalCacheReadTokens

    // 生成API Keys使用情况摘要 - 重点显示今日使用情况
    let apiKeysUsageSummary = []
    if (dashboardData.apiKeysDetailedUsage && dashboardData.apiKeysDetailedUsage.apiKeysUsage) {
      apiKeysUsageSummary = dashboardData.apiKeysDetailedUsage.apiKeysUsage
        .slice(0, 10) // 显示更多API Key
        .map((key) => {
          const name =
            key.name && key.name !== '未命名' ? key.name : `Key-${key.id.substring(0, 8)}`
          const status = key.isActive ? '✅' : '❌'
          const usage = key.usagePercentage > 0 ? ` (${key.usagePercentage}% 已用)` : ''

          // 使用实际计算的数据
          const totalRequests = key.actualTotalRequests || key.totalRequests || 0
          const totalTokens = key.actualTotalTokens || key.totalTokens || 0
          const todayRequests = key.todayRequests || 0
          const todayTokens = key.todayTokens || 0
          const todayCost = key.todayCost || 0
          const totalCost = key.totalCost || 0
          const todayCostStr = todayCost > 0 ? ` (${this.formatCost(todayCost)})` : ''
          const totalCostStr = totalCost > 0 ? ` (${this.formatCost(totalCost)})` : ''

          return `• ${status} ${name}:\n  今日: ${this.formatNumber(todayRequests)} 请求, ${this.formatNumber(todayTokens)} tokens${todayCostStr}\n  总计: ${this.formatNumber(totalRequests)} 请求, ${this.formatNumber(totalTokens)} tokens${totalCostStr}${usage}`
        })
    } else if (
      dashboardData.apiKeysDetailedUsage &&
      dashboardData.apiKeysDetailedUsage.topUsedKeys
    ) {
      // 兼容旧格式
      apiKeysUsageSummary = dashboardData.apiKeysDetailedUsage.topUsedKeys
        .slice(0, 10)
        .map((key) => {
          const name =
            key.name && key.name !== '未命名' ? key.name : `Key-${key.id.substring(0, 8)}`
          const status = key.isActive ? '✅' : '❌'
          const usage = key.usagePercentage > 0 ? ` (${key.usagePercentage}% 已用)` : ''

          const totalRequests = key.actualTotalRequests || key.totalRequests || 0
          const totalTokens = key.actualTotalTokens || key.totalTokens || 0
          const todayRequests = key.todayRequests || 0
          const todayTokens = key.todayTokens || 0
          const todayCost = key.todayCost || 0
          const totalCost = key.totalCost || 0
          const todayCostStr = todayCost > 0 ? ` (${this.formatCost(todayCost)})` : ''
          const totalCostStr = totalCost > 0 ? ` (${this.formatCost(totalCost)})` : ''

          return `• ${status} ${name}:\n  今日: ${this.formatNumber(todayRequests)} 请求, ${this.formatNumber(todayTokens)} tokens${todayCostStr}\n  总计: ${this.formatNumber(totalRequests)} 请求, ${this.formatNumber(totalTokens)} tokens${totalCostStr}${usage}`
        })
    }

    return {
      title: '📊 Claude Relay Service 仪表盘报告',
      summary: `系统运行正常，共管理 ${overview.totalApiKeys || dashboardData.totalApiKeys || 0} 个API Keys和 ${overview.totalAccounts || dashboardData.totalAccounts || 0} 个服务账户`,
      stats: {
        apiKeys: `📱 API Keys: ${overview.totalApiKeys || dashboardData.totalApiKeys || 0} 个 (活跃: ${overview.activeApiKeys || dashboardData.activeApiKeys || 0})`,
        accounts: `🔐 服务账户: ${overview.totalAccounts || dashboardData.totalAccounts || 0} 个 (正常: ${overview.normalAccounts || dashboardData.normalAccounts || 0}, 异常: ${overview.abnormalAccounts || dashboardData.abnormalAccounts || 0})`,
        todayUsage: `📈 今日使用: ${this.formatNumber(recentActivity.requestsToday || dashboardData.todayRequests || 0)} 请求, ${this.formatNumber(totalTokensToday)} tokens`,
        todayCost: `💰 今日费用: ${systemCostSummary.todayFormattedCost || this.formatCost(recentActivity.costToday || 0)}`,
        totalUsage: `📊 总使用量: ${this.formatNumber(overview.totalRequestsUsed || dashboardData.totalRequests || 0)} 请求, ${this.formatNumber(totalTokensAll)} tokens`,
        totalCost: `💎 总费用: ${systemCostSummary.totalFormattedCost || this.formatCost(0)}`,
        realtime: `⚡ 实时指标: ${systemAverages.rpm || dashboardData.realtimeRPM || dashboardData.systemRPM || 0} RPM, ${this.formatNumber(systemAverages.tpm || dashboardData.realtimeTPM || dashboardData.systemTPM || 0)} TPM`,
        uptime: `⏱️ 运行时间: ${this.formatUptime(systemHealth.uptime || dashboardData.uptime || 0)}`
      },
      modelStats: dashboardData.modelStats.slice(0, 5).map((stat) => {
        // 尝试从系统费用统计中获取模型费用信息
        const modelCost =
          systemCostSummary.modelCosts &&
          systemCostSummary.modelCosts.find((m) => m.model === stat.model)
        const costStr =
          modelCost && modelCost.todayCost > 0 ? ` (今日: ${modelCost.formattedCost})` : ''
        return `• ${stat.model}: ${this.formatNumber(stat.allTokens)} tokens (${stat.requests} 请求)${costStr}`
      }),
      apiKeysUsage: apiKeysUsageSummary,
      timestamp: new Date(dashboardData.collectedAt).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  /**
   * 构建Slack格式的消息
   */
  buildSlackMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理图表数据并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const allChartFiles = chartsData?.files || {}
    const charts = this.filterEnabledCharts(allCharts)
    const chartFiles = {}
    Object.keys(charts).forEach(key => {
      if (allChartFiles[key]) {
        chartFiles[key] = allChartFiles[key]
      }
    })

    const message = {
      text: textSummary.title,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: textSummary.title
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: textSummary.summary
          }
        },
        {
          type: 'section',
          fields: Object.values(textSummary.stats).map((stat) => ({
            type: 'mrkdwn',
            text: stat
          }))
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎯 Top 5 模型使用情况:*\n' + textSummary.modelStats.join('\n')
          }
        },
        ...(textSummary.apiKeysUsage.length > 0
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*🔑 API Keys 今日使用情况:*\n' + textSummary.apiKeysUsage.join('\n')
                }
              }
            ]
          : []),
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📅 报告时间: ${textSummary.timestamp}`
            }
          ]
        }
      ]
    }

    // 如果有图表，添加图表附件（作为文件上传）
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      const availableCharts = Object.keys(charts)
        .map((key) => chartDescriptions[key] || key)
        .join('、')

      message.attachments = [
        {
          color: '#36a64f',
          title: '📊 详细图表',
          text: `📊 生成了 ${Object.keys(charts).length} 张数据可视化图表：${availableCharts}

🔑 **API Keys 专项分析图表**：
• 📋 使用统计对比图 - 今日请求 vs 总请求量
• 💰 费用分布分析图 - 成本占比和费用趋势
• ⚡ 活跃度趋势图 - 7天使用活跃度变化

✨ 这些图表提供了API Keys的全方位使用分析，帮助您了解资源消费情况和成本分布。`,
          footer: 'Claude Relay Service',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    }

    return message
  }

  /**
   * 构建Discord格式的消息
   */
  buildDiscordMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理图表数据并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const allChartFiles = chartsData?.files || {}
    const charts = this.filterEnabledCharts(allCharts)
    const chartFiles = {}
    Object.keys(charts).forEach(key => {
      if (allChartFiles[key]) {
        chartFiles[key] = allChartFiles[key]
      }
    })

    // 兼容新数据结构
    const overview = dashboardData.overview || {}
    const recentActivity = dashboardData.recentActivity || {}
    const systemAverages = dashboardData.systemAverages || {}
    const systemHealth = dashboardData.systemHealth || {}
    const systemCostSummary = dashboardData.systemCostSummary || {}

    const embed = {
      title: textSummary.title,
      description: textSummary.summary,
      color: 0x36a64f, // 绿色
      fields: [
        {
          name: '📱 API Keys',
          value: `${overview.totalApiKeys || dashboardData.totalApiKeys || 0} 个 (活跃: ${overview.activeApiKeys || dashboardData.activeApiKeys || 0})`,
          inline: true
        },
        {
          name: '🔐 服务账户',
          value: `${overview.totalAccounts || dashboardData.totalAccounts || 0} 个 (正常: ${overview.normalAccounts || dashboardData.normalAccounts || 0})`,
          inline: true
        },
        {
          name: '📈 今日使用',
          value: `${this.formatNumber(recentActivity.requestsToday || dashboardData.todayRequests || 0)} 请求\n${this.formatNumber((recentActivity.inputTokensToday || 0) + (recentActivity.outputTokensToday || 0) + (recentActivity.cacheCreateTokensToday || 0) + (recentActivity.cacheReadTokensToday || 0))} tokens\n💰 ${systemCostSummary.todayFormattedCost || this.formatCost(recentActivity.costToday || 0)}`,
          inline: true
        },
        {
          name: '⚡ 实时指标',
          value: `${systemAverages.rpm || dashboardData.realtimeRPM || 0} RPM\n${this.formatNumber(systemAverages.tpm || dashboardData.realtimeTPM || 0)} TPM`,
          inline: true
        },
        {
          name: '⏱️ 运行时间',
          value: this.formatUptime(systemHealth.uptime || dashboardData.uptime || 0),
          inline: true
        },
        {
          name: '🎯 Top 5 模型',
          value: textSummary.modelStats.join('\n') || '暂无数据',
          inline: false
        }
      ],
      timestamp: dashboardData.collectedAt,
      footer: {
        text: 'Claude Relay Service Dashboard'
      }
    }

    const message = {
      content: null,
      embeds: [embed]
    }

    // 如果有API Keys使用情况，添加额外的embed
    if (textSummary.apiKeysUsage.length > 0) {
      const apiKeysEmbed = {
        title: '🔑 API Keys 使用情况',
        description: textSummary.apiKeysUsage.slice(0, 5).join('\n'),
        color: 0x3b82f6, // 蓝色
        timestamp: dashboardData.collectedAt
      }

      message.embeds.push(apiKeysEmbed)
    }

    // 如果有图表，添加图表说明embed
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      const availableCharts = Object.keys(charts)
        .map((key) => chartDescriptions[key] || key)
        .join('、')

      const chartsEmbed = {
        title: '📊 图表报告',
        description: `📊 生成了 ${Object.keys(charts).length} 张数据可视化图表：${availableCharts}

🔑 **新增API Keys专项分析**：使用统计、费用分布、活跃度趋势`,
        color: 0x10b981, // 绿色
        timestamp: dashboardData.collectedAt,
        fields: [
          {
            name: '✨ 新增功能',
            value: '🔑 **API Keys 专项数据分析**\n• 📋 使用统计对比 - 今日 vs 总请求量\n• 💰 费用分布分析 - 成本占比和趋势\n• ⚡ 活跃度趋势追踪 - 7天使用变化\n\n🚀 **核心价值**：全方位显示API资源消费情况，优化成本控制',
            inline: false
          }
        ]
      }

      message.embeds.push(chartsEmbed)
    }

    return message
  }

  /**
   * 构建钉钉格式的消息
   */
  buildDingtalkMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理图表数据并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const charts = this.filterEnabledCharts(allCharts)

    let chartSection = ''
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      const availableCharts = Object.keys(charts)
        .map((key) => chartDescriptions[key] || key)
        .join('、')

      chartSection =
        `\n\n### 📊 图表报告\n` +
        `- **生成图表**: ${Object.keys(charts).length} 张\n` +
        `- **包含内容**: ${availableCharts}\n` +
        `- **🔑 API Keys专项分析**: 使用统计、费用分布、活跃度趋势\n` +
        `- **🚀 核心价值**: 全面展示API资源使用情况，优化成本控制`
    }

    const message = {
      msgtype: 'markdown',
      markdown: {
        title: textSummary.title,
        text:
          `# ${textSummary.title}\n\n` +
          `> ${textSummary.summary}\n\n` +
          `### 📊 系统统计\n` +
          `- ${textSummary.stats.apiKeys}\n` +
          `- ${textSummary.stats.accounts}\n` +
          `- ${textSummary.stats.todayUsage}\n` +
          `- ${textSummary.stats.todayCost}\n` +
          `- ${textSummary.stats.totalUsage}\n` +
          `- ${textSummary.stats.totalCost}\n` +
          `- ${textSummary.stats.realtime}\n` +
          `- ${textSummary.stats.uptime}\n\n` +
          `### 🎯 Top 5 模型使用\n` +
          textSummary.modelStats.map((stat) => `- ${stat}`).join('\n') +
          (textSummary.apiKeysUsage.length > 0
            ? `\n\n### 🔑 API Keys 使用情况\n` +
              textSummary.apiKeysUsage
                .slice(0, 5)
                .map((stat) => `- ${stat}`)
                .join('\n')
            : '') +
          chartSection +
          `\n\n---\n📅 **报告时间**: ${textSummary.timestamp}`
      }
    }

    return message
  }

  /**
   * 构建飞书格式的消息（异步，支持图片上传）
   */
  async buildFeishuMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理新的图表数据格式并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const allChartFiles = chartsData?.files || {}
    const charts = this.filterEnabledCharts(allCharts)
    const chartFiles = {}
    Object.keys(charts).forEach(key => {
      if (allChartFiles[key]) {
        chartFiles[key] = allChartFiles[key]
      }
    })

    // 🔥 优先尝试使用图片服务器URL的方式显示图表
    if (charts && Object.keys(charts).length > 0 && this.webhookType === 'feishu') {
      try {
        console.log('🔥 Using Feishu image upload (real image_key)...')
        return await this.buildFeishuWithRealImages_backup(textSummary, charts, chartFiles)
      } catch (uploadError) {
        console.error('❌ Image upload failed, cannot send charts as links are disabled:', uploadError.message)
        console.error('📤 Sending text-only message without charts')
        return this.buildFeishuTextMessage(textSummary, charts, chartFiles)
      }
    } else {
      // 回退到普通文本消息
      return this.buildFeishuTextMessage(textSummary, charts, chartFiles)
    }
  }

  /**
   * 🔥 构建使用图片服务器URL的飞书消息
   */
  async buildFeishuWithChartServerImages(textSummary, charts, chartFiles) {
    console.log('🔥 Building Feishu message with chart server images...')

    // 基于配置选择启用的图表，按优先级排序
    const enabledCharts = this.getEnabledChartsList()
    const availableCharts = enabledCharts.filter(key => charts[key] && chartFiles[key])
    
    console.log(`📊 Found ${availableCharts.length} priority charts with files:`, availableCharts)

    if (availableCharts.length === 0) {
      throw new Error('No charts with saved files available')
    }

    const chartDescriptions = {
      apiKeyUsage: '📋 API Keys使用统计对比',
      apiKeyCost: '💰 API Keys费用分布分析',
      systemOverview: '📊 系统概览图表',
      modelDistribution: '📈 模型分布图表'
    }

    // 构建主消息卡片
    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '🔥 Claude Relay Service - API用量统计图表报告'
          }
        },
        elements: [
          // 系统概要
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**${textSummary.summary}**`
            }
          },
          {
            tag: 'hr'
          },
          // API Keys专项分析说明
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🔑 API Keys专项数据分析图表** (${availableCharts.length}张)\n\n` +
                       `• 📋 **使用统计对比** - 今日请求 vs 总请求量\n` +
                       `• 💰 **费用分布分析** - 成本占比和趋势\n` +
                       `• 📊 **系统概览** - 整体运行状态\n` +
                       `• 📈 **模型分布** - 各模型使用情况\n\n` +
                       `🚀 **核心价值**: 全方位展示API资源使用情况，优化成本控制`
            }
          }
        ]
      }
    }

    // 为每个图表添加图片显示
    availableCharts.forEach((chartKey, index) => {
      const chartFile = chartFiles[chartKey]
      const description = chartDescriptions[chartKey] || chartKey
      const imageUrl = `http://localhost:8081/charts/${chartFile.filename}`
      
      console.log(`🔗 Adding chart ${chartKey}: ${imageUrl}`)

      // 添加分割线
      if (index > 0) {
        message.card.elements.push({ tag: 'hr' })
      }

      // 添加图表标题
      message.card.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${description}**`
        }
      })

      // 添加图片链接（飞书不支持外部URL作为img_key，改为链接形式）
      message.card.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `🔗 [📊 点击查看高清图表](${imageUrl})`
        }
      })

      // 添加图表链接
      message.card.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `🔗 [点击查看高清图表](${imageUrl})`
        }
      })
    })

    // 添加统计信息
    message.card.elements.push(
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 统计数据**\n` +
                   `${textSummary.stats.apiKeys}\n` +
                   `${textSummary.stats.todayUsage}\n` +
                   `${textSummary.stats.todayCost}\n\n` +
                   `📅 **报告时间**: ${textSummary.timestamp}`
        }
      }
    )

    console.log(`✅ Built Feishu message with ${availableCharts.length} chart images`)
    return message
  }

  /**
   * 🔥 构建包含真实图片的飞书消息（先上传获取image_key） - 备用方案
   */
  async buildFeishuWithRealImages_backup(textSummary, charts, chartFiles) {
    console.log('🔥 Building Feishu message with REAL image uploads...')

    // 初始化飞书图片上传器
    const imageUploader = new FeishuImageUploader(this.webhookUrl)

    // 🔑 基于配置选择启用的图表进行上传（使用完整图表）
    const enabledCharts = this.filterEnabledCharts(charts)
    const priorityOrder = this.getEnabledChartsList()
    
    // 按优先级排序，基于配置启用的图表优先
    const sortedCharts = Object.entries(enabledCharts).sort(([keyA], [keyB]) => {
      const indexA = priorityOrder.indexOf(keyA)
      const indexB = priorityOrder.indexOf(keyB)
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    
    const selectedCharts = sortedCharts // 显示所有启用的图表，不限制数量

    console.log(`🔥 Will attempt to upload ${selectedCharts.length} full-size charts in priority order:`, selectedCharts.map(([key]) => key))

    if (selectedCharts.length === 0) {
      console.warn('⚠️ No enabled charts available for upload')
      throw new Error('No charts to upload')
    }

    // 🔥 上传图片获取真实的 image_key
    const uploadResults = []
    for (const [chartKey, chart] of selectedCharts) {
      console.log(`📤 Uploading ${chartKey}...`)
      const result = await imageUploader.uploadImage(chart.buffer, `${chartKey}.png`)
      uploadResults.push({
        chartKey: chartKey,
        chart: chart,
        uploadResult: result
      })

      if (result.success) {
        console.log(`✅ Successfully uploaded ${chartKey}: ${result.image_key}`)
      } else {
        console.error(`❌ Failed to upload ${chartKey}: ${result.error}`)
      }
    }

    // 检查有多少图片上传成功
    const successfulUploads = uploadResults.filter((r) => r.uploadResult.success)
    console.log(`📊 Upload results: ${successfulUploads.length}/${uploadResults.length} successful`)

    if (successfulUploads.length === 0) {
      console.error('💥 No images were uploaded successfully')
      throw new Error('All image uploads failed')
    }

    // 🔥 构建包含真实图片的消息
    return await this.buildFeishuMultipleRealImageMessages(textSummary, successfulUploads, charts)
  }

  /**
   * 🔥 构建多条包含真实图片的飞书消息
   */
  async buildFeishuMultipleRealImageMessages(textSummary, successfulUploads, allCharts) {
    const chartDescriptions = {
      systemOverview: '📊 系统概览图表',
      apiKeyUsage: '📋 API Keys使用统计',
      apiKeyCost: '💰 API Keys费用分布',
      modelDistribution: '📈 模型分布图表',
      usageTrend: '📉 使用趋势图表',
      apiKeyActivity: '⚡ API Keys活跃度',
      apiKeysTrend: '🔑 API Keys趋势'
    }

    const messages = []

    // 1. 主消息 - 系统信息与统计（更详细的信息卡片）
    const mainMessage = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'green',
          title: {
            tag: 'lark_md',
            content: '🔥 Claude Relay Service 实时图表报告'
          }
        },
        elements: [
          // 系统状态摘要
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**${textSummary.summary}**`
            }
          },
          {
            tag: 'hr'
          },
          // 详细统计数据 - 2x2网格布局
          {
            tag: 'column_set',
            flex_mode: 'none',
            background_style: 'grey',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
                    }
                  },
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**🔐 服务账户**\n${textSummary.stats.accounts.replace('🔐 服务账户: ', '')}`
                    }
                  }
                ]
              },
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**📈 今日使用**\n${textSummary.stats.todayUsage.replace('📈 今日使用: ', '')}`
                    }
                  },
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
                    }
                  }
                ]
              }
            ]
          },
          {
            tag: 'hr'
          },
          // 实时指标与运行时间
          {
            tag: 'column_set',
            flex_mode: 'none',
            background_style: 'default',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**⚡ 实时指标**\n${textSummary.stats.realtime.replace('⚡ 实时指标: ', '')}`
                    }
                  }
                ]
              },
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**⏱️ 运行时间**\n${textSummary.stats.uptime.replace('⏱️ 运行时间: ', '')}`
                    }
                  }
                ]
              }
            ]
          },
          {
            tag: 'hr'
          },
          // 总计统计数据
          {
            tag: 'column_set',
            flex_mode: 'none',
            background_style: 'grey',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**📊 总使用量**\n${textSummary.stats.totalUsage.replace('📊 总使用量: ', '')}`
                    }
                  }
                ]
              },
              {
                tag: 'column',
                width: 'weighted',
                weight: 1,
                elements: [
                  {
                    tag: 'div',
                    text: {
                      tag: 'lark_md',
                      content: `**💎 总费用**\n${textSummary.stats.totalCost.replace('💎 总费用: ', '')}`
                    }
                  }
                ]
              }
            ]
          },
          // API Keys详细使用情况
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🔑 API Keys 使用详情** (前10个)`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content:
                textSummary.apiKeysUsage && textSummary.apiKeysUsage.length > 0
                  ? textSummary.apiKeysUsage.slice(0, 5).join('\n')
                  : '暂无API Key使用数据'
            }
          },
          {
            tag: 'hr'
          },
          // 模型使用统计
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**🤖 模型使用统计**\n${
                textSummary.modelStats && textSummary.modelStats.length > 0
                  ? textSummary.modelStats.map((stat) => `${stat}`).join('\n')
                  : '暂无模型统计数据'
              }`
            }
          }
        ]
      }
    }

    // 为上传成功的所有图表添加到消息中（按配置优先级排序）
    const priorityOrder = this.getEnabledChartsList()
    const sortedUploads = successfulUploads.sort(({ chartKey: a }, { chartKey: b }) => {
      const indexA = priorityOrder.indexOf(a)
      const indexB = priorityOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })

    // 在主消息中添加所有上传成功的图表
    sortedUploads.forEach(({ chartKey, uploadResult }) => {
      // 添加分隔线
      mainMessage.card.elements.push({
        tag: 'hr'
      })

      // 添加图表标题和描述
      const chartTitle = chartDescriptions[chartKey] || chartKey
      mainMessage.card.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${chartTitle}**`
        }
      })

      // 添加图片（图片本身应该包含数据标签）
      console.log(`🖼️ Adding image with key: ${uploadResult.image_key} for chart: ${chartKey}`)
      mainMessage.card.elements.push({
        tag: 'img',
        img_key: uploadResult.image_key,
        alt: {
          tag: 'plain_text',
          content: chartTitle
        },
        mode: 'fit_horizontal',
        corner_radius: 4
      })
    })

    // 添加时间戳
    mainMessage.card.elements.push({
      tag: 'hr'
    })
    mainMessage.card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**📅 报告生成时间：${textSummary.timestamp}**`
      }
    })

    console.log(
      `🔥 Created unified message with ${successfulUploads.length} embedded charts and detailed statistics`
    )

    // 🔍 调试：检查消息中的所有img_key
    const imgElements = mainMessage.card.elements.filter(el => el.tag === 'img')
    console.log(`🔍 Debug: Found ${imgElements.length} img elements in message`)
    imgElements.forEach((el, i) => {
      console.log(`🔍 Image ${i + 1}: img_key = "${el.img_key}", type = ${typeof el.img_key}`)
    })

    // 返回单一消息
    return mainMessage
  }

  /**
   * 🎯 构建增强版飞书卡片（丰富的图表信息，放弃图片嵌入）
   */
  async buildFeishuEnhancedCard(textSummary, charts, chartFiles) {
    const chartDescriptions = {
      systemOverview: '📊 系统概览',
      modelDistribution: '📈 模型分布',
      usageTrend: '📉 使用趋势',
      apiKeysTrendRequests: '🔑 API Keys请求趋势',
      apiKeysTrendTokens: '🔑 API KeysToken趋势',
      apiKeyUsage: '📋 API Keys使用统计',
      apiKeyCost: '💰 API Keys费用分布',
      apiKeyActivity: '⚡ API Keys活跃度'
    }

    console.log('🎯 Building feature-rich Feishu card with detailed chart info...')

    const availableCharts = Object.keys(charts)
      .filter((key) => !key.endsWith('_tiny')) // 只显示正常尺寸图表信息

    console.log(`📊 Will display info for ${availableCharts.length} charts`)

    const cardElements = [
      // 标题和摘要
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${textSummary.summary}**`
        }
      },
      {
        tag: 'hr'
      },
      // 系统统计（详细版）
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📈 今日使用**\n${textSummary.stats.todayUsage.replace('📈 今日使用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**⚡ 实时指标**\n${textSummary.stats.realtime.replace('⚡ 实时指标: ', '')}`
            }
          }
        ]
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 图表数据分析** (${availableCharts.length}张)`
        }
      }
    ]

    // 为每个图表添加详细信息卡片
    availableCharts.forEach((chartKey, index) => {
      const description = chartDescriptions[chartKey] || chartKey
      const chart = charts[chartKey]
      const chartFileInfo = chartFiles[chartKey]
      const size = chart?.buffer?.length || chart?.size || 0
      const dimensions = chart ? `${chart.width || 800}x${chart.height || 400}` : '未知'

      // 为每个图表创建一个信息区块
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            `**${index + 1}. ${description}**\n` +
            `📐 尺寸: ${dimensions} | 📦 大小: ${this.formatBytes(size)}`
        }
      })

      if (chartFileInfo) {
        const fileUrl = `http://localhost:8081/charts/${chartFileInfo.filename}`
        cardElements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `🔗 [查看 ${description}](${fileUrl})`
          }
        })
      }
    })

    // 添加快捷操作区
    cardElements.push({
      tag: 'hr'
    })

    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content:
          `**🚀 快捷操作**\n` +
          `• [🖼️ 图表画廊](http://localhost:8081/) - 查看所有图表\n` +
          `• [📋 文件列表](http://localhost:8081/list) - 图表文件列表\n` +
          `• [📊 实时数据](http://localhost:8081/stats) - 系统统计信息`
      }
    })

    // API Keys使用情况（详细版）
    if (textSummary.apiKeysUsage.length > 0) {
      cardElements.push({
        tag: 'hr'
      })

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🔑 Top API Keys 今日表现**`
        }
      })

      // 显示前5个API Keys的详细信息
      textSummary.apiKeysUsage.slice(0, 5).forEach((stat, idx) => {
        const lines = stat.split('\n')
        const name = lines[0] // API Key名称和状态
        const todayInfo = lines[1] // 今日数据
        const totalInfo = lines[2] // 总计数据

        cardElements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${idx + 1}.** ${name}\n${todayInfo || ''}\n${totalInfo || ''}`
          }
        })
      })
    }

    // 添加时间戳和生成信息
    cardElements.push({
      tag: 'hr'
    })

    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content:
          `📅 **${textSummary.timestamp}**\n` +
          `✨ 包含 ${availableCharts.length} 张数据图表 | 🔥 实时生成`
      }
    })

    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '📊 Claude Relay Service 完整仪表盘'
          }
        },
        elements: cardElements
      }
    }

    // 检查消息大小
    const messageSize = JSON.stringify(message).length
    console.log(`🎯 Enhanced card size: ${this.formatBytes(messageSize)} (limit: 30KB)`)

    if (messageSize > 30720) {
      console.warn(
        `⚠️ Enhanced message too large (${this.formatBytes(messageSize)}), falling back to optimized version`
      )
      throw new Error(`Message too large: ${this.formatBytes(messageSize)}`)
    }

    console.log(
      `🎯 Enhanced Feishu card built successfully with ${availableCharts.length} chart info blocks`
    )
    return message
  }

  /**
   * 🔥 构建多条飞书消息（主消息 + 每张图片一条消息）
   */
  async buildFeishuMultipleMessages(textSummary, charts, chartFiles) {
    console.log('🔥 Building multiple Feishu messages with individual image messages...')

    // 筛选超小图片
    const tinyCharts = this.filterTinyCharts(charts)
    const selectedCharts = Object.entries(tinyCharts) // 显示所有启用的图表

    console.log(
      `🔥 Will send ${1 + selectedCharts.length} messages (1 main + ${selectedCharts.length} images)`
    )

    const messages = []

    // 1. 主消息 - 系统信息
    const mainMessage = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '📊 Claude Relay Service 仪表盘报告'
          }
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**${textSummary.summary}**`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            fields: [
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**📈 今日使用**\n${textSummary.stats.todayUsage.replace('📈 今日使用: ', '')}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
                }
              },
              {
                is_short: true,
                text: {
                  tag: 'lark_md',
                  content: `**⚡ 实时指标**\n${textSummary.stats.realtime.replace('⚡ 实时指标: ', '')}`
                }
              }
            ]
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**📊 数据图表**\n🔥 即将发送 ${selectedCharts.length} 张实时图表...`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `📅 ${textSummary.timestamp}`
            }
          }
        ]
      }
    }

    messages.push({
      type: 'main',
      message: mainMessage,
      description: '主要仪表盘信息'
    })

    // 2. 图片消息 - 每张图片一条简单消息
    const chartDescriptions = {
      systemOverview_tiny: '📊 系统概览图表',
      apiKeyUsage_tiny: '📋 API Keys使用统计',
      apiKeyCost_tiny: '💰 API Keys费用分布',
      modelDistribution_tiny: '📈 模型分布图表'
    }

    selectedCharts.forEach(([chartKey, chart], index) => {
      const description = chartDescriptions[chartKey] || chartKey.replace('_tiny', '')

      // 🔥 使用图片服务器URL，让飞书自动抓取
      const chartFileInfo = chartFiles[chartKey.replace('_tiny', '')]
      let imageUrl = null

      if (chartFileInfo) {
        // 使用图片服务器提供的URL
        imageUrl = `http://localhost:8081/charts/${chartFileInfo.filename}`
        console.log(`🔗 Using chart server URL: ${imageUrl}`)
      } else {
        // 临时保存超小图片到服务器
        const tempFilename = `${chartKey}_${Date.now()}.png`
        const tempPath = path.join(process.cwd(), 'charts', tempFilename)

        try {
          fs.writeFileSync(tempPath, chart.buffer)
          imageUrl = `http://localhost:8081/charts/${tempFilename}`
          console.log(`💾 Saved tiny chart to: ${tempPath}`)
          console.log(`🔗 Generated URL: ${imageUrl}`)
        } catch (error) {
          console.error(`❌ Failed to save tiny chart: ${error.message}`)
          imageUrl = `http://localhost:8081/` // 回退到主页
        }
      }

      // 🔥 使用飞书富文本消息，尝试显示图片预览
      const imageMessage = {
        msg_type: 'post',
        content: {
          post: {
            zh_cn: {
              title: description,
              content: [
                [
                  {
                    tag: 'text',
                    text: `🔥 ${description}\n\n`,
                    style: ['bold']
                  }
                ],
                [
                  {
                    tag: 'a',
                    text: '点击查看图表',
                    href: imageUrl
                  }
                ],
                [
                  {
                    tag: 'text',
                    text: `\n\n📊 图片大小: ${this.formatBytes(chart.size)}\n📐 尺寸: ${chart.width}x${chart.height}`
                  }
                ]
              ]
            }
          }
        }
      }

      messages.push({
        type: 'image',
        message: imageMessage,
        description: description,
        size: chart.size,
        chartKey: chartKey
      })

      console.log(
        `🔥 Prepared image message ${index + 1}: ${description} (${this.formatBytes(chart.size)})`
      )
    })

    console.log(`🔥 Prepared ${messages.length} messages for sequential sending`)

    return {
      type: 'multiple',
      messages: messages,
      summary: {
        main: 1,
        images: selectedCharts.length,
        total: messages.length
      }
    }
  }


  /**
   * 🔥 构建包含超小图片的飞书消息
   */
  async buildFeishuWithTinyImages(textSummary, tinyCharts, allCharts, chartFiles) {
    const chartDescriptions = {
      systemOverview_tiny: '📊 系统概览',
      apiKeyUsage_tiny: '📋 API Keys使用',
      apiKeyCost_tiny: '💰 API Keys费用',
      modelDistribution_tiny: '📈 模型分布'
    }

    console.log('🔥 Building Feishu message with embedded tiny images...')

    // 计算总的图片大小
    let totalImageSize = 0
    Object.values(tinyCharts).forEach((chart) => {
      totalImageSize += chart.size
    })
    console.log(`📏 Total tiny images size: ${this.formatBytes(totalImageSize)}`)

    // 如果图片总大小超过15KB，减少数量
    let selectedCharts = Object.entries(tinyCharts)
    if (totalImageSize > 15360) {
      // 15KB
      console.log('⚠️ Tiny images still too large, selecting only 2 smallest...')
      selectedCharts = selectedCharts.sort(([, a], [, b]) => a.size - b.size).slice(0, 2)
    }

    const cardElements = [
      // 标题和摘要
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${textSummary.summary}**`
        }
      },
      {
        tag: 'hr'
      },
      // 系统统计（精简版）
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
            }
          }
        ]
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 实时图表** (${selectedCharts.length}张)`
        }
      }
    ]

    // 🔥 添加超小尺寸图片
    selectedCharts.forEach(([chartKey, chart]) => {
      const description = chartDescriptions[chartKey] || chartKey.replace('_tiny', '')

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${description}**`
        }
      })

      // 直接嵌入Base64图片
      cardElements.push({
        tag: 'img',
        img_key: chart.dataUrl,
        alt: description,
        title: description,
        width: chart.width,
        height: chart.height
      })

      console.log(`🔥 Embedded ${chartKey}: ${description}, size: ${this.formatBytes(chart.size)}`)
    })

    // 添加更多图表的链接
    const remainingCount = Object.keys(allCharts).length - selectedCharts.length
    if (remainingCount > 0) {
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `📈 还有 ${remainingCount} 张大尺寸图表: [查看全部](http://localhost:8081/)`
        }
      })
    }

    // 添加时间戳
    cardElements.push({
      tag: 'hr'
    })
    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📅 ${textSummary.timestamp}`
      }
    })

    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '🔥 Claude Relay Service 实时图表'
          }
        },
        elements: cardElements
      }
    }

    // 🔥 最终检查消息大小
    const messageSize = JSON.stringify(message).length
    console.log(`🔥 Final message size: ${this.formatBytes(messageSize)} (limit: 30KB)`)

    if (messageSize > 30720) {
      // 30KB
      console.error(
        `💥 Message still too large (${this.formatBytes(messageSize)}), this shouldn't happen!`
      )
      throw new Error(`Message too large even with tiny images: ${this.formatBytes(messageSize)}`)
    }

    console.log(
      `🎉 Successfully built Feishu message with ${selectedCharts.length} embedded images!`
    )
    return message
  }

  /**
   * 构建优化的飞书卡片消息（避免30KB限制）
   */
  async buildFeishuOptimizedCard(textSummary, charts, chartFiles) {
    const chartDescriptions = {
      systemOverview: '📊 系统概览',
      modelDistribution: '📈 模型分布',
      usageTrend: '📉 使用趋势',
      apiKeysTrendRequests: '🔑 API Keys请求趋势',
      apiKeysTrendTokens: '🔑 API KeysToken趋势',
      apiKeyUsage: '📋 API Keys使用统计',
      apiKeyCost: '💰 API Keys费用分布',
      apiKeyActivity: '⚡ API Keys活跃度'
    }

    console.log('🎯 Building lightweight Feishu card (no Base64 images)...')

    const availableCharts = Object.keys(charts) // 显示所有启用的图表信息
    console.log(`📊 Will display info for ${availableCharts.length} charts`)

    // 构建卡片元素 - 紧凑版本
    const cardElements = [
      // 标题和摘要
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${textSummary.summary}**`
        }
      },
      {
        tag: 'hr'
      },
      // 系统统计（简化版）
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📈 今日使用**\n${textSummary.stats.todayUsage.replace('📈 今日使用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**⚡ 实时指标**\n${textSummary.stats.realtime.replace('⚡ 实时指标: ', '')}`
            }
          }
        ]
      }
    ]

    // 添加图表信息（紧凑格式，不嵌入图片）
    if (availableCharts.length > 0) {
      cardElements.push({
        tag: 'hr'
      })

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 数据图表** (${availableCharts.length}张)`
        }
      })

      // 为每个图表添加链接按钮
      availableCharts.forEach((chartKey) => {
        const description = chartDescriptions[chartKey] || chartKey
        const chartFileInfo = chartFiles[chartKey]
        const fileUrl = chartFileInfo
          ? `http://localhost:8081/charts/${chartFileInfo.filename}`
          : null
        const chart = charts[chartKey]
        const size = chart?.buffer?.length || chart?.size || 0

        let content = `• **${description}**\n`
        content += `📐 大小: ${this.formatBytes(size)}\n`

        if (fileUrl) {
          content += `🔗 [点击查看图表](${fileUrl})\n`
        } else {
          content += `🔗 [图表画廊](http://localhost:8081/)\n`
        }

        cardElements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: content
          }
        })
      })

      // 添加快捷访问
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `🖼️ **快捷访问**\n• [📊 图表画廊](http://localhost:8081/) - 查看所有图表\n• [📋 图表列表](http://localhost:8081/list) - 文件列表`
        }
      })
    }

    // 添加API Keys使用情况（精简）
    if (textSummary.apiKeysUsage.length > 0) {
      cardElements.push({
        tag: 'hr'
      })

      const topKeys = textSummary.apiKeysUsage
        .slice(0, 3)
        .map((stat) => {
          // 只保留第一行（API Key名称和状态）
          return stat.split('\n')[0]
        })
        .join('\n')

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🔑 Top API Keys**\n${topKeys}`
        }
      })
    }

    // 添加时间戳
    cardElements.push({
      tag: 'hr'
    })

    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📅 ${textSummary.timestamp}`
      }
    })

    const message = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '📊 Claude Relay Service 仪表盘报告'
          }
        },
        elements: cardElements
      }
    }

    // 检查消息大小
    const messageSize = JSON.stringify(message).length
    console.log(`📦 Optimized message size: ${this.formatBytes(messageSize)} (limit: 30KB)`)

    if (messageSize > 30720) {
      // 30KB = 30720 bytes
      console.warn(
        `⚠️ Message still too large (${this.formatBytes(messageSize)}), falling back to ultra-compact version`
      )
      throw new Error(`Message too large: ${this.formatBytes(messageSize)}`)
    }

    return message
  }

  /**
   * 构建包含Base64图片的飞书富文本消息（已废弃 - 超出30KB限制）
   */
  async buildFeishuRichTextWithImages(textSummary, charts, chartFiles) {
    const chartDescriptions = {
      systemOverview: '📊 系统概览',
      modelDistribution: '📈 模型分布',
      usageTrend: '📉 使用趋势',
      apiKeysTrendRequests: '🔑 API Keys请求趋势',
      apiKeysTrendTokens: '🔑 API KeysToken趋势',
      apiKeyUsage: '📋 API Keys使用统计',
      apiKeyCost: '💰 API Keys费用分布',
      apiKeyActivity: '⚡ API Keys活跃度'
    }

    console.log('🎨 Building Feishu rich text message with images...')

    // 构建富文本内容
    const richContent = []

    // 添加标题
    richContent.push([
      {
        tag: 'text',
        text: textSummary.title,
        style: ['bold', 'underline']
      }
    ])

    richContent.push([
      {
        tag: 'text',
        text: '\n\n' + textSummary.summary + '\n\n'
      }
    ])

    // 添加系统统计
    richContent.push([
      {
        tag: 'text',
        text: '📊 系统统计:\n',
        style: ['bold']
      }
    ])

    Object.values(textSummary.stats).forEach((stat) => {
      richContent.push([
        {
          tag: 'text',
          text: '• ' + stat + '\n'
        }
      ])
    })

    // 添加图片部分
    const availableCharts = Object.keys(charts) // 显示所有启用的图表
    if (availableCharts.length > 0) {
      richContent.push([
        {
          tag: 'text',
          text: '\n📊 数据图表:\n',
          style: ['bold']
        }
      ])

      for (const chartKey of availableCharts) {
        const chart = charts[chartKey]
        const description = chartDescriptions[chartKey] || chartKey

        richContent.push([
          {
            tag: 'text',
            text: `\n${description}:\n`,
            style: ['bold']
          }
        ])

        if (chart && chart.buffer) {
          try {
            const base64Data = chart.buffer.toString('base64')
            const imageSize = chart.buffer.length
            console.log(
              `📊 Adding image ${chartKey}: ${description}, size: ${this.formatBytes(imageSize)}`
            )

            // 添加图片元素 - 使用飞书的image元素
            richContent.push([
              {
                tag: 'img',
                image_key: `data:image/png;base64,${base64Data}`,
                width: 600,
                height: 400
              }
            ])

            // 添加图片说明
            richContent.push([
              {
                tag: 'text',
                text: `图片大小: ${this.formatBytes(imageSize)}\n`
              }
            ])
          } catch (error) {
            console.warn(`⚠️ Failed to add image ${chartKey}:`, error.message)
            richContent.push([
              {
                tag: 'text',
                text: `❌ 图片加载失败: ${description}\n`
              }
            ])
          }
        } else if (chartFiles[chartKey]) {
          const fileUrl = `http://localhost:8081/charts/${chartFiles[chartKey].filename}`
          richContent.push([
            {
              tag: 'a',
              text: '🔗 点击查看图表',
              href: fileUrl
            }
          ])
          richContent.push([
            {
              tag: 'text',
              text: '\n'
            }
          ])
        } else {
          richContent.push([
            {
              tag: 'text',
              text: `⚠️ 图表数据不可用: ${description}\n`
            }
          ])
        }
      }
    }

    // 添加时间戳
    richContent.push([
      {
        tag: 'text',
        text: `\n📅 报告时间: ${textSummary.timestamp}`
      }
    ])

    // 飞书富文本消息格式
    return {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: textSummary.title,
            content: richContent
          }
        }
      }
    }
  }

  /**
   * 构建包含图片的飞书卡片消息
   */
  async buildFeishuCardWithImages(textSummary, charts, chartFiles) {
    const chartDescriptions = {
      systemOverview: '📊 系统概览',
      modelDistribution: '📈 模型分布',
      usageTrend: '📉 使用趋势',
      apiKeysTrendRequests: '🔑 API Keys请求趋势',
      apiKeysTrendTokens: '🔑 API KeysToken趋势',
      apiKeyUsage: '📋 API Keys使用统计',
      apiKeyCost: '💰 API Keys费用分布',
      apiKeyActivity: '⚡ API Keys活跃度'
    }

    // 直接使用Base64图片，跳过飞书API上传（因为webhook不支持）
    console.log('📊 Using Base64 images for Feishu card...')
    const availableCharts = Object.keys(charts) // 显示所有启用的图表
    console.log(`📊 Will embed ${availableCharts.length} charts directly in card`)

    // 构建卡片元素
    const cardElements = [
      // 标题和摘要
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${textSummary.summary}**`
        }
      },
      {
        tag: 'hr'
      },
      // 系统统计（简化版）
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📱 API Keys**\n${textSummary.stats.apiKeys.replace('📱 API Keys: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**📈 今日使用**\n${textSummary.stats.todayUsage.replace('📈 今日使用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**💰 今日费用**\n${textSummary.stats.todayCost.replace('💰 今日费用: ', '')}`
            }
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**⚡ 实时指标**\n${textSummary.stats.realtime.replace('⚡ 实时指标: ', '')}`
            }
          }
        ]
      }
    ]

    // 添加图表部分 - 直接使用Base64图片
    if (availableCharts.length > 0) {
      cardElements.push({
        tag: 'hr'
      })

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 数据图表** (${availableCharts.length}张)`
        }
      })

      // 为每个图表添加图片显示
      availableCharts.forEach((chartKey) => {
        const chart = charts[chartKey]
        const description = chartDescriptions[chartKey] || chartKey

        cardElements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${description}**`
          }
        })

        // 尝试多种方式显示图片
        if (chart && (chart.dataUrl || chart.buffer)) {
          let imageData = ''
          let imageSize = 0

          if (chart.dataUrl) {
            imageData = chart.dataUrl
            imageSize = chart.dataUrl.length
          } else if (chart.buffer) {
            const base64Data = chart.buffer.toString('base64')
            imageData = `data:image/png;base64,${base64Data}`
            imageSize = imageData.length
          }

          console.log(
            `📊 Processing ${chartKey}: ${description}, size: ${this.formatBytes(imageSize)}`
          )

          // 飞书可能不支持Base64，尝试多种方式
          // 方案1: 尝试使用img标签
          cardElements.push({
            tag: 'img',
            img_key: imageData,
            alt: description,
            title: description,
            width: 600,
            height: 400
          })

          // 方案2: 同时提供文本说明和链接（备用）
          const chartFileInfo = chartFiles[chartKey]
          const fileUrl = chartFileInfo
            ? `http://localhost:8081/charts/${chartFileInfo.filename}`
            : null

          cardElements.push({
            tag: 'div',
            text: {
              tag: 'lark_md',
              content:
                `📊 图表信息: ${description}\n` +
                `📐 尺寸: ${this.formatBytes(imageSize)}\n` +
                (fileUrl
                  ? `🔗 备用链接: ${fileUrl}`
                  : `💡 如图片无法显示，请访问 http://localhost:8081/`)
            }
          })
        } else {
          // 显示图表信息但无法显示图片
          cardElements.push({
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `⚠️ ${description}: 图表已生成但无法获取图片数据\n🔗 请访问图表服务器: http://localhost:8081/`
            }
          })
        }
      })

      // 如果还有更多图表
      if (Object.keys(charts).length > availableCharts.length) {
        const remaining = Object.keys(charts).length - availableCharts.length
        cardElements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `📈 还有 ${remaining} 张图表可通过链接查看: http://localhost:8081/`
          }
        })
      }
    }

    // 添加API Keys使用情况（简化）
    if (textSummary.apiKeysUsage.length > 0) {
      cardElements.push({
        tag: 'hr'
      })

      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🔑 API Keys 今日使用情况**\n${textSummary.apiKeysUsage
            .slice(0, 3)
            .map((stat) => `• ${stat.split('\n')[0]}`)
            .join('\n')}`
        }
      })
    }

    // 添加时间戳
    cardElements.push({
      tag: 'hr'
    })

    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📅 **报告时间**: ${textSummary.timestamp}`
      }
    })

    return {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '📊 Claude Relay Service 仪表盘报告'
          }
        },
        elements: cardElements
      }
    }
  }

  /**
   * 构建飞书普通文本消息（回退选项）
   */
  buildFeishuTextMessage(textSummary, charts = {}, chartFiles = {}) {
    let chartSection = ''
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      const availableCharts = Object.keys(charts)
        .map((key) => chartDescriptions[key] || key)
        .join('、')

      chartSection =
        `\n\n📊 图表报告 (${Object.keys(charts).length}张):\n` +
        `生成了以下图表：${availableCharts}\n` +
        `🔑 **API Keys专项数据分析**：\n` +
        `• 📋 使用统计对比 - 今日 vs 总请求量\n` +
        `• 💰 费用分布分析 - 成本占比和趋势\n` +
        `• ⚡ 活跃度趋势追踪 - 7天使用变化\n\n`

      // 添加图表访问链接
      chartSection += `🖼️ 查看图表:\n`
      chartSection += `• 图表画廊: http://localhost:8081/\n`
      chartSection += `• 图表列表: http://localhost:8081/list\n`

      if (Object.keys(chartFiles).length > 0) {
        chartSection += `\n📈 直接访问:\n`
        Object.entries(chartFiles).forEach(([key, file]) => {
          const description = chartDescriptions[key] || key
          const url = `http://localhost:8081/charts/${file.filename}`
          chartSection += `• ${description}: ${url}\n`
        })
      }
    }

    const message = {
      msg_type: 'text',
      content: {
        text:
          `${textSummary.title}\n\n` +
          `${textSummary.summary}\n\n` +
          `📊 系统统计:\n` +
          `${textSummary.stats.apiKeys}\n` +
          `${textSummary.stats.accounts}\n` +
          `${textSummary.stats.todayUsage}\n` +
          `${textSummary.stats.todayCost}\n` +
          `${textSummary.stats.totalUsage}\n` +
          `${textSummary.stats.totalCost}\n` +
          `${textSummary.stats.realtime}\n` +
          `${textSummary.stats.uptime}\n\n` +
          `🎯 Top 5 模型使用:\n` +
          textSummary.modelStats.map((stat) => `${stat}`).join('\n') +
          (textSummary.apiKeysUsage.length > 0
            ? `\n\n🔑 API Keys 今日使用情况:\n` +
              textSummary.apiKeysUsage
                .slice(0, 5)
                .map((stat) => `${stat}`)
                .join('\n')
            : '') +
          chartSection +
          `\n📅 报告时间: ${textSummary.timestamp}`
      }
    }

    return message
  }

  /**
   * 构建飞书富文本卡片消息（包含图片）
   */
  buildFeishuInteractiveMessage(textSummary, charts, chartFiles) {
    const chartDescriptions = {
      systemOverview: '系统概览',
      modelDistribution: '模型分布',
      usageTrend: '使用趋势',
      apiKeysTrendRequests: 'API Keys请求趋势',
      apiKeysTrendTokens: 'API KeysToken趋势',
      apiKeyUsage: 'API Keys使用统计',
      apiKeyCost: 'API Keys费用分布',
      apiKeyActivity: 'API Keys活跃度'
    }

    // 构建卡片元素
    const cardElements = [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${textSummary.title}**\n\n${textSummary.summary}`
        }
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**📊 系统统计**\n${Object.values(textSummary.stats)
            .map((stat) => `• ${stat}`)
            .join('\n')}`
        }
      }
    ]

    // 添加模型统计
    if (textSummary.modelStats.length > 0) {
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🎯 Top 5 模型使用**\n${textSummary.modelStats.map((stat) => `• ${stat}`).join('\n')}`
        }
      })
    }

    // 添加API Keys使用情况
    if (textSummary.apiKeysUsage.length > 0) {
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🔑 API Keys 今日使用情况**\n${textSummary.apiKeysUsage
            .slice(0, 3)
            .map((stat) => `• ${stat}`)
            .join('\n')}`
        }
      })
    }

    // 添加图表部分
    cardElements.push({
      tag: 'hr'
    })

    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**📊 数据图表** (${Object.keys(charts).length}张)\n\n🔑 **API Keys专项分析图表**：\n• 📋 使用统计对比 - 今日 vs 总请求量\n• 💰 费用分布分析 - 成本占比和趋势\n• ⚡ 活跃度趋势追踪 - 7天使用变化\n\n🚀 **核心价值**: 全方位显示API资源使用情况，优化成本控制`
      }
    })

    // 为每个图表添加图片元素（使用base64）
    Object.entries(charts)
      .forEach(([key, chart]) => {
        const description = chartDescriptions[key] || key

        if (chart.dataUrl) {
          cardElements.push({
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**${description}**`
            }
          })

          // 使用图片服务器URL（但飞书不支持外部URL作为img_key，改为链接）
          if (chartFiles[key]) {
            const imageUrl = `http://localhost:8081/charts/${chartFiles[key].filename}`
            cardElements.push({
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `🔗 [📊 ${description} - 点击查看](${imageUrl})`
              }
            })
          } else {
            // 降级：显示base64数据URL（可能不会显示）
            cardElements.push({
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `图表已生成，大小: ${this.formatBytes(chart.size || 0)}`
              }
            })
          }
        }
      })

    // 如果图表太多，显示剩余数量
    if (Object.keys(charts).length > 4) {
      const remaining = Object.keys(charts).length - 4
      cardElements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `还有 ${remaining} 张图表已生成，可通过容器内路径查看`
        }
      })
    }

    // 添加时间戳
    cardElements.push({
      tag: 'hr'
    })
    cardElements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📅 **报告时间**: ${textSummary.timestamp}`
      }
    })

    return {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          template: 'blue',
          title: {
            tag: 'lark_md',
            content: '📊 Claude Relay Service 仪表盘报告'
          }
        },
        elements: cardElements
      }
    }
  }

  /**
   * 格式化字节大小
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 构建企业微信格式的消息
   */
  buildWecomMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理图表数据并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const charts = this.filterEnabledCharts(allCharts)

    let chartSection = ''
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      const availableCharts = Object.keys(charts)
        .map((key) => chartDescriptions[key] || key)
        .join('、')

      chartSection =
        `\n\n**📊 图表报告**\n` +
        `- 生成图表: ${Object.keys(charts).length} 张\n` +
        `- 包含内容: ${availableCharts}\n` +
        `- 🔑 **API Keys专项分析**: 使用统计、费用分布、活跃度趋势\n` +
        `- 🚀 **核心价值**: 全面展示API资源使用情况，优化成本控制\n`
    }

    const message = {
      msgtype: 'markdown',
      markdown: {
        content:
          `# ${textSummary.title}\n\n` +
          `> ${textSummary.summary}\n\n` +
          `**📊 系统统计**\n` +
          `${Object.values(textSummary.stats)
            .map((stat) => `- ${stat}`)
            .join('\n')}\n\n` +
          `**🎯 Top 5 模型使用**\n` +
          `${textSummary.modelStats.map((stat) => `- ${stat}`).join('\n')}\n\n` +
          (textSummary.apiKeysUsage.length > 0
            ? `**🔑 API Keys 今日使用情况**\n` +
              `${textSummary.apiKeysUsage
                .slice(0, 5)
                .map((stat) => `- ${stat}`)
                .join('\n')}\n`
            : '') +
          chartSection +
          `\n---\n📅 报告时间: ${textSummary.timestamp}`
      }
    }

    return message
  }

  /**
   * 构建通用格式的消息
   */
  buildGenericMessage(dashboardData, chartsData) {
    const textSummary = this.generateTextSummary(dashboardData)

    // 处理图表数据并过滤启用的图表
    const allCharts = chartsData?.charts || chartsData || {}
    const charts = this.filterEnabledCharts(allCharts)

    let chartInfo = null
    if (charts && Object.keys(charts).length > 0) {
      const chartDescriptions = {
        systemOverview: '系统概览',
        modelDistribution: '模型分布',
        usageTrend: '使用趋势',
        apiKeysTrendRequests: 'API Keys请求趋势',
        apiKeysTrendTokens: 'API KeysToken趋势',
        apiKeyUsage: 'API Keys使用统计',
        apiKeyCost: 'API Keys费用分布',
        apiKeyActivity: 'API Keys活跃度'
      }

      chartInfo = {
        count: Object.keys(charts).length,
        types: Object.keys(charts).map((key) => chartDescriptions[key] || key),
        newFeatures: ['📋 API Keys使用统计对比', '💰 API Keys费用分布分析', '⚡ API Keys活跃度趋势追踪']
      }
    }

    return {
      title: textSummary.title,
      summary: textSummary.summary,
      stats: textSummary.stats,
      modelStats: textSummary.modelStats,
      apiKeysUsage: textSummary.apiKeysUsage,
      timestamp: textSummary.timestamp,
      charts: chartInfo
    }
  }

  /**
   * 根据类型构建消息（支持异步）
   */
  async buildMessage(dashboardData, chartsData) {
    // 统一处理图表数据格式
    let normalizedCharts = chartsData

    // 如果 chartsData 有 charts 属性，说明是新格式
    if (chartsData && typeof chartsData === 'object' && chartsData.charts) {
      normalizedCharts = chartsData
    } else if (chartsData && typeof chartsData === 'object' && !chartsData.charts) {
      // 如果是旧格式的直接图表对象，包装成新格式
      normalizedCharts = {
        charts: chartsData,
        files: {},
        summary: {}
      }
    }

    switch (this.webhookType.toLowerCase()) {
      case 'slack':
        return this.buildSlackMessage(dashboardData, normalizedCharts)
      case 'discord':
        return this.buildDiscordMessage(dashboardData, normalizedCharts)
      case 'dingtalk':
      case 'dingding':
        return this.buildDingtalkMessage(dashboardData, normalizedCharts)
      case 'feishu':
      case 'lark':
        return await this.buildFeishuMessage(dashboardData, normalizedCharts)
      case 'wecom':
      case 'wechat':
      case 'workwx':
        return this.buildWecomMessage(dashboardData, normalizedCharts)
      case 'generic':
      default:
        return this.buildGenericMessage(dashboardData, normalizedCharts)
    }
  }

  /**
   * 🔥 发送多条消息（顺序发送，每条消息包含图片）
   */
  async sendMultipleMessages(messages) {
    try {
      console.log(`🔥 Starting sequential sending of ${messages.length} messages...`)
      const results = []
      let successCount = 0
      let failedCount = 0

      for (let i = 0; i < messages.length; i++) {
        const messageInfo = messages[i]
        const message = messageInfo.message
        const description = messageInfo.description

        console.log(`📤 [${i + 1}/${messages.length}] Sending: ${description}`)
        console.log(`📦 Message type: ${message.msg_type}`)
        console.log(`📐 Message size: ${this.formatBytes(JSON.stringify(message).length)}`)

        if (messageInfo.size) {
          console.log(`🖼️ Image size: ${this.formatBytes(messageInfo.size)}`)
        }

        // 发送消息
        const result = await this.sendMessage(message)

        if (result.success) {
          console.log(`✅ [${i + 1}/${messages.length}] Success: ${description}`)
          successCount++
        } else {
          console.error(`❌ [${i + 1}/${messages.length}] Failed: ${description} - ${result.error}`)
          failedCount++
        }

        results.push({
          index: i + 1,
          type: messageInfo.type,
          description: description,
          success: result.success,
          error: result.success ? null : result.error,
          status: result.status,
          chartKey: messageInfo.chartKey
        })

        // 添加延迟避免太快发送
        if (i < messages.length - 1) {
          console.log(`⏳ Waiting 1 second before next message...`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      console.log(
        `🔥 Multi-message sending completed: ${successCount} success, ${failedCount} failed`
      )

      return {
        success: successCount > 0,
        webhookType: this.webhookType,
        timestamp: new Date().toISOString(),
        multiMessage: true,
        summary: {
          total: messages.length,
          success: successCount,
          failed: failedCount,
          successRate: `${((successCount / messages.length) * 100).toFixed(1)}%`
        },
        results: results
      }
    } catch (error) {
      console.error('💥 Error in multi-message sending:', error.message)
      return {
        success: false,
        error: error.message,
        multiMessage: true,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 发送消息（带重试机制）
   */
  async sendMessage(message, attempt = 1) {
    try {
      console.log(`📤 Sending webhook message (attempt ${attempt}/${this.retries + 1})...`)
      console.log(`🌐 Webhook URL: ${this.webhookUrl}`)
      console.log(`📋 Webhook Type: ${this.webhookType}`)
      console.log(`⏱️ Timeout: ${this.timeout}ms`)
      console.log(`📦 Message size: ${JSON.stringify(message).length} characters`)

      // 打印消息的结构信息（不打印完整内容）
      if (message.msgtype) {
        console.log(`📝 Message type: ${message.msgtype} (钉钉/飞书格式)`)
      } else if (message.blocks) {
        console.log(`📝 Message type: Slack blocks format (${message.blocks.length} blocks)`)
      } else if (message.embeds) {
        console.log(`📝 Message type: Discord embeds format (${message.embeds.length} embeds)`)
      } else {
        console.log(`📝 Message type: Generic format`)
      }

      const response = await axios.post(this.webhookUrl, message, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Claude-Relay-Service-Webhook-Reporter/1.0'
        }
      })

      console.log(`📊 Response status: ${response.status}`)
      console.log(`📊 Response headers:`, JSON.stringify(response.headers, null, 2))
      console.log(`📊 Response data:`, JSON.stringify(response.data, null, 2))

      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Webhook message sent successfully')
        return {
          success: true,
          status: response.status,
          data: response.data,
          headers: response.headers
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.error(`❌ Failed to send webhook (attempt ${attempt}):`, error.message)

      // 打印更详细的错误信息
      if (error.response) {
        console.error(`🔍 Response status: ${error.response.status}`)
        console.error(`🔍 Response headers:`, JSON.stringify(error.response.headers, null, 2))
        console.error(`🔍 Response data:`, JSON.stringify(error.response.data, null, 2))
      } else if (error.request) {
        console.error(`🔍 No response received, request details:`)
        console.error(`🔍 Request URL: ${error.request.path || 'N/A'}`)
        console.error(`🔍 Request method: ${error.request.method || 'N/A'}`)
        console.error(`🔍 Request timeout: ${error.timeout || 'N/A'}ms`)
      } else {
        console.error(`🔍 Error setting up request:`, error.message)
      }

      // 打印完整的错误对象结构
      console.error(`🔍 Error code: ${error.code || 'N/A'}`)
      console.error(`🔍 Error stack:`, error.stack)

      // 如果还有重试次数，则重试
      if (attempt <= this.retries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000 // 指数退避
        console.log(`⏳ Retrying in ${delayMs / 1000} seconds...`)

        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return this.sendMessage(message, attempt + 1)
      }

      // 重试耗尽，返回失败
      return {
        success: false,
        error: error.message,
        attempts: attempt,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      }
    }
  }

  /**
   * 发送仪表盘报告
   */
  async sendDashboardReport(dashboardData, charts = null) {
    try {
      console.log(`🚀 Preparing to send dashboard report via ${this.webhookType}...`)
      console.log(`🔧 Configuration check:`)
      console.log(`  - Webhook URL configured: ${this.webhookUrl ? '✅ Yes' : '❌ No'}`)
      console.log(`  - Webhook Type: ${this.webhookType}`)
      console.log(`  - Timeout: ${this.timeout}ms`)
      console.log(`  - Max retries: ${this.retries}`)

      // 验证webhook URL
      if (!this.webhookUrl) {
        throw new Error('Webhook URL is not configured')
      }

      // 打印数据概览
      // 兼容新数据结构
      const overview = dashboardData.overview || {}
      const recentActivity = dashboardData.recentActivity || {}

      console.log(`📊 Dashboard data overview:`)
      console.log(
        `  - API Keys: ${overview.totalApiKeys || dashboardData.totalApiKeys || 0} (active: ${overview.activeApiKeys || dashboardData.activeApiKeys || 0})`
      )
      console.log(`  - Accounts: ${overview.totalAccounts || dashboardData.totalAccounts || 0}`)
      console.log(
        `  - Today requests: ${recentActivity.requestsToday || dashboardData.todayRequests || 0}`
      )
      console.log(`  - Model stats: ${dashboardData.modelStats?.length || 0} models`)
      console.log(`  - Charts available: ${charts ? Object.keys(charts).length : 0}`)

      // 构建消息
      console.log(`🔨 Building message for ${this.webhookType} format...`)
      const message = await this.buildMessage(dashboardData, charts)
      console.log(`✅ Message built successfully`)

      // 检查是否为多消息发送
      if (message.type === 'multiple') {
        console.log(
          `🔥 Detected multiple messages format, sending ${message.messages.length} messages sequentially...`
        )
        return await this.sendMultipleMessages(message.messages)
      }

      // 发送单个消息
      console.log(`📤 Starting single message send process...`)
      const result = await this.sendMessage(message)

      if (result.success) {
        console.log('🎉 Dashboard report sent successfully!')
        console.log(`📊 Send result summary:`)
        console.log(`  - Status: ${result.status}`)
        console.log(`  - Response data: ${JSON.stringify(result.data)}`)
        console.log(`  - Timestamp: ${new Date().toISOString()}`)
        return {
          success: true,
          webhookType: this.webhookType,
          timestamp: new Date().toISOString(),
          status: result.status,
          responseData: result.data
        }
      } else {
        console.error('💥 Failed to send dashboard report:', result.error)
        console.error(`📊 Failure details:`)
        console.error(`  - Error: ${result.error}`)
        console.error(`  - Attempts made: ${result.attempts}`)
        console.error(`  - Error code: ${result.errorCode || 'N/A'}`)
        console.error(`  - Response status: ${result.responseStatus || 'N/A'}`)
        console.error(`  - Response data: ${JSON.stringify(result.responseData)}`)
        return {
          success: false,
          error: result.error,
          attempts: result.attempts,
          errorCode: result.errorCode,
          responseStatus: result.responseStatus,
          responseData: result.responseData
        }
      }
    } catch (error) {
      console.error('💥 Error sending dashboard report:', error.message)
      console.error('🔍 Error stack:', error.stack)
      return {
        success: false,
        error: error.message,
        stack: error.stack
      }
    }
  }

  /**
   * 测试webhook连接
   */
  async testWebhook() {
    try {
      console.log(`🔍 Testing webhook connection to ${this.webhookType}...`)

      const testMessage = await this.buildMessage(
        {
          totalApiKeys: 5,
          activeApiKeys: 4,
          totalAccounts: 3,
          normalAccounts: 3,
          abnormalAccounts: 0,
          pausedAccounts: 0,
          rateLimitedAccounts: 0,
          todayRequests: 1250,
          todayInputTokens: 85000,
          todayOutputTokens: 43000,
          todayCacheCreateTokens: 12000,
          todayCacheReadTokens: 8000,
          totalRequests: 15600,
          totalInputTokens: 920000,
          totalOutputTokens: 580000,
          totalCacheCreateTokens: 120000,
          totalCacheReadTokens: 90000,
          realtimeRPM: 15,
          realtimeTPM: 2800,
          uptime: 432000,
          systemStatus: '正常',
          modelStats: [
            { model: 'claude-3-5-sonnet-20241022', allTokens: 150000, requests: 45 },
            { model: 'claude-3-haiku-20240307', allTokens: 95000, requests: 32 }
          ],
          collectedAt: new Date().toISOString()
        },
        null
      )

      // 为测试消息添加标识
      if (this.webhookType === 'slack' && testMessage.blocks) {
        testMessage.blocks[0].text.text += ' [测试消息]'
      } else if (this.webhookType === 'discord' && testMessage.embeds) {
        testMessage.embeds[0].title += ' [测试消息]'
      }

      const result = await this.sendMessage(testMessage)

      if (result.success) {
        console.log('✅ Webhook test successful!')
      } else {
        console.error('❌ Webhook test failed:', result.error)
      }

      return result
    } catch (error) {
      console.error('💥 Error testing webhook:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = WebhookSender
