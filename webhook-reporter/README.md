# Claude Relay Service Webhook Dashboard Reporter

独立的Webhook仪表盘报告服务 - 完全容器化解决方案。

## 🎯 设计特点

- **🔗 完全隔离**: 独立容器，不影响主服务稳定性
- **📊 丰富图表**: 自动生成系统概览、模型分布、使用趋势等图表
- **🌐 多平台支持**: Slack、Discord、钉钉、企业微信等webhook格式
- **⚡ 高性能**: 基于Debian的Node.js镜像，内置Canvas图表生成
- **🛡️ 可靠性**: 内置健康检查、重试机制、优雅错误处理
- **🔄 灵活调度**: 支持cron表达式的定时发送

## 🏗️ 架构概览

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main Service  │    │ Webhook Reporter │    │      Redis      │
│  (claude-relay) │◄──►│  (Independent)   │◄──►│   (Shared)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                       │
        ▼                        ▼                       ▼
   Port :3000              Port :8080*             Port :6379
   Web Interface          Health Check            Data Storage

* 内部端口，仅用于健康检查
```

## 🚀 快速部署

### 1. 配置环境变量

在 `.env` 文件中添加webhook配置：

```bash
# Webhook Dashboard Reporter 配置
DASHBOARD_WEBHOOK_ENABLE=true
DASHBOARD_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
DASHBOARD_WEBHOOK_TYPE=slack
DASHBOARD_WEBHOOK_INTERVAL=0 */6 * * *
DASHBOARD_CHART_THEME=light
DASHBOARD_TREND_DAYS=7
DASHBOARD_TOP_API_KEYS=10
```

### 2. 构建和启动服务

#### 选项A: 启用webhook功能（使用profile）
```bash
# 构建webhook镜像
docker-compose build webhook-reporter

# 启动完整堆栈（包含webhook）
docker-compose --profile webhook up -d

# 查看服务状态
docker-compose --profile webhook ps
```

#### 选项B: 单独管理webhook服务
```bash
# 构建并启动主服务
docker-compose up -d

# 单独构建和启动webhook服务
docker-compose up -d webhook-reporter

# 查看所有服务状态
docker-compose ps
```

### 3. 验证部署

```bash
# 检查webhook服务健康状态
docker-compose exec webhook-reporter node src/health-check.js

# 查看服务日志
docker-compose logs webhook-reporter

# 测试webhook连接
docker-compose exec webhook-reporter node src/app.js --test
```

## 🔧 管理命令

### 基本操作

```bash
# 查看webhook服务状态
docker-compose ps webhook-reporter

# 实时查看日志
docker-compose logs -f webhook-reporter

# 重启webhook服务（不影响主服务）
docker-compose restart webhook-reporter

# 进入webhook容器
docker-compose exec webhook-reporter bash
```

### 功能测试

```bash
# 显示当前配置
docker-compose exec webhook-reporter node src/app.js --config

# 测试webhook连接
docker-compose exec webhook-reporter node src/app.js --test

# 手动发送一次报告
docker-compose exec webhook-reporter node src/app.js --once

# 查看帮助信息
docker-compose exec webhook-reporter node src/app.js --help
```

### 调试和监控

```bash
# 查看健康检查状态
curl http://localhost:8080/health  # 如果暴露了端口

# 查看容器内健康状态
docker-compose exec webhook-reporter node src/health-check.js

# 查看Redis连接状态
docker-compose exec webhook-reporter sh -c "nc -z redis 6379 && echo 'Redis OK' || echo 'Redis Failed'"

# 查看最近日志（最后50行）
docker-compose logs --tail=50 webhook-reporter
```

## ⚙️ 配置参数

### 环境变量详解

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DASHBOARD_WEBHOOK_ENABLE` | `false` | 是否启用自动报告 |
| `DASHBOARD_WEBHOOK_URL` | - | Webhook URL（必填） |
| `DASHBOARD_WEBHOOK_TYPE` | `slack` | 平台类型 |
| `DASHBOARD_WEBHOOK_INTERVAL` | `0 */6 * * *` | Cron调度表达式 |
| `DASHBOARD_WEBHOOK_TIMEOUT` | `30000` | 请求超时（毫秒） |
| `DASHBOARD_CHART_THEME` | `light` | 图表主题 |
| `DASHBOARD_CHART_WIDTH` | `800` | 图表宽度 |
| `DASHBOARD_CHART_HEIGHT` | `400` | 图表高度 |
| `DASHBOARD_TREND_DAYS` | `7` | 趋势数据天数 |
| `DASHBOARD_TOP_API_KEYS` | `10` | Top API Keys数量 |
| `REDIS_HOST` | `redis` | Redis主机 |
| `REDIS_PORT` | `6379` | Redis端口 |
| `LOG_LEVEL` | `info` | 日志级别 |

### 支持的Webhook平台

- **slack**: Slack频道webhook
- **discord**: Discord频道webhook
- **dingtalk**: 钉钉群机器人webhook
- **wecom**: 企业微信群机器人webhook
- **feishu**: 飞书群机器人webhook
- **generic**: 通用JSON格式

