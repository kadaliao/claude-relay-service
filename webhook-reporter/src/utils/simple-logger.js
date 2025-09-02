/**
 * 简化的日志系统 - 仅控制台输出
 * 专为webhook-reporter容器化环境设计
 */

const winston = require('winston')

// 简单的日志格式
const simpleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    const emoji = {
      error: '❌',
      warn: '⚠️ ',
      info: 'ℹ️ ',
      debug: '🐛'
    }
    
    const logMessage = `${emoji[level] || 'ℹ️ '} [${timestamp}] ${level.toUpperCase()}: ${message}`
    return stack ? `${logMessage}\n${stack}` : logMessage
  })
)

// 创建简化的logger - 仅控制台输出
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: simpleFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
})

// 添加一些便利方法
logger.success = (message) => {
  logger.info(`✅ ${message}`)
}

logger.start = (message) => {
  logger.info(`🚀 ${message}`)
}

module.exports = logger