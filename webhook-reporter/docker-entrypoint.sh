#!/bin/bash

# Claude Relay Service Webhook Reporter 启动脚本
# Docker容器的入口点

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 输出函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 显示启动信息
echo -e "${GREEN}"
echo "============================================"
echo "  Claude Relay Service Webhook Reporter"
echo "  Container starting..."
echo "============================================"
echo -e "${NC}"

# 环境变量检查
log_info "Checking environment configuration..."

# 检查Redis连接
REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}

log_info "Redis configuration: ${REDIS_HOST}:${REDIS_PORT}"

# 检查Webhook配置
WEBHOOK_ENABLE=${DASHBOARD_WEBHOOK_ENABLE:-false}
WEBHOOK_URL=${DASHBOARD_WEBHOOK_URL:-}
WEBHOOK_TYPE=${DASHBOARD_WEBHOOK_TYPE:-slack}

log_info "Webhook enabled: ${WEBHOOK_ENABLE}"
log_info "Webhook type: ${WEBHOOK_TYPE}"

if [ "$WEBHOOK_ENABLE" = "true" ]; then
    if [ -z "$WEBHOOK_URL" ]; then
        log_warning "Webhook is enabled but URL is not set!"
        log_warning "Service will start but scheduling will be disabled"
    else
        log_info "Webhook URL configured"
    fi
else
    log_info "Webhook is disabled - service will run in standby mode"
fi

# 等待Redis可用
log_info "Waiting for Redis to be available..."
max_attempts=30
attempt=1

while ! nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; do
    if [ $attempt -gt $max_attempts ]; then
        log_error "Redis is not available after $max_attempts attempts"
        log_error "Redis connection: ${REDIS_HOST}:${REDIS_PORT}"
        exit 1
    fi
    
    log_info "Attempt $attempt/$max_attempts: Waiting for Redis..."
    sleep 2
    ((attempt++))
done

log_success "Redis is available!"

# 验证Node.js环境
log_info "Node.js version: $(node --version)"
log_info "NPM version: $(npm --version)"

# 验证依赖
if [ ! -d "node_modules" ]; then
    log_error "Node modules not found! Please ensure dependencies are installed during build."
    exit 1
fi

log_success "Dependencies verified"

# 根据参数决定启动模式
case "${1:-}" in
    --daemon|-d)
        log_info "Starting in daemon mode with scheduled reporting..."
        exec node src/app.js --daemon
        ;;
    --once)
        log_info "Running once and exiting..."
        exec node src/app.js --once
        ;;
    --test)
        log_info "Running webhook test..."
        exec node src/app.js --test
        ;;
    --config)
        log_info "Showing configuration..."
        exec node src/app.js --config
        ;;
    --help|-h)
        log_info "Showing help..."
        exec node src/app.js --help
        ;;
    *)
        # 默认行为：根据环境变量决定
        if [ "$WEBHOOK_ENABLE" = "true" ]; then
            log_info "Starting in daemon mode (default)..."
            exec node src/app.js --daemon
        else
            log_info "Webhook disabled - running in standby mode..."
            log_info "The service will start but not send reports."
            log_info "Set DASHBOARD_WEBHOOK_ENABLE=true to enable reporting."
            
            # 启动但不执行任何操作，保持容器运行
            while true; do
                log_info "Standby mode - waiting for configuration changes..."
                sleep 300  # 每5分钟输出一次状态
                
                # 检查配置是否已更新（重新读取环境变量）
                if [ "${DASHBOARD_WEBHOOK_ENABLE:-false}" = "true" ]; then
                    log_info "Webhook has been enabled! Please restart the container to apply changes."
                fi
            done
        fi
        ;;
esac