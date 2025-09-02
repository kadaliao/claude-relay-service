/**
 * Dashboard Data Collector
 * 从Redis收集仪表盘数据，复用主服务的统计逻辑
 * 直接复用主服务的 Redis 模型和时区函数
 */

const Redis = require('ioredis')
const CostCalculator = require('./costCalculator')

class DashboardDataCollector {
  constructor(config) {
    this.config = config
    this.redis = null
  }

  async connect() {
    try {
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db
      })

      await this.redis.ping()
      console.log('✅ Connected to Redis for data collection')
      return true
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error)
      throw error
    }
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.quit()
      this.redis = null
    }
  }

  /**
   * 获取系统时区的日期字符串 - 复用主服务逻辑
   */
  getDateStringInTimezone(date = new Date(), timezoneOffset = 8) {
    const offsetMs = timezoneOffset * 3600000
    const adjustedTime = new Date(date.getTime() + offsetMs)
    return `${adjustedTime.getUTCFullYear()}-${String(adjustedTime.getUTCMonth() + 1).padStart(2, '0')}-${String(adjustedTime.getUTCDate()).padStart(2, '0')}`
  }

  /**
   * 复用主服务的今日统计逻辑
   */
  async getTodayStats() {
    try {
      const today = this.getDateStringInTimezone()
      const dailyKeys = await this.redis.keys(`usage:daily:*:${today}`)

      let totalRequestsToday = 0
      let totalTokensToday = 0
      let totalInputTokensToday = 0
      let totalOutputTokensToday = 0
      let totalCacheCreateTokensToday = 0
      let totalCacheReadTokensToday = 0

      // 批量获取所有今日数据，提高性能
      if (dailyKeys.length > 0) {
        const pipeline = this.redis.pipeline()
        dailyKeys.forEach((key) => pipeline.hgetall(key))
        const results = await pipeline.exec()

        for (const [error, dailyData] of results) {
          if (error || !dailyData) {
            continue
          }

          totalRequestsToday += parseInt(dailyData.requests) || 0
          const currentDayTokens = parseInt(dailyData.tokens) || 0
          totalTokensToday += currentDayTokens

          // 处理旧数据兼容性：如果有总token但没有输入输出分离，则使用总token作为输出token
          const inputTokens = parseInt(dailyData.inputTokens) || 0
          const outputTokens = parseInt(dailyData.outputTokens) || 0
          const cacheCreateTokens = parseInt(dailyData.cacheCreateTokens) || 0
          const cacheReadTokens = parseInt(dailyData.cacheReadTokens) || 0
          const totalTokensFromSeparate = inputTokens + outputTokens

          if (totalTokensFromSeparate === 0 && currentDayTokens > 0) {
            // 旧数据：没有输入输出分离，假设70%为输出，30%为输入（基于一般对话比例）
            totalOutputTokensToday += Math.round(currentDayTokens * 0.7)
            totalInputTokensToday += Math.round(currentDayTokens * 0.3)
          } else {
            // 新数据：使用实际的输入输出分离
            totalInputTokensToday += inputTokens
            totalOutputTokensToday += outputTokens
          }

          // 添加cache token统计
          totalCacheCreateTokensToday += cacheCreateTokens
          totalCacheReadTokensToday += cacheReadTokens
        }
      }

      return {
        requestsToday: totalRequestsToday,
        tokensToday: totalTokensToday,
        inputTokensToday: totalInputTokensToday,
        outputTokensToday: totalOutputTokensToday,
        cacheCreateTokensToday: totalCacheCreateTokensToday,
        cacheReadTokensToday: totalCacheReadTokensToday
      }
    } catch (error) {
      console.error('Error getting today stats:', error)
      return {
        requestsToday: 0,
        tokensToday: 0,
        inputTokensToday: 0,
        outputTokensToday: 0,
        cacheCreateTokensToday: 0,
        cacheReadTokensToday: 0
      }
    }
  }

  /**
   * 复用主服务的系统总使用量统计逻辑
   * 完全按照主服务dashboard的逻辑：通过apiKeys.reduce()来计算总使用量
   */
  async getSystemTotalUsage() {
    try {
      const apiKeysOverview = await this.getApiKeysOverview()
      const apiKeys = apiKeysOverview.apiKeys
      
      // 为每个API Key获取usage统计
      const apiKeysWithUsage = await Promise.all(
        apiKeys.map(async (apiKey) => {
          try {
            const usage = await this.getUsageStats(apiKey.id)
            return {
              ...apiKey,
              usage
            }
          } catch (error) {
            console.warn(`⚠️ Failed to get usage for API key ${apiKey.id}:`, error.message)
            return {
              ...apiKey,
              usage: {
                total: {
                  requests: 0,
                  allTokens: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreateTokens: 0,
                  cacheReadTokens: 0
                }
              }
            }
          }
        })
      )
      
      // 完全复用主服务的计算逻辑
      const totalTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.allTokens || 0),
        0
      )
      const totalRequestsUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.requests || 0),
        0
      )
      const totalInputTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.inputTokens || 0),
        0
      )
      const totalOutputTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.outputTokens || 0),
        0
      )
      const totalCacheCreateTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.cacheCreateTokens || 0),
        0
      )
      const totalCacheReadTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.cacheReadTokens || 0),
        0
      )
      const totalAllTokensUsed = apiKeysWithUsage.reduce(
        (sum, key) => sum + (key.usage?.total?.allTokens || 0),
        0
      )
      
      return {
        totalRequestsUsed,
        totalTokensUsed,
        totalInputTokensUsed,
        totalOutputTokensUsed,
        totalCacheCreateTokensUsed,
        totalCacheReadTokensUsed,
        totalAllTokensUsed,
        apiKeysWithUsage
      }
    } catch (error) {
      console.error('Error getting system total usage:', error)
      return {
        totalRequestsUsed: 0,
        totalTokensUsed: 0,
        totalInputTokensUsed: 0,
        totalOutputTokensUsed: 0,
        totalCacheCreateTokensUsed: 0,
        totalCacheReadTokensUsed: 0,
        totalAllTokensUsed: 0,
        apiKeysWithUsage: []
      }
    }
  }

  /**
   * 复用主服务的系统平均值计算逻辑（仅用于RPM/TPM计算）
   */
  async getSystemAverages() {
    try {
      const allApiKeys = await this.redis.keys('apikey:*')
      let totalRequests = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let oldestCreatedAt = new Date()

      // 批量获取所有usage数据和key数据，提高性能
      const usageKeys = allApiKeys.map((key) => `usage:${key.replace('apikey:', '')}`)
      const pipeline = this.redis.pipeline()

      // 添加所有usage查询
      usageKeys.forEach((key) => pipeline.hgetall(key))
      // 添加所有key数据查询
      allApiKeys.forEach((key) => pipeline.hgetall(key))

      const results = await pipeline.exec()
      const usageResults = results.slice(0, usageKeys.length)
      const keyResults = results.slice(usageKeys.length)

      for (let i = 0; i < allApiKeys.length; i++) {
        const totalData = usageResults[i][1] || {}
        const keyData = keyResults[i][1] || {}

        totalRequests += parseInt(totalData.totalRequests) || 0
        totalTokens += parseInt(totalData.totalTokens) || 0
        totalInputTokens += parseInt(totalData.totalInputTokens) || 0
        totalOutputTokens += parseInt(totalData.totalOutputTokens) || 0

        const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date()
        if (createdAt < oldestCreatedAt) {
          oldestCreatedAt = createdAt
        }
      }

      const now = new Date()
      // 保持与个人API Key计算一致的算法：按天计算然后转换为分钟
      const daysSinceOldest = Math.max(
        1,
        Math.ceil((now - oldestCreatedAt) / (1000 * 60 * 60 * 24))
      )
      const totalMinutes = daysSinceOldest * 24 * 60

      return {
        systemRPM: Math.round((totalRequests / totalMinutes) * 100) / 100,
        systemTPM: Math.round((totalTokens / totalMinutes) * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        totalTokens
      }
    } catch (error) {
      console.error('Error getting system averages:', error)
      return {
        systemRPM: 0,
        systemTPM: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0
      }
    }
  }

  /**
   * 获取API Keys概览数据 - 复用主服务逻辑
   */
  async getApiKeysOverview() {
    try {
      const keys = await this.redis.keys('apikey:*')
      const apiKeys = []
      let activeCount = 0

      // 批量获取所有API Key数据，提高性能
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline()
        keys.forEach((key) => {
          if (key !== 'apikey:hash_map') {
            pipeline.hgetall(key)
          }
        })
        const results = await pipeline.exec()

        let resultIndex = 0
        for (const key of keys) {
          if (key === 'apikey:hash_map') continue

          const [error, keyData] = results[resultIndex++] || []
          if (error || !keyData || Object.keys(keyData).length === 0) {
            continue
          }

          const apiKey = { id: key.replace('apikey:', ''), ...keyData }
          apiKeys.push(apiKey)

          if (apiKey.isActive === 'true') {
            activeCount++
          }
        }
      }

      return {
        totalApiKeys: apiKeys.length,
        activeApiKeys: activeCount,
        apiKeys: apiKeys
      }
    } catch (error) {
      console.error('Failed to get API keys overview:', error)
      return { totalApiKeys: 0, activeApiKeys: 0, apiKeys: [] }
    }
  }

  /**
   * 获取账户概览数据 - 尽量复用主服务逻辑
   */
  async getAccountsOverview() {
    try {
      // 复用主服务的账户统计模式
      const accountPatterns = [
        'claude:account:*',        // Claude OAuth 账户 
        'claude_console:account:*', // Claude Console 账户
        'gemini:account:*',        // Gemini 账户
        'openai:account:*',        // OpenAI 账户
        'azure_openai:account:*',  // Azure OpenAI 账户
        'bedrock:account:*'        // AWS Bedrock 账户
      ]
      
      let totalAccounts = 0
      let normalAccounts = 0
      let abnormalAccounts = 0
      let pausedAccounts = 0
      let rateLimitedAccounts = 0
      const accountsByPlatform = {
        claude: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
        'claude-console': { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
        gemini: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
        openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
        azure_openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
        bedrock: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 }
      }

      // 批量获取所有账户数据
      for (const pattern of accountPatterns) {
        const accountKeys = await this.redis.keys(pattern)
        if (accountKeys.length === 0) continue
        
        let platform = pattern.split(':')[0]
        if (platform === 'claude_console') platform = 'claude-console'
        
        const platformStats = accountsByPlatform[platform] || {
          total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0
        }

        // 批量获取账户数据
        if (accountKeys.length > 0) {
          const pipeline = this.redis.pipeline()
          accountKeys.forEach(key => pipeline.hgetall(key))
          const results = await pipeline.exec()

          for (const [error, accountData] of results) {
            if (error || !accountData || Object.keys(accountData).length === 0) {
              continue
            }

            platformStats.total++
            totalAccounts++

            const status = accountData.status || 'normal'
            const isActive = accountData.isActive === 'true' || accountData.isActive === true
            const isPaused = accountData.isPaused === 'true' || accountData.isPaused === true

            if (isPaused) {
              platformStats.paused++
              pausedAccounts++
            } else if (status === 'rate_limited' || status === 'rateLimited') {
              platformStats.rateLimited++
              rateLimitedAccounts++
            } else if (status === 'normal' || status === 'active' || isActive || !status) {
              platformStats.normal++
              normalAccounts++
            } else {
              platformStats.abnormal++
              abnormalAccounts++
            }
          }
        }

        accountsByPlatform[platform] = platformStats
      }

      return {
        totalAccounts,
        normalAccounts,
        abnormalAccounts,
        pausedAccounts,
        rateLimitedAccounts,
        accountsByPlatform
      }
    } catch (error) {
      console.error('Failed to get accounts overview:', error)
      return {
        totalAccounts: 0,
        normalAccounts: 0,
        abnormalAccounts: 0,
        pausedAccounts: 0,
        rateLimitedAccounts: 0,
        accountsByPlatform: {
          claude: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
          'claude-console': { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
          gemini: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
          openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
          azure_openai: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
          bedrock: { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 }
        }
      }
    }
  }

  /**
   * 获取使用统计数据 - 完全复用主服务逻辑
   */
  async getUsageStatistics() {
    try {
      // 复用主服务的今日统计逻辑
      const todayStats = await this.getTodayStats()
      
      // 使用新的系统总使用量统计逻辑
      const systemTotalUsage = await this.getSystemTotalUsage()
      
      // 复用主服务的系统平均值逻辑（仅用于RPM/TPM）
      const systemAverages = await this.getSystemAverages()

      // 获取实时指标（最近5分钟）
      const now = new Date()
      const fiveMinutesAgo = Math.floor((now.getTime() - 5 * 60 * 1000) / 60000)
      const currentMinute = Math.floor(now.getTime() / 60000)

      let realtimeRPM = 0
      let realtimeTPM = 0

      for (let minute = fiveMinutesAgo; minute <= currentMinute; minute++) {
        const minuteKey = `system:metrics:minute:${minute}`
        const minuteData = await this.redis.hgetall(minuteKey)
        if (minuteData) {
          realtimeRPM += parseInt(minuteData.requests || 0)
          realtimeTPM += parseInt(minuteData.tokens || 0)
        }
      }

      // 平均到每分钟
      realtimeRPM = Math.round(realtimeRPM / 5)
      realtimeTPM = Math.round(realtimeTPM / 5)

      return {
        // 今日统计
        todayRequests: todayStats.requestsToday,
        todayTokens: todayStats.tokensToday,
        todayInputTokens: todayStats.inputTokensToday,
        todayOutputTokens: todayStats.outputTokensToday,
        todayCacheCreateTokens: todayStats.cacheCreateTokensToday,
        todayCacheReadTokens: todayStats.cacheReadTokensToday,
        
        // 总统计 - 使用准确的系统总使用量
        totalRequests: systemTotalUsage.totalRequestsUsed,
        totalTokens: systemTotalUsage.totalTokensUsed,
        totalInputTokens: systemTotalUsage.totalInputTokensUsed,
        totalOutputTokens: systemTotalUsage.totalOutputTokensUsed,
        totalCacheCreateTokens: systemTotalUsage.totalCacheCreateTokensUsed,
        totalCacheReadTokens: systemTotalUsage.totalCacheReadTokensUsed,
        totalAllTokens: systemTotalUsage.totalAllTokensUsed,
        
        // 实时指标
        realtimeRPM,
        realtimeTPM,
        metricsWindow: 5
      }
    } catch (error) {
      console.error('Failed to get usage statistics:', error)
      return {
        todayRequests: 0,
        todayTokens: 0,
        todayInputTokens: 0,
        todayOutputTokens: 0,
        todayCacheCreateTokens: 0,
        todayCacheReadTokens: 0,
        totalRequests: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreateTokens: 0,
        totalCacheReadTokens: 0,
        totalAllTokens: 0,
        realtimeRPM: 0,
        realtimeTPM: 0,
        metricsWindow: 5
      }
    }
  }

  /**
   * 获取模型使用统计
   */
  async getModelStatistics(days = 7) {
    try {
      const stats = []
      const now = new Date()

      for (let i = 0; i < days; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = this.getDateStringInTimezone(date)

        // 获取该日期的所有模型统计
        const modelPattern = `usage:model:daily:*:${dateStr}`
        const modelKeys = await this.redis.keys(modelPattern)

        for (const key of modelKeys) {
          try {
            const keyType = await this.redis.type(key)
            let modelData = null

            if (keyType === 'hash') {
              modelData = await this.redis.hgetall(key)
            } else if (keyType === 'string') {
              try {
                const stringValue = await this.redis.get(key)
                if (stringValue && stringValue.startsWith('{')) {
                  modelData = JSON.parse(stringValue)
                } else {
                  continue
                }
              } catch (parseError) {
                continue
              }
            } else {
              continue
            }

            if (modelData && Object.keys(modelData).length > 0) {
              // 从key中提取模型名称
              const keyParts = key.split(':')
              const model = keyParts[3] // usage:model:daily:MODEL_NAME:DATE

              const existingStat = stats.find((s) => s.model === model)
              if (existingStat) {
                existingStat.requests += parseInt(modelData.requests || 0)
                existingStat.inputTokens += parseInt(modelData.inputTokens || 0)
                existingStat.outputTokens += parseInt(modelData.outputTokens || 0)
                existingStat.cacheCreateTokens += parseInt(modelData.cacheCreateTokens || 0)
                existingStat.cacheReadTokens += parseInt(modelData.cacheReadTokens || 0)
                existingStat.allTokens += parseInt(modelData.allTokens || 0)
              } else {
                stats.push({
                  model,
                  requests: parseInt(modelData.requests || 0),
                  inputTokens: parseInt(modelData.inputTokens || 0),
                  outputTokens: parseInt(modelData.outputTokens || 0),
                  cacheCreateTokens: parseInt(modelData.cacheCreateTokens || 0),
                  cacheReadTokens: parseInt(modelData.cacheReadTokens || 0),
                  allTokens: parseInt(modelData.allTokens || 0)
                })
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error processing model key ${key}:`, error.message)
            continue
          }
        }
      }

      // 按token使用量排序
      stats.sort((a, b) => b.allTokens - a.allTokens)

      // 限制返回数量
      return stats.slice(0, this.config.data.modelStatsLimit || 15)
    } catch (error) {
      console.error('Failed to get model statistics:', error)
      return []
    }
  }

  /**
   * 获取使用趋势数据
   */
  async getUsageTrend(days = 7) {
    try {
      const trendData = []
      const now = new Date()

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = this.getDateStringInTimezone(date)

        // 获取该日期的总使用统计
        const dailyPattern = `usage:daily:*:${dateStr}`
        const dailyKeys = await this.redis.keys(dailyPattern)

        let requests = 0
        let inputTokens = 0
        let outputTokens = 0
        let cacheCreateTokens = 0
        let cacheReadTokens = 0

        for (const key of dailyKeys) {
          // 过滤掉weekly/monthly/hourly/model等统计键
          if (
            key.includes('weekly:') ||
            key.includes('monthly:') ||
            key.includes('hourly:') ||
            key.includes('model:')
          ) {
            continue
          }

          try {
            const keyType = await this.redis.type(key)
            let data = null

            if (keyType === 'hash') {
              data = await this.redis.hgetall(key)
            } else if (keyType === 'string') {
              try {
                const stringValue = await this.redis.get(key)
                if (stringValue && stringValue.startsWith('{')) {
                  data = JSON.parse(stringValue)
                } else {
                  continue
                }
              } catch (parseError) {
                continue
              }
            } else {
              continue
            }

            if (data && Object.keys(data).length > 0) {
              requests += parseInt(data.requests || 0)
              inputTokens += parseInt(data.inputTokens || 0)
              outputTokens += parseInt(data.outputTokens || 0)
              cacheCreateTokens += parseInt(data.cacheCreateTokens || 0)
              cacheReadTokens += parseInt(data.cacheReadTokens || 0)
            }
          } catch (error) {
            console.warn(`⚠️ Error processing trend key ${key}:`, error.message)
            continue
          }
        }

        // 计算该日期的费用
        let dailyCost = 0
        try {
          const usage = {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_creation_input_tokens: cacheCreateTokens,
            cache_read_input_tokens: cacheReadTokens
          }
          // 使用默认模型计算费用估算
          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
          dailyCost = costResult.costs.total
        } catch (costError) {
          console.warn(`⚠️ Error calculating cost for ${dateStr}:`, costError.message)
        }

        trendData.push({
          date: dateStr,
          label: `${dateStr.split('-')[1]}/${dateStr.split('-')[2]}`,
          requests,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          totalTokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens,
          cost: dailyCost,
          formattedCost: CostCalculator.formatCost(dailyCost)
        })
      }

      return trendData
    } catch (error) {
      console.error('Failed to get usage trend:', error)
      return []
    }
  }

  /**
   * 获取Top API Keys使用趋势
   */
  async getApiKeysTrend(days = 7, metric = 'requests') {
    try {
      const apiKeysData = {}
      const trendData = []
      const now = new Date()

      // 收集指定天数的数据
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dateStr = this.getDateStringInTimezone(date)

        const dailyData = {
          date: dateStr,
          label: `${dateStr.split('-')[1]}/${dateStr.split('-')[2]}`,
          apiKeys: {}
        }

        // 获取该日期所有API Key的使用数据
        const dailyPattern = `usage:daily:*:${dateStr}`
        const dailyKeys = await this.redis.keys(dailyPattern)

        for (const key of dailyKeys) {
          // 过滤掉weekly/monthly/hourly/model等统计键
          if (
            key.includes('weekly:') ||
            key.includes('monthly:') ||
            key.includes('hourly:') ||
            key.includes('model:')
          ) {
            continue
          }

          const keyParts = key.split(':')
          if (keyParts.length >= 4) {
            const apiKeyId = keyParts[2]

            try {
              const keyType = await this.redis.type(key)
              let data = null

              if (keyType === 'hash') {
                data = await this.redis.hgetall(key)
              } else if (keyType === 'string') {
                try {
                  const stringValue = await this.redis.get(key)
                  if (stringValue && stringValue.startsWith('{')) {
                    data = JSON.parse(stringValue)
                  } else {
                    continue
                  }
                } catch (parseError) {
                  continue
                }
              } else {
                continue
              }

              if (data && Object.keys(data).length > 0) {
                const requests = parseInt(data.requests || 0)
                const tokens = parseInt(data.allTokens || data.tokens || 0)

                dailyData.apiKeys[apiKeyId] = {
                  requests,
                  tokens,
                  name: apiKeyId // 简化显示
                }

                // 累计统计用于排名
                if (!apiKeysData[apiKeyId]) {
                  apiKeysData[apiKeyId] = { requests: 0, tokens: 0 }
                }
                apiKeysData[apiKeyId].requests += requests
                apiKeysData[apiKeyId].tokens += tokens
              }
            } catch (error) {
              console.warn(`⚠️ Error processing API key trend ${key}:`, error.message)
              continue
            }
          }
        }

        trendData.push(dailyData)
      }

      // 确定Top API Keys
      const apiKeysList = Object.entries(apiKeysData)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, this.config.data.topApiKeys || 10)

      const topApiKeys = apiKeysList.map((item) => item.id)

      return {
        data: trendData,
        topApiKeys,
        totalApiKeys: Object.keys(apiKeysData).length
      }
    } catch (error) {
      console.error('Failed to get API keys trend:', error)
      return { data: [], topApiKeys: [], totalApiKeys: 0 }
    }
  }

  /**
   * 复用主服务的每日费用获取逻辑
   */
  async getDailyCostFromRedis(keyId) {
    try {
      const today = this.getDateStringInTimezone()
      const costKey = `usage:cost:daily:${keyId}:${today}`
      const cost = await this.redis.get(costKey)
      const result = parseFloat(cost || 0)
      console.log(`💰 Getting daily cost for ${keyId}, date: ${today}, key: ${costKey}, value: ${cost}, result: ${result}`)
      return result
    } catch (error) {
      console.warn(`⚠️ Error getting daily cost from Redis for ${keyId}:`, error.message)
      return 0
    }
  }

  /**
   * 复用主服务的总费用获取逻辑
   */
  async getTotalCostFromRedis(keyId) {
    try {
      const totalKey = `usage:cost:total:${keyId}`
      const cost = await this.redis.get(totalKey)
      const result = parseFloat(cost || 0)
      console.log(`💰 Getting total cost for ${keyId}, key: ${totalKey}, value: ${cost}, result: ${result}`)
      return result
    } catch (error) {
      console.warn(`⚠️ Error getting total cost from Redis for ${keyId}:`, error.message)
      return 0
    }
  }

  /**
   * 获取系统总费用统计 - 优先使用Redis中的费用记录
   */
  async getSystemCostSummary() {
    try {
      const today = this.getDateStringInTimezone()
      const apiKeysOverview = await this.getApiKeysOverview()
      
      let todayTotalCost = 0
      let totalSystemCost = 0
      let costByModel = {}
      
      for (const apiKey of apiKeysOverview.apiKeys) {
        const keyId = apiKey.id
        
        // 今日费用 - 优先从Redis费用记录获取
        let dailyCost = await this.getDailyCostFromRedis(keyId)
        
        // 如果Redis中没有费用记录，使用计算方式作为后备
        if (dailyCost === 0) {
          dailyCost = await this.getDailyCost(keyId)
        }
        
        todayTotalCost += dailyCost
        
        // 总费用 - 优先从Redis费用记录获取
        let totalCost = await this.getTotalCostFromRedis(keyId)
        
        // 如果Redis中没有费用记录，使用计算方式作为后备
        if (totalCost === 0) {
          totalCost = await this.getTotalCost(keyId)
        }
        
        totalSystemCost += totalCost
        
        // 按模型统计费用（今日）
        const modelPattern = `usage:daily:${keyId}:model:*:${today}`
        const modelKeys = await this.redis.keys(modelPattern)
        
        for (const key of modelKeys) {
          const modelMatch = key.match(/usage:daily:.+:model:(.+):\d{4}-\d{2}-\d{2}$/)
          if (!modelMatch) continue
          
          const model = modelMatch[1]
          const data = await this.redis.hgetall(key)
          
          if (data && Object.keys(data).length > 0) {
            const usage = {
              input_tokens: parseInt(data.inputTokens) || 0,
              output_tokens: parseInt(data.outputTokens) || 0,
              cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
              cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
            }
            
            const costResult = CostCalculator.calculateCost(usage, model)
            
            if (!costByModel[model]) {
              costByModel[model] = {
                todayCost: 0,
                todayRequests: 0,
                todayTokens: 0
              }
            }
            
            costByModel[model].todayCost += costResult.costs.total
            costByModel[model].todayRequests += parseInt(data.requests) || 0
            costByModel[model].todayTokens += parseInt(data.allTokens) || 0
          }
        }
      }
      
      // 转换为数组并排序
      const modelCostArray = Object.entries(costByModel)
        .map(([model, data]) => ({
          model,
          ...data,
          formattedCost: CostCalculator.formatCost(data.todayCost)
        }))
        .sort((a, b) => b.todayCost - a.todayCost)
        .slice(0, 10) // 只返回Top 10
      
      console.log(`💰 System cost summary: today=${CostCalculator.formatCost(todayTotalCost)}, total=${CostCalculator.formatCost(totalSystemCost)}`)
      
      return {
        todayTotalCost,
        todayFormattedCost: CostCalculator.formatCost(todayTotalCost),
        totalSystemCost,
        totalFormattedCost: CostCalculator.formatCost(totalSystemCost),
        modelCosts: modelCostArray
      }
    } catch (error) {
      console.error('Failed to get system cost summary:', error)
      return {
        todayTotalCost: 0,
        todayFormattedCost: '$0.000000',
        totalSystemCost: 0,
        totalFormattedCost: '$0.000000',
        modelCosts: []
      }
    }
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth() {
    try {
      // Redis连接状态
      const redisConnected = this.redis && this.redis.status === 'ready'

      // 获取系统信息（如果存在）
      const systemInfo = await this.redis.hgetall('system_info')
      let uptime = systemInfo ? parseInt(systemInfo.uptime || 0) : 0
      
      // 如果没有系统信息或uptime为0，尝试从nginx或其他来源获取
      if (uptime === 0) {
        // 查找最早的API Key创建时间作为系统启动时间的估算
        const apiKeys = await this.redis.keys('apikey:*')
        if (apiKeys.length > 0) {
          let earliestTime = new Date()
          for (const key of apiKeys.slice(0, 5)) { // 只检查前5个
            if (key === 'apikey:hash_map') continue
            const keyData = await this.redis.hgetall(key)
            if (keyData && keyData.createdAt) {
              const createdAt = new Date(keyData.createdAt)
              if (createdAt < earliestTime) {
                earliestTime = createdAt
              }
            }
          }
          // 估算运行时间（秒）
          const estimatedUptime = Math.floor((new Date() - earliestTime) / 1000)
          if (estimatedUptime > 0 && estimatedUptime < 365 * 24 * 3600) { // 合理范围内
            uptime = estimatedUptime
          }
        }
      }

      return {
        redisConnected,
        uptime,
        systemStatus: redisConnected ? '正常' : '异常'
      }
    } catch (error) {
      console.error('Failed to get system health:', error)
      return {
        redisConnected: false,
        uptime: 0,
        systemStatus: '异常'
      }
    }
  }

  /**
   * 复用主服务的 getUsageStats 逻辑
   */
  async getUsageStats(keyId) {
    const totalKey = `usage:${keyId}`
    const today = this.getDateStringInTimezone()
    const dailyKey = `usage:daily:${keyId}:${today}`
    const tzDate = new Date(new Date().getTime() + 8 * 3600000)
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    const monthlyKey = `usage:monthly:${keyId}:${currentMonth}`

    const [total, daily, monthly] = await Promise.all([
      this.redis.hgetall(totalKey),
      this.redis.hgetall(dailyKey),
      this.redis.hgetall(monthlyKey)
    ])

    // 处理数据兼容性
    const handleLegacyData = (data) => {
      const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0
      const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
      const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
      const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0
      const cacheCreateTokens = parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
      const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
      const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0

      const totalFromSeparate = inputTokens + outputTokens
      const actualAllTokens = allTokens || inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      if (totalFromSeparate === 0 && tokens > 0) {
        // 旧数据：没有输入输出分离
        return {
          tokens,
          inputTokens: Math.round(tokens * 0.3),
          outputTokens: Math.round(tokens * 0.7),
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          allTokens: tokens,
          requests
        }
      } else {
        return {
          tokens: actualAllTokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          allTokens: actualAllTokens,
          requests
        }
      }
    }

    const totalData = handleLegacyData(total)
    const dailyData = handleLegacyData(daily)
    const monthlyData = handleLegacyData(monthly)

    return {
      total: totalData,
      daily: dailyData,
      monthly: monthlyData
    }
  }

  /**
   * 获取API Key的每日费用 - 支持基于模型的精确计算
   */
  async getDailyCost(keyId) {
    try {
      const today = this.getDateStringInTimezone()
      
      // 1. 优先从成本记录中获取（如果主服务已记录）
      const costKeys = await this.redis.keys(`usage:cost:*:${keyId}:${today}:*`)
      
      let directCost = 0
      for (const costKey of costKeys) {
        const keyType = await this.redis.type(costKey)
        if (keyType === 'hash') {
          const costData = await this.redis.hgetall(costKey)
          if (costData && costData.cost) {
            directCost += parseFloat(costData.cost || 0)
          }
        } else if (keyType === 'string') {
          const stringValue = await this.redis.get(costKey)
          if (stringValue) {
            try {
              const costData = JSON.parse(stringValue)
              if (costData && costData.cost) {
                directCost += parseFloat(costData.cost || 0)
              }
            } catch (parseError) {
              const costValue = parseFloat(stringValue)
              if (!isNaN(costValue)) {
                directCost += costValue
              }
            }
          }
        }
      }
      
      // 2. 如果有直接记录的成本，优先使用
      if (directCost > 0) {
        return directCost
      }
      
      // 3. 回退到基于使用量的成本计算
      return await this.calculateDailyCostFromUsage(keyId, today)
    } catch (error) {
      console.warn(`⚠️ Error getting daily cost for ${keyId}:`, error.message)
      return 0
    }
  }
  
  /**
   * 基于使用量计算每日费用
   */
  async calculateDailyCostFromUsage(keyId, today) {
    try {
      // 按模型分别计算每日费用
      const modelPattern = `usage:daily:${keyId}:model:*:${today}`
      const modelKeys = await this.redis.keys(modelPattern)
      
      let totalCost = 0
      
      for (const key of modelKeys) {
        const modelMatch = key.match(/usage:daily:.+:model:(.+):\d{4}-\d{2}-\d{2}$/)
        if (!modelMatch) continue
        
        const model = modelMatch[1]
        const data = await this.redis.hgetall(key)
        
        if (data && Object.keys(data).length > 0) {
          const usage = {
            input_tokens: parseInt(data.inputTokens) || 0,
            output_tokens: parseInt(data.outputTokens) || 0,
            cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
            cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
          }
          
          const costResult = CostCalculator.calculateCost(usage, model)
          totalCost += costResult.costs.total
        }
      }
      
      // 如果没有按模型的详细数据，使用总体数据估算
      if (totalCost === 0) {
        const dailyKey = `usage:daily:${keyId}:${today}`
        const dailyData = await this.redis.hgetall(dailyKey)
        
        if (dailyData && Object.keys(dailyData).length > 0) {
          const usage = {
            input_tokens: parseInt(dailyData.inputTokens) || 0,
            output_tokens: parseInt(dailyData.outputTokens) || 0,
            cache_creation_input_tokens: parseInt(dailyData.cacheCreateTokens) || 0,
            cache_read_input_tokens: parseInt(dailyData.cacheReadTokens) || 0
          }
          
          // 如果没有详细分离，从总token估算
          if (usage.input_tokens === 0 && usage.output_tokens === 0) {
            const totalTokens = parseInt(dailyData.tokens) || parseInt(dailyData.allTokens) || 0
            if (totalTokens > 0) {
              usage.input_tokens = Math.round(totalTokens * 0.3)
              usage.output_tokens = Math.round(totalTokens * 0.7)
            }
          }
          
          // 使用默认模型计算
          const costResult = CostCalculator.calculateCost(usage, 'claude-3-5-sonnet-20241022')
          totalCost = costResult.costs.total
        }
      }
      
      return totalCost
    } catch (error) {
      console.warn(`⚠️ Error calculating daily cost from usage for ${keyId}:`, error.message)
      return 0
    }
  }
  
  /**
   * 计算总费用（包含历史数据）
   */
  async getTotalCost(keyId) {
    try {
      // 获取所有月度模型统计
      const allModelKeys = await this.redis.keys(`usage:${keyId}:model:monthly:*:*`)
      let totalCost = 0
      
      for (const key of allModelKeys) {
        const modelMatch = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/)
        if (!modelMatch) continue
        
        const model = modelMatch[1]
        const data = await this.redis.hgetall(key)
        
        if (data && Object.keys(data).length > 0) {
          const usage = {
            input_tokens: parseInt(data.inputTokens) || 0,
            output_tokens: parseInt(data.outputTokens) || 0,
            cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
            cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
          }
          
          const costResult = CostCalculator.calculateCost(usage, model)
          totalCost += costResult.costs.total
        }
      }
      
      // 如果没有模型级别的详细数据，使用总体数据估算
      if (totalCost === 0) {
        const usage = await this.getUsageStats(keyId)
        if (usage && usage.total && usage.total.allTokens > 0) {
          const usageData = {
            input_tokens: usage.total.inputTokens || 0,
            output_tokens: usage.total.outputTokens || 0,
            cache_creation_input_tokens: usage.total.cacheCreateTokens || 0,
            cache_read_input_tokens: usage.total.cacheReadTokens || 0
          }
          
          // 如果没有详细分离，从总token估算
          if (usageData.input_tokens === 0 && usageData.output_tokens === 0) {
            const totalTokens = usage.total.allTokens || usage.total.tokens || 0
            if (totalTokens > 0) {
              usageData.input_tokens = Math.round(totalTokens * 0.3)
              usageData.output_tokens = Math.round(totalTokens * 0.7)
            }
          }
          
          const costResult = CostCalculator.calculateCost(usageData, 'claude-3-5-sonnet-20241022')
          totalCost = costResult.costs.total
        }
      }
      
      return totalCost
    } catch (error) {
      console.warn(`⚠️ Error getting total cost for ${keyId}:`, error.message)
      return 0
    }
  }

  /**
   * 复用主服务的 getAllApiKeys 逻辑 - 获取API Keys详细使用统计
   */
  async getApiKeysDetailedUsage(days = 7) {
    try {
      console.log('🔄 Getting API keys detailed usage with main service logic...')
      
      const apiKeysOverview = await this.getApiKeysOverview()
      const apiKeysUsage = []
      
      for (const apiKey of apiKeysOverview.apiKeys) {
        const keyId = apiKey.id
        
        // 复用主服务的 getUsageStats 逻辑
        const usage = await this.getUsageStats(keyId)
        
        // 使用正确的费用获取逻辑
        let dailyCost = await this.getDailyCostFromRedis(keyId)
        if (dailyCost === 0) {
          dailyCost = await this.getDailyCost(keyId) // 后备计算
        }
        
        let totalCost = await this.getTotalCostFromRedis(keyId)
        if (totalCost === 0) {
          totalCost = await this.getTotalCost(keyId) // 后备计算
        }
        
        const apiKeyData = {
          id: keyId,
          name: apiKey.name || '未命名',
          isActive: apiKey.isActive === 'true',
          createdAt: apiKey.createdAt || 'N/A',
          lastUsedAt: apiKey.lastUsedAt || 'N/A',
          tokenLimit: parseInt(apiKey.tokenLimit || 0),
          
          // 今日统计 - 使用 usage.daily
          todayRequests: usage.daily.requests || 0,
          todayTokens: usage.daily.allTokens || 0,
          todayInputTokens: usage.daily.inputTokens || 0,
          todayOutputTokens: usage.daily.outputTokens || 0,
          todayCacheCreateTokens: usage.daily.cacheCreateTokens || 0,
          todayCacheReadTokens: usage.daily.cacheReadTokens || 0,
          todayCost: dailyCost,
          todayFormattedCost: CostCalculator.formatCost(dailyCost),
          
          // 总统计 - 使用 usage.total  
          totalRequests: usage.total.requests || 0,
          totalTokens: usage.total.allTokens || 0,
          totalInputTokens: usage.total.inputTokens || 0,
          totalOutputTokens: usage.total.outputTokens || 0,
          totalCacheCreateTokens: usage.total.cacheCreateTokens || 0,
          totalCacheReadTokens: usage.total.cacheReadTokens || 0,
          totalCost: totalCost,
          totalFormattedCost: CostCalculator.formatCost(totalCost),
          
          usagePercentage: 0
        }
        
        if (apiKeyData.tokenLimit > 0) {
          apiKeyData.usagePercentage = Math.round(
            (apiKeyData.totalRequests / apiKeyData.tokenLimit) * 100
          )
        }
        
        apiKeysUsage.push(apiKeyData)
      }
      
      // 按今日使用量排序（从高到低），优先考虑费用，然后是请求数和token数
      apiKeysUsage.sort((a, b) => {
        const aCost = a.todayCost || 0
        const bCost = b.todayCost || 0
        
        // 优先按费用排序
        if (aCost !== bCost) {
          return bCost - aCost
        }
        
        // 费用相同时按综合使用量排序
        const aTotal = (a.todayRequests || 0) + (a.todayTokens || 0) / 1000
        const bTotal = (b.todayRequests || 0) + (b.todayTokens || 0) / 1000
        return bTotal - aTotal
      })
      
      console.log(`✅ Got detailed usage for ${apiKeysUsage.length} API keys`)
      
      return {
        apiKeysUsage,
        totalApiKeys: apiKeysUsage.length,
        activeApiKeys: apiKeysUsage.filter(key => key.isActive).length,
        topUsedKeys: apiKeysUsage.slice(0, 10)
      }
    } catch (error) {
      console.error('Failed to get API keys detailed usage:', error)
      return {
        apiKeysUsage: [],
        totalApiKeys: 0,
        activeApiKeys: 0,
        topUsedKeys: []
      }
    }
  }

  /**
   * 获取完整的仪表盘数据 - 完全复用主服务逻辑
   */
  async getDashboardData() {
    try {
      console.log('🔄 Collecting dashboard data using main service logic...')

      // 完全复用主服务的数据收集逻辑
      const [
        apiKeysOverview,
        accountsOverview, 
        todayStats,
        systemTotalUsage,
        systemAverages,
        modelStats,
        usageTrend,
        apiKeysTrend,
        systemHealth,
        apiKeysDetailedUsage,
        systemCostSummary
      ] = await Promise.all([
        this.getApiKeysOverview(),
        this.getAccountsOverview(),
        this.getTodayStats(),
        this.getSystemTotalUsage(), // 新增：获取准确的系统总使用量
        this.getSystemAverages(),
        this.getModelStatistics(this.config.data.trendDays),
        this.getUsageTrend(this.config.data.trendDays),
        this.getApiKeysTrend(this.config.data.trendDays, 'requests'),
        this.getSystemHealth(),
        this.getApiKeysDetailedUsage(this.config.data.trendDays),
        this.getSystemCostSummary()
      ])

      // 按照主服务的dashboard响应格式组织数据
      const dashboardData = {
        overview: {
          totalApiKeys: apiKeysOverview.totalApiKeys,
          activeApiKeys: apiKeysOverview.activeApiKeys,
          
          // 账户统计
          ...accountsOverview,
          
          // 总使用量统计 - 使用准确的系统总使用量数据
          totalRequestsUsed: systemTotalUsage.totalRequestsUsed,
          totalTokensUsed: systemTotalUsage.totalTokensUsed,
          totalInputTokensUsed: systemTotalUsage.totalInputTokensUsed,
          totalOutputTokensUsed: systemTotalUsage.totalOutputTokensUsed,
          totalCacheCreateTokensUsed: systemTotalUsage.totalCacheCreateTokensUsed,
          totalCacheReadTokensUsed: systemTotalUsage.totalCacheReadTokensUsed,
          totalAllTokensUsed: systemTotalUsage.totalAllTokensUsed
        },
        
        recentActivity: {
          apiKeysCreatedToday: 0, // 可以后续添加逗辑
          requestsToday: todayStats.requestsToday,
          tokensToday: todayStats.tokensToday,
          inputTokensToday: todayStats.inputTokensToday,
          outputTokensToday: todayStats.outputTokensToday,
          cacheCreateTokensToday: todayStats.cacheCreateTokensToday,
          cacheReadTokensToday: todayStats.cacheReadTokensToday,
          // 添加今日费用信息
          costToday: systemCostSummary.todayTotalCost,
          formattedCostToday: systemCostSummary.todayFormattedCost
        },
        
        systemAverages: {
          rpm: systemAverages.systemRPM,
          tpm: systemAverages.systemTPM
        },
        
        realtimeMetrics: {
          rpm: 0, // 实时指标可能需要单独计算
          tpm: 0,
          windowMinutes: 5,
          isHistorical: false
        },
        
        systemHealth: {
          redisConnected: systemHealth.redisConnected,
          uptime: systemHealth.uptime || process.uptime() // 使用进程运行时间作为fallback
        },

        // 图表数据
        modelStats,
        usageTrend,
        apiKeysTrend,
        
        // API Keys详细使用数据
        apiKeysDetailedUsage,
        
        // 系统费用统计和总费用
        systemCostSummary,
        totalSystemCost: systemCostSummary.totalSystemCost,
        totalFormattedCost: systemCostSummary.totalFormattedCost,

        // 时间戳和时区
        collectedAt: new Date().toISOString(),
        systemTimezone: 8 // UTC+8
      }

      console.log('✅ Dashboard data collected successfully with main service logic')
      console.log(`📊 Overview: ${dashboardData.overview.totalApiKeys} API keys, ${dashboardData.overview.totalAccounts} accounts`)
      console.log(`📈 今日使用: ${dashboardData.recentActivity.requestsToday.toLocaleString()} 请求, ${(dashboardData.recentActivity.tokensToday / 1000000).toFixed(2)}M tokens, ${dashboardData.recentActivity.formattedCostToday || '$0.000000'}`)
      console.log(`📊 总使用量: ${dashboardData.overview.totalRequestsUsed.toLocaleString()} 请求, ${(dashboardData.overview.totalTokensUsed / 1000000).toFixed(2)}M tokens, ${dashboardData.totalFormattedCost || '$0.000000'}`)
      
      return dashboardData
    } catch (error) {
      console.error('Failed to collect dashboard data:', error)
      throw error
    }
  }
}

module.exports = DashboardDataCollector
