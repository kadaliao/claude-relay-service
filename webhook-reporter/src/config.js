/**
 * Webhook Dashboard Reporter Configuration
 * 支持环境变量和配置文件的配置管理
 */

const path = require('path')

// 默认配置 - 图表默认全部关闭，由环境变量显式启用
const defaultConfig = {
  // Webhook 配置
  webhook: {
    url: null, // 必须配置
    type: 'slack', // slack, discord, dingtalk, wecom, generic
    interval: '0 */6 * * *', // 每6小时发送一次
    timeout: 30000, // 30秒超时
    retries: 3 // 重试次数
  },

  // Redis 配置
  redis: {
    host: 'redis',
    port: 6379,
    password: null,
    db: 0,
    keyPrefix: '' // 与主服务保持一致
  },

  // 图表配置
  charts: {
    theme: 'light', // light, dark
    width: 800,
    height: 400,
    backgroundColor: '#ffffff',
    fontFamily: 'Arial',
    fontSize: 12,
    // 图表生成控制 - 默认全部关闭，由环境变量显式启用
    enabled: {
      systemOverview: false,
      modelDistribution: false,
      usageTrend: false,
      apiKeysTrend: false,
      apiKeyUsage: false,
      apiKeyCost: false,
      apiKeyActivity: false
    }
  },

  // 数据配置
  data: {
    trendDays: 7, // 趋势数据天数
    topApiKeys: 10, // 显示top N个API Keys
    modelStatsLimit: 15, // 模型统计显示限制
    includeSystemMetrics: true // 是否包含系统指标
  },

  // 日志配置
  logging: {
    level: 'info', // debug, info, warn, error
    file: '/tmp/webhook-reporter.log',
    console: true
  },

  // 调度配置
  schedule: {
    enabled: false, // 是否启用定时调度
    timezone: 'Asia/Shanghai',
    maxConcurrency: 1 // 最大并发任务数
  }
}

/**
 * 从环境变量加载配置
 */
function loadFromEnv() {
  const envConfig = {}

  // Webhook 配置
  if (process.env.DASHBOARD_WEBHOOK_URL) {
    envConfig.webhook = envConfig.webhook || {}
    envConfig.webhook.url = process.env.DASHBOARD_WEBHOOK_URL
  }

  if (process.env.DASHBOARD_WEBHOOK_TYPE) {
    envConfig.webhook = envConfig.webhook || {}
    envConfig.webhook.type = process.env.DASHBOARD_WEBHOOK_TYPE
  }

  if (process.env.DASHBOARD_WEBHOOK_INTERVAL) {
    envConfig.webhook = envConfig.webhook || {}
    envConfig.webhook.interval = process.env.DASHBOARD_WEBHOOK_INTERVAL
  }

  if (process.env.DASHBOARD_WEBHOOK_TIMEOUT) {
    envConfig.webhook = envConfig.webhook || {}
    envConfig.webhook.timeout = parseInt(process.env.DASHBOARD_WEBHOOK_TIMEOUT)
  }

  // Redis 配置
  if (process.env.REDIS_HOST) {
    envConfig.redis = envConfig.redis || {}
    envConfig.redis.host = process.env.REDIS_HOST
  }

  if (process.env.REDIS_PORT) {
    envConfig.redis = envConfig.redis || {}
    envConfig.redis.port = parseInt(process.env.REDIS_PORT)
  }

  if (process.env.REDIS_PASSWORD) {
    envConfig.redis = envConfig.redis || {}
    envConfig.redis.password = process.env.REDIS_PASSWORD
  }

  if (process.env.REDIS_DB) {
    envConfig.redis = envConfig.redis || {}
    envConfig.redis.db = parseInt(process.env.REDIS_DB)
  }

  // 图表配置
  if (process.env.DASHBOARD_CHART_THEME) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.theme = process.env.DASHBOARD_CHART_THEME
  }

  if (process.env.DASHBOARD_CHART_WIDTH) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.width = parseInt(process.env.DASHBOARD_CHART_WIDTH)
  }

  if (process.env.DASHBOARD_CHART_HEIGHT) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.height = parseInt(process.env.DASHBOARD_CHART_HEIGHT)
  }

  // 图表功能启用控制
  if (process.env.DASHBOARD_CHART_SYSTEM_OVERVIEW !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.systemOverview = process.env.DASHBOARD_CHART_SYSTEM_OVERVIEW === 'true'
  }

  if (process.env.DASHBOARD_CHART_MODEL_DISTRIBUTION !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.modelDistribution = process.env.DASHBOARD_CHART_MODEL_DISTRIBUTION === 'true'
  }

  if (process.env.DASHBOARD_CHART_USAGE_TREND !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.usageTrend = process.env.DASHBOARD_CHART_USAGE_TREND === 'true'
  }

  if (process.env.DASHBOARD_CHART_API_KEYS_TREND !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.apiKeysTrend = process.env.DASHBOARD_CHART_API_KEYS_TREND === 'true'
  }

  if (process.env.DASHBOARD_CHART_API_KEY_USAGE !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.apiKeyUsage = process.env.DASHBOARD_CHART_API_KEY_USAGE === 'true'
  }

  if (process.env.DASHBOARD_CHART_API_KEY_COST !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.apiKeyCost = process.env.DASHBOARD_CHART_API_KEY_COST === 'true'
  }

  if (process.env.DASHBOARD_CHART_API_KEY_ACTIVITY !== undefined) {
    envConfig.charts = envConfig.charts || {}
    envConfig.charts.enabled = envConfig.charts.enabled || {}
    envConfig.charts.enabled.apiKeyActivity = process.env.DASHBOARD_CHART_API_KEY_ACTIVITY === 'true'
  }

  // 数据配置
  if (process.env.DASHBOARD_TREND_DAYS) {
    envConfig.data = envConfig.data || {}
    envConfig.data.trendDays = parseInt(process.env.DASHBOARD_TREND_DAYS)
  }

  if (process.env.DASHBOARD_TOP_API_KEYS) {
    envConfig.data = envConfig.data || {}
    envConfig.data.topApiKeys = parseInt(process.env.DASHBOARD_TOP_API_KEYS)
  }

  // 调度配置
  if (process.env.DASHBOARD_WEBHOOK_ENABLE) {
    envConfig.schedule = envConfig.schedule || {}
    envConfig.schedule.enabled = process.env.DASHBOARD_WEBHOOK_ENABLE === 'true'
  }

  if (process.env.DASHBOARD_SCHEDULE_TIMEZONE) {
    envConfig.schedule = envConfig.schedule || {}
    envConfig.schedule.timezone = process.env.DASHBOARD_SCHEDULE_TIMEZONE
  }

  // 日志配置
  if (process.env.LOG_LEVEL) {
    envConfig.logging = envConfig.logging || {}
    envConfig.logging.level = process.env.LOG_LEVEL
  }

  return envConfig
}

