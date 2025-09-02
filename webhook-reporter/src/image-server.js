/**
 * Simple HTTP server to serve chart images
 * 简单的HTTP服务器用于提供图表图片
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

class ImageServer {
  constructor(port = 8081, chartsDir = './charts') {
    this.port = port
    this.chartsDir = path.resolve(chartsDir)
    this.server = null
    this.baseUrl = `http://localhost:${port}`
  }

  /**
   * 启动图片服务器
   */
  start() {
    this.server = http.createServer((req, res) => {
      // 启用CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'GET') {
        this.handleGetRequest(req, res)
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' })
        res.end('Method Not Allowed')
      }
    })

    this.server.listen(this.port, () => {
      console.log(`📷 Image server started on port ${this.port}`)
      console.log(`📂 Serving images from: ${this.chartsDir}`)
    })

    return this.server
  }

  /**
   * 处理GET请求
   */
  handleGetRequest(req, res) {
    const urlPath = decodeURIComponent(req.url)
    
    // 健康检查
    if (urlPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        status: 'ok', 
        chartsDir: this.chartsDir,
        timestamp: new Date().toISOString()
      }))
      return
    }

    // 列出所有图片
    if (urlPath === '/list') {
      this.listImages(res)
      return
    }

    // 服务图片文件
    if (urlPath.startsWith('/charts/')) {
      const filename = urlPath.replace('/charts/', '')
      this.serveImage(filename, res)
      return
    }

    // 根路径 - 显示可用的图片列表
    if (urlPath === '/') {
      this.showImageGallery(res)
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  /**
   * 服务图片文件
   */
  serveImage(filename, res) {
    const filePath = path.join(this.chartsDir, filename)
    
    // 安全检查 - 防止路径遍历攻击
    if (!filePath.startsWith(this.chartsDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Image not found')
      return
    }

    // 检查是否是PNG文件
    if (!filename.toLowerCase().endsWith('.png')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Only PNG files are supported')
      return
    }

    try {
      // 读取并发送图片
      const imageBuffer = fs.readFileSync(filePath)
      res.writeHead(200, { 
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'public, max-age=3600' // 缓存1小时
      })
      res.end(imageBuffer)
      
      console.log(`📷 Served image: ${filename} (${imageBuffer.length} bytes)`)
    } catch (error) {
      console.error('❌ Error serving image:', error.message)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  }

  /**
   * 列出所有图片（JSON格式）
   */
  listImages(res) {
    try {
      if (!fs.existsSync(this.chartsDir)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ images: [] }))
        return
      }

      const files = fs.readdirSync(this.chartsDir)
        .filter(file => file.toLowerCase().endsWith('.png'))
        .map(file => {
          const filePath = path.join(this.chartsDir, file)
          const stats = fs.statSync(filePath)
          return {
            filename: file,
            url: `${this.baseUrl}/charts/${file}`,
            size: stats.size,
            modified: stats.mtime.toISOString()
          }
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        images: files,
        total: files.length,
        baseUrl: this.baseUrl
      }))
    } catch (error) {
      console.error('❌ Error listing images:', error.message)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  }

  /**
   * 显示图片画廊（HTML页面）
   */
  showImageGallery(res) {
    try {
      if (!fs.existsSync(this.chartsDir)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Chart Images</title></head>
          <body>
            <h1>📊 Chart Images</h1>
            <p>No charts directory found: ${this.chartsDir}</p>
          </body>
          </html>
        `)
        return
      }

      const files = fs.readdirSync(this.chartsDir)
        .filter(file => file.toLowerCase().endsWith('.png'))
        .sort()

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>📊 Chart Images</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .chart { margin: 20px 0; padding: 10px; border: 1px solid #ddd; }
            .chart img { max-width: 100%; height: auto; }
            .chart h3 { margin: 0 0 10px 0; }
            .info { color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <h1>📊 Chart Images Gallery</h1>
          <p>Total charts: ${files.length}</p>
      `

      if (files.length === 0) {
        html += '<p>No chart images found.</p>'
      } else {
        files.forEach(file => {
          const filePath = path.join(this.chartsDir, file)
          const stats = fs.statSync(filePath)
          const sizeKB = (stats.size / 1024).toFixed(2)
          
          html += `
            <div class="chart">
              <h3>${file}</h3>
              <div class="info">
                Size: ${sizeKB} KB | Modified: ${stats.mtime.toLocaleString()}
              </div>
              <img src="/charts/${file}" alt="${file}" />
            </div>
          `
        })
      }

      html += `
        </body>
        </html>
      `

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    } catch (error) {
      console.error('❌ Error generating gallery:', error.message)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  }

  /**
   * 停止服务器
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('📷 Image server stopped')
      })
      this.server = null
    }
  }

  /**
   * 获取图片URL
   */
  getImageUrl(filename) {
    return `${this.baseUrl}/charts/${filename}`
  }
}

module.exports = ImageServer