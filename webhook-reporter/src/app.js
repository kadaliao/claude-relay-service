#!/usr/bin/env node

/**
 * Claude Relay Service Webhook Dashboard Reporter
 * 独立容器版本 - 主程序
 */

const path = require('path')
const cron = require('node-cron')

// 导入模块
const { loadConfig } = require('./config')
const DashboardDataCollector = require('./data-collector')
const WebhookChartGenerator = require('./chart-generator')
const WebhookSender = require('./webhook-sender')
const ImageServer = require('./image-server')

class WebhookDashboardReporter {
  constructor() {
    this.config = null
    this.dataCollector = null
    this.chartGenerator = null
    this.webhookSender = null
    this.cronJob = null
    this.isRunning = false
    this.healthServer = null
    this.imageServer = null
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Webhook Dashboard Reporter...')

      // 加载配置
      this.config = loadConfig()
      console.log(`📋 Configuration loaded for ${this.config.webhook.type} webhook`)

      // 检查必要的配置
      if (!this.config.webhook.url && this.config.schedule.enabled) {
        console.warn('⚠️ Webhook URL not configured, running in disabled mode')
        this.config.schedule.enabled = false
      }

      // 初始化各个模块
      this.dataCollector = new DashboardDataCollector(this.config)
      this.chartGenerator = new WebhookChartGenerator(this.config)
      this.webhookSender = new WebhookSender(this.config)

      // 连接到Redis
      await this.dataCollector.connect()

      // 启动图片服务器
      this.imageServer = new ImageServer(8081, path.join(process.cwd(), 'charts'))
      
      console.log('✅ Webhook Dashboard Reporter initialized successfully')
      return true
    } catch (error) {
      console.error('💥 Failed to initialize:', error.message)
      return false
    }
  }

  /**
   * 生成并发送仪表盘报告
   */
  async generateAndSendReport(dryRun = false) {
    if (this.isRunning) {
      console.log('⚠️ Report generation is already in progress, skipping...')
      return { success: false, error: 'Already running' }
    }

    this.isRunning = true

    try {
      console.log('📊 Starting dashboard report generation...')
      const startTime = Date.now()

      // 1. 收集仪表盘数据
      console.log('🔍 Step 1: Collecting dashboard data...')
      const dashboardData = await this.dataCollector.getDashboardData()

      // 2. 生成图表
      console.log('📈 Step 2: Generating charts...')
      const chartResult = await this.chartGenerator.generateAllCharts(dashboardData)
      const charts = chartResult.charts || chartResult // 兼容旧格式
      const chartFiles = chartResult.files || {}
      console.log(`✅ Generated ${Object.keys(charts).length} charts`)

      // 3. 发送webhook消息
      let sendResult
      if (dryRun) {
        console.log('📤 Step 3: Dry-run mode - generating message preview...')
        console.log('🔧 [DRY-RUN] Would send webhook to:', this.config.webhook.type, 'webhook')
        
        // 构建消息但不发送
        const message = await this.webhookSender.buildMessage(dashboardData, { charts, files: chartFiles })
        console.log('📦 [DRY-RUN] Generated message preview:')
        console.log('=====================================')
        console.log(JSON.stringify(message, null, 2))
        console.log('=====================================')
        console.log(`📊 [DRY-RUN] Message size: ${JSON.stringify(message).length} characters`)
        
        if (Object.keys(chartFiles).length > 0) {
          console.log('💾 [DRY-RUN] Chart files that would be referenced:')
          Object.entries(chartFiles).forEach(([key, file]) => {
            console.log(`  - ${key}: ${file.relativePath}`)
          })
        }
        
        if (Object.keys(charts).length > 0) {
          console.log('📊 [DRY-RUN] Chart data generated:')
          Object.entries(charts).forEach(([key, chart]) => {
            const size = chart?.size || (chart?.buffer?.length) || 0
            console.log(`  - ${key}: ${this.formatBytes(size)} PNG data`)
          })
        }
        
        sendResult = {
          success: true,
          dryRun: true,
          messageSize: JSON.stringify(message).length,
          webhookType: this.config.webhook.type,
          chartFiles: Object.keys(chartFiles).length
        }
      } else {
        console.log('📤 Step 3: Sending webhook message...')
        sendResult = await this.webhookSender.sendDashboardReport(dashboardData, { charts, files: chartFiles })
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      if (sendResult.success) {
        if (dryRun) {
          console.log(`🎉 [DRY-RUN] Dashboard report simulation completed successfully in ${duration}s`)
          console.log('🔧 [DRY-RUN] No webhook was actually sent')
        } else {
          console.log(`🎉 Dashboard report completed successfully in ${duration}s`)
        }
        return {
          success: true,
          duration: duration,
          chartsGenerated: Object.keys(charts).length,
          webhookType: this.config.webhook.type,
          timestamp: new Date().toISOString(),
          dryRun: dryRun || false
        }
      } else {
        console.error(`❌ Dashboard report failed after ${duration}s:`, sendResult.error)
        return {
          success: false,
          error: sendResult.error,
          duration: duration
        }
      }
    } catch (error) {
      console.error('💥 Error generating dashboard report:', error.message)
      return {
        success: false,
        error: error.message
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 测试webhook连接
   */
  async testWebhook() {
    try {
      console.log('🔍 Testing webhook connection...')

      if (!this.webhookSender) {
        await this.initialize()
      }

      const result = await this.webhookSender.testWebhook()

      if (result.success) {
        console.log('✅ Webhook test completed successfully')
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

  /**
   * 启动定时调度
   */
  startScheduledReporting() {
    try {
      if (!this.config.schedule.enabled) {
        console.log('⏭️ Scheduled reporting is disabled in configuration')
        return false
      }

      const cronExpression = this.config.webhook.interval
      console.log(`⏰ Starting scheduled reporting with cron: ${cronExpression}`)

      // 验证cron表达式
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`)
      }

      // 创建cron任务
      this.cronJob = cron.schedule(
        cronExpression,
        async () => {
          console.log(`\n⏰ [${new Date().toLocaleString()}] Scheduled report execution started`)
          const result = await this.generateAndSendReport()

          if (result.success) {
            console.log(`✅ Scheduled report completed successfully`)
          } else {
            console.error(`❌ Scheduled report failed: ${result.error}`)
          }
        },
        {
          scheduled: false,
          timezone: this.config.schedule.timezone || 'Asia/Shanghai'
        }
      )

      // 启动定时任务
      this.cronJob.start()
      console.log('✅ Scheduled reporting started successfully')

      return true
    } catch (error) {
      console.error('💥 Failed to start scheduled reporting:', error.message)
      return false
    }
  }

  /**
   * 停止定时调度
   */
  stopScheduledReporting() {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
      console.log('🛑 Scheduled reporting stopped')
      return true
    }
    return false
  }

  /**
   * 启动健康检查服务器
   */
  startHealthServer() {
    const http = require('http')

    this.healthServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: require('../package.json').version,
          config: {
            enabled: this.config.schedule.enabled,
            webhookType: this.config.webhook.type,
            hasWebhookUrl: !!this.config.webhook.url
          },
          redis:
            this.dataCollector &&
            this.dataCollector.redis &&
            this.dataCollector.redis.status === 'ready'
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(health, null, 2))
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      }
    })

    this.healthServer.listen(8080, () => {
      console.log('🏥 Health check server started on port 8080')
    })
  }

  /**
   * 运行守护进程模式
   */
  async runDaemon() {
    try {
      console.log('🔄 Starting daemon mode...')

      // 初始化
      const initialized = await this.initialize()
      if (!initialized) {
        throw new Error('Failed to initialize')
      }

      // 启动健康检查服务器
      this.startHealthServer()

      // 启动图片服务器
      if (this.imageServer) {
        this.imageServer.start()
      }

      // 启动定时调度
      if (this.config.schedule.enabled) {
        const scheduled = this.startScheduledReporting()
        if (scheduled) {
          console.log('🔄 Daemon mode with scheduled reporting started successfully')
        } else {
          console.log('🔄 Daemon mode started (scheduling disabled)')
        }
      } else {
        console.log('⏭️ Daemon mode started without scheduling (DASHBOARD_WEBHOOK_ENABLE=false)')
      }

      console.log('Press Ctrl+C to stop the daemon')

      // 设置优雅退出
      const gracefulExit = async (signal) => {
        console.log(`\n📡 Received ${signal}, shutting down gracefully...`)

        this.stopScheduledReporting()

        if (this.healthServer) {
          this.healthServer.close()
        }

        if (this.imageServer) {
          this.imageServer.stop()
        }

        if (this.dataCollector) {
          await this.dataCollector.disconnect()
        }

        console.log('👋 Daemon stopped')
        process.exit(0)
      }

      process.on('SIGTERM', () => gracefulExit('SIGTERM'))
      process.on('SIGINT', () => gracefulExit('SIGINT'))

      // 保持进程运行
      return new Promise(() => {}) // Never resolves, keeps daemon running
    } catch (error) {
      console.error('💥 Daemon mode failed:', error.message)
      process.exit(1)
    }
  }

  /**
   * 显示配置信息
   */
  showConfig() {
    if (!this.config) {
      this.config = loadConfig()
    }

    console.log('\n📋 Current Configuration:')
    console.log('========================')
    console.log(`Webhook URL: ${this.config.webhook.url ? '***configured***' : 'NOT SET'}`)
    console.log(`Webhook Type: ${this.config.webhook.type}`)
    console.log(`Webhook Interval: ${this.config.webhook.interval}`)
    console.log(`Redis Host: ${this.config.redis.host}:${this.config.redis.port}`)
    console.log(`Chart Theme: ${this.config.charts.theme}`)
    console.log(`Chart Size: ${this.config.charts.width}x${this.config.charts.height}`)
    console.log(`Trend Days: ${this.config.data.trendDays}`)
    console.log(`Top API Keys: ${this.config.data.topApiKeys}`)
    console.log(`Schedule Enabled: ${this.config.schedule.enabled}`)
    console.log(`Timezone: ${this.config.schedule.timezone}`)
    console.log('========================\n')
  }

  /**
   * 格式化字节大小
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      this.stopScheduledReporting()

      if (this.healthServer) {
        this.healthServer.close()
      }

      if (this.imageServer) {
        this.imageServer.stop()
      }

      if (this.dataCollector) {
        await this.dataCollector.disconnect()
      }

      console.log('🧹 Cleanup completed')
    } catch (error) {
      console.error('⚠️ Error during cleanup:', error.message)
    }
  }
}

/**
 * 命令行界面
 */
async function main() {
  const args = process.argv.slice(2)
  const reporter = new WebhookDashboardReporter()

  // 解析命令行参数
  const flags = {
    once: args.includes('--once'),
    daemon: args.includes('--daemon') || args.includes('-d'),
    test: args.includes('--test'),
    dryRun: args.includes('--dry-run'),
    config: args.includes('--config'),
    help: args.includes('--help') || args.includes('-h')
  }

  try {
    // 显示帮助信息
    if (flags.help) {
      console.log(`
📊 Claude Relay Service Webhook Dashboard Reporter
==================================================

Usage: node src/app.js [options]

Options:
  --once          Execute once and exit
  --daemon, -d    Run as daemon with scheduled reporting
  --test          Test webhook connection
  --dry-run       Generate report data and log output without sending webhook
  --config        Show current configuration
  --help, -h      Show this help message

Environment Variables:
  DASHBOARD_WEBHOOK_ENABLE   Enable automatic reporting (true/false)
  DASHBOARD_WEBHOOK_URL      Webhook URL (required)
  DASHBOARD_WEBHOOK_TYPE     Webhook type (slack|discord|dingtalk|wecom|feishu|generic)
  DASHBOARD_WEBHOOK_INTERVAL Cron expression for scheduling
  DASHBOARD_CHART_THEME      Chart theme (light|dark)
  REDIS_HOST                 Redis host
  REDIS_PORT                 Redis port

Examples:
  node src/app.js --once
  node src/app.js --daemon
  node src/app.js --test
  node src/app.js --config
`)
      process.exit(0)
    }

    // 显示配置
    if (flags.config) {
      reporter.showConfig()
      process.exit(0)
    }

    // 测试webhook
    if (flags.test) {
      await reporter.initialize()
      const result = await reporter.testWebhook()
      await reporter.cleanup()
      process.exit(result.success ? 0 : 1)
    }

    // 守护进程模式
    if (flags.daemon) {
      await reporter.runDaemon()
      return
    }

    // 单次执行模式（默认）
    await reporter.initialize()
    
    // 如果是dry-run模式，显示配置信息
    if (flags.dryRun) {
      console.log('🔧 [DRY-RUN] Running in simulation mode - no webhook will be sent')
      reporter.showConfig()
      console.log('')
    }
    
    const result = await reporter.generateAndSendReport(flags.dryRun)
    await reporter.cleanup()

    if (result.success) {
      if (flags.dryRun) {
        console.log('🎉 [DRY-RUN] Report simulation completed successfully!')
      } else {
        console.log('🎉 Report sent successfully!')
      }
      process.exit(0)
    } else {
      console.error('❌ Report failed:', result.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Fatal error:', error.message)
    await reporter.cleanup()
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error)
    process.exit(1)
  })
}

module.exports = WebhookDashboardReporter