/**
 * 深度合并配置对象
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

/**
 * 验证配置
 */
function validateConfig(config) {
  const errors = []

  // 验证必需的webhook URL
  if (!config.webhook.url) {
    errors.push('Webhook URL is required (DASHBOARD_WEBHOOK_URL)')
  }

  // 验证webhook类型
  const validTypes = ['slack', 'discord', 'dingtalk', 'wecom', 'feishu', 'generic']
  if (!validTypes.includes(config.webhook.type)) {
    errors.push(
      `Invalid webhook type: ${config.webhook.type}. Valid types: ${validTypes.join(', ')}`
    )
  }

  // 验证Redis配置
  if (!config.redis.host || !config.redis.port) {
    errors.push('Redis host and port are required')
  }

  // 验证数值配置
  if (config.data.trendDays < 1 || config.data.trendDays > 30) {
    errors.push('trendDays must be between 1 and 30')
  }

  if (config.data.topApiKeys < 1 || config.data.topApiKeys > 20) {
    errors.push('topApiKeys must be between 1 and 20')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }

  return true
}

/**
 * 加载完整配置
 */
function loadConfig() {
  try {
    // 1. 从默认配置开始
    let config = { ...defaultConfig }

    // 2. 尝试加载本地配置文件（如果存在）
    try {
      const localConfigPath = path.join(__dirname, 'local-config.js')
      const localConfig = require(localConfigPath)
      config = deepMerge(config, localConfig)
    } catch (err) {
      // 本地配置文件不存在，跳过
    }

    // 3. 从环境变量覆盖配置
    const envConfig = loadFromEnv()
    config = deepMerge(config, envConfig)

    // 4. 根据主题调整图表配置
    if (config.charts.theme === 'dark') {
      config.charts.backgroundColor = '#1f2937'
    }

    // 5. 验证配置
    validateConfig(config)

    // 6. 输出详细的配置信息用于调试
    console.log('📋 Final configuration loaded:')
    console.log('  🔧 Charts enabled configuration:')
    Object.entries(config.charts.enabled).forEach(([key, value]) => {
      const status = value ? '✅ ENABLED' : '❌ DISABLED'
      console.log(`    - ${key}: ${status}`)
    })
    console.log(`  📊 Chart theme: ${config.charts.theme}`)
    console.log(`  📐 Chart size: ${config.charts.width}x${config.charts.height}`)
    console.log(`  🕒 Trend days: ${config.data.trendDays}`)
    console.log(`  🔑 Top API keys: ${config.data.topApiKeys}`)

    return config
  } catch (error) {
    console.error('Failed to load configuration:', error.message)
    process.exit(1)
  }
}

// 导出配置和工具函数
module.exports = {
  loadConfig,
  defaultConfig,
  validateConfig
}