### Cron调度示例

```bash
# 每小时发送
DASHBOARD_WEBHOOK_INTERVAL="0 * * * *"

# 每6小时发送
DASHBOARD_WEBHOOK_INTERVAL="0 */6 * * *"

# 每天上午8点发送
DASHBOARD_WEBHOOK_INTERVAL="0 8 * * *"

# 工作日每天上午9点发送
DASHBOARD_WEBHOOK_INTERVAL="0 9 * * 1-5"

# 每周一上午10点发送
DASHBOARD_WEBHOOK_INTERVAL="0 10 * * 1"
```

## 📊 报告内容

### 系统概览
- API Keys统计（总数/活跃数）
- 服务账户状态（各平台分布）
- 今日/总体使用量
- 实时性能指标（RPM/TPM）

### 图表展示
1. **系统概览柱状图**: 核心指标对比
2. **模型使用分布饼图**: Token消耗占比
3. **使用趋势线图**: 时间序列分析
4. **API Keys对比图**: 顶级用户使用情况

## 🛠️ 运维指南

### 服务启动模式

1. **自动模式** (`DASHBOARD_WEBHOOK_ENABLE=true`)
   - 容器启动后自动开始定时发送报告
   - 根据cron表达式调度
   
2. **待机模式** (`DASHBOARD_WEBHOOK_ENABLE=false`)
   - 服务启动但不发送报告
   - 容器保持运行状态，便于临时启用

3. **手动模式**
   - 可随时执行单次报告发送
   - 适用于测试和按需报告

### 故障排除

#### 1. 容器启动失败
```bash
# 检查构建日志
docker-compose build webhook-reporter

# 查看启动日志
docker-compose logs webhook-reporter

# 检查端口冲突
docker-compose ps
```

#### 2. Redis连接失败
```bash
# 检查Redis服务状态
docker-compose ps redis

# 测试Redis连接
docker-compose exec webhook-reporter sh -c "nc -z redis 6379"

# 检查网络连接
docker network ls | grep claude-relay
```

#### 3. Webhook发送失败
```bash
# 检查配置
docker-compose exec webhook-reporter node src/app.js --config

# 测试webhook连接
docker-compose exec webhook-reporter node src/app.js --test

# 查看详细错误日志
docker-compose logs webhook-reporter | grep -i error
```

#### 4. 图表生成失败
```bash
# 检查Canvas依赖
docker-compose exec webhook-reporter node -e "console.log(require('canvas'))"

# 验证Chart.js版本
docker-compose exec webhook-reporter npm list chart.js

# 手动测试数据收集
docker-compose exec webhook-reporter node -e "
const collector = require('./src/data-collector.js');
console.log('Data collector loaded successfully');
"
```

### 性能优化

#### 资源限制
在docker-compose.yml中添加资源限制：

```yaml
webhook-reporter:
  # ... 其他配置
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: '0.5'
      reservations:
        memory: 256M
        cpus: '0.25'
```

#### 日志管理
```yaml
webhook-reporter:
  # ... 其他配置
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

## 🔄 更新和维护

### 更新服务
```bash
# 停止webhook服务
docker-compose stop webhook-reporter

# 重新构建镜像
docker-compose build webhook-reporter

# 启动更新后的服务
docker-compose up -d webhook-reporter
```

### 备份和恢复
```bash
# 备份配置
cp .env .env.backup

# 备份自定义配置（如果有）
cp webhook-reporter/src/local-config.js webhook-reporter/src/local-config.js.backup

# 恢复配置
cp .env.backup .env
docker-compose restart webhook-reporter
```

### 清理和重置
```bash
# 完全重建webhook服务
docker-compose stop webhook-reporter
docker-compose rm webhook-reporter
docker-compose build --no-cache webhook-reporter
docker-compose up -d webhook-reporter
```

## 📈 监控和告警

### 健康检查
```bash
# 查看健康状态
docker-compose exec webhook-reporter node src/health-check.js

# 持续监控
while true; do
  echo "=== $(date) ==="
  docker-compose exec webhook-reporter node src/health-check.js
  sleep 300  # 每5分钟检查一次
done
```

### 日志监控
```bash
# 监控错误日志
docker-compose logs -f webhook-reporter | grep -i error

# 监控成功发送
docker-compose logs -f webhook-reporter | grep -i success

# 导出日志到文件
docker-compose logs webhook-reporter > webhook-logs-$(date +%Y%m%d).log
```

## 🤝 贡献和支持

### 自定义开发
1. 修改源码文件在 `webhook-reporter/src/`
2. 重新构建镜像 `docker-compose build webhook-reporter`
3. 重启服务 `docker-compose up -d webhook-reporter`

### 技术支持
- 查看项目文档和示例
- 提交GitHub Issues
- 参与社区讨论

---

**🎉 享受独立、可靠的仪表盘自动报告服务！**