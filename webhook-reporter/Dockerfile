# Claude Relay Service Webhook Reporter
# 独立的Webhook仪表盘报告服务
FROM node:18-alpine3.18

# 设置维护者信息
LABEL maintainer="Claude Relay Service"
LABEL description="Webhook Dashboard Reporter for Claude Relay Service"
LABEL version="1.0.0"

# 安装Canvas和图表生成所需的系统依赖
RUN apk add --no-cache \
    # Canvas依赖
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    # 字体支持 (防止中文乱码)
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    # 编译工具
    build-base \
    python3 \
    python3-dev \
    # 网络工具（用于健康检查）
    netcat-openbsd \
    curl \
    # Shell
    bash

# 创建应用用户（安全最佳实践）
RUN addgroup -S webhook && adduser -S webhook -G webhook

# 设置工作目录
WORKDIR /app

# 复制package文件并安装依赖
COPY package.json package-lock.json ./

# 安装所有依赖
RUN npm ci && npm cache clean --force

# 复制源码
COPY src/ ./src/
COPY docker-entrypoint.sh ./
COPY .env.apikey ./
COPY test-apikey-charts.js ./
COPY verify-config.js ./
COPY debug-charts.js ./
COPY test-config.js ./

# 设置文件权限
RUN chmod +x docker-entrypoint.sh \
    && chown -R webhook:webhook /app

# 创建日志目录
RUN mkdir -p /app/logs && chown webhook:webhook /app/logs

# 切换到非root用户
USER webhook

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node src/health-check.js || exit 1

# 设置环境变量
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    DASHBOARD_WEBHOOK_ENABLE=false

# 暴露端口
EXPOSE 8080 8081

# 启动脚本
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["--daemon"]