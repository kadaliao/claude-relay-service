#!/usr/bin/env node

/**
 * 健康检查脚本
 * 用于Docker健康检查和监控
 */

const http = require('http')
const Redis = require('ioredis')

async function checkHealth() {
  const results = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {}
  }

  try {
    // 1. 检查HTTP服务
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 8080,
          path: '/health',
          timeout: 5000
        }, (res) => {
          if (res.statusCode === 200) {
            results.checks.http = { status: 'healthy' }
            resolve()
          } else {
            reject(new Error(`HTTP status: ${res.statusCode}`))
          }
        })
        
        req.on('error', reject)
        req.on('timeout', () => reject(new Error('HTTP timeout')))
        req.end()
      })
    } catch (error) {
      results.checks.http = { status: 'unhealthy', error: error.message }
      results.status = 'unhealthy'
    }

    // 2. 检查Redis连接
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 5000,
        lazyConnect: true
      })

      await redis.ping()
      results.checks.redis = { status: 'healthy' }
      await redis.quit()
    } catch (error) {
      results.checks.redis = { status: 'unhealthy', error: error.message }
      results.status = 'unhealthy'
    }

    // 3. 检查配置
    try {
      const hasWebhookUrl = !!process.env.DASHBOARD_WEBHOOK_URL
      const isEnabled = process.env.DASHBOARD_WEBHOOK_ENABLE === 'true'
      
      results.checks.config = {
        status: 'healthy',
        enabled: isEnabled,
        hasWebhookUrl: hasWebhookUrl,
        webhookType: process.env.DASHBOARD_WEBHOOK_TYPE || 'slack'
      }
      
      if (isEnabled && !hasWebhookUrl) {
        results.checks.config.status = 'warning'
        results.checks.config.message = 'Webhook enabled but URL not configured'
      }
    } catch (error) {
      results.checks.config = { status: 'unhealthy', error: error.message }
    }

    // 输出结果
    console.log(JSON.stringify(results, null, 2))

    // 返回状态码
    if (results.status === 'healthy') {
      process.exit(0)
    } else {
      process.exit(1)
    }

  } catch (error) {
    console.error('Health check failed:', error.message)
    process.exit(1)
  }
}

// 运行健康检查
checkHealth()