/**
 * 飞书图片上传器
 * 用于将图片上传到飞书服务器并获取图片key用于消息卡片
 */

const axios = require('axios')
const FormData = require('form-data')

class FeishuImageUploader {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl
    // 从webhook URL解析出飞书机器人的访问信息
    this.parseWebhookUrl()
  }

  /**
   * 解析webhook URL获取必要信息
   */
  parseWebhookUrl() {
    try {
      // 飞书webhook URL格式通常是：
      // https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxxx
      if (this.webhookUrl && this.webhookUrl.includes('feishu.cn')) {
        this.baseUrl = 'https://open.feishu.cn'
        const urlParts = this.webhookUrl.split('/')
        this.hookToken = urlParts[urlParts.length - 1]
        console.log(`🔍 Parsed Feishu webhook token: ${this.hookToken?.substring(0, 10)}...`)
      } else {
        console.warn('⚠️ Not a standard Feishu webhook URL, image upload may not work')
        this.baseUrl = 'https://open.feishu.cn'
      }
    } catch (error) {
      console.error('❌ Failed to parse webhook URL:', error.message)
    }
  }

  /**
   * 🔥 获取飞书机器人的访问令牌
   */
  async getAppAccessToken() {
    try {
      console.log('🔄 Attempting to get app access token...')
      
      // 检查环境变量
      const appId = process.env.FEISHU_APP_ID
      const appSecret = process.env.FEISHU_APP_SECRET
      
      console.log(`🔍 Environment check:`)
      console.log(`  - FEISHU_APP_ID: ${appId ? `${appId.substring(0, 10)}...` : 'NOT SET'}`)
      console.log(`  - FEISHU_APP_SECRET: ${appSecret ? `${appSecret.substring(0, 10)}...` : 'NOT SET'}`)
      
      if (appId && appSecret) {
        console.log('🔑 Using app credentials to get access token...')
        
        const requestData = {
          app_id: appId,
          app_secret: appSecret
        }
        
        console.log(`📤 Request to: ${this.baseUrl}/open-apis/auth/v3/app_access_token/internal`)
        console.log(`📦 Request data: ${JSON.stringify({...requestData, app_secret: '***'}, null, 2)}`)
        
        const response = await axios.post(`${this.baseUrl}/open-apis/auth/v3/app_access_token/internal`, requestData, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        })
        
        console.log(`📊 Token response status: ${response.status}`)
        console.log(`📊 Token response data:`, JSON.stringify(response.data, null, 2))
        
        if (response.data && response.data.code === 0) {
          console.log(`✅ Successfully got app access token: ${response.data.app_access_token?.substring(0, 20)}...`)
          return response.data.app_access_token
        } else {
          console.error(`❌ Failed to get token, error code: ${response.data.code}, msg: ${response.data.msg}`)
          throw new Error(`Token request failed: ${response.data.msg}`)
        }
      } else {
        console.warn('⚠️ No app credentials found in environment variables')
        console.warn('⚠️ Using webhook token as fallback (likely will not work for image upload)')
        return this.hookToken
      }
    } catch (error) {
      console.error('❌ Failed to get app access token:', error.message)
      
      if (error.response) {
        console.error(`🔍 Token request failed with status: ${error.response.status}`)
        console.error(`🔍 Token response data:`, JSON.stringify(error.response.data, null, 2))
      }
      
      console.warn('⚠️ Falling back to webhook token (likely will not work)')
      return this.hookToken
    }
  }

  /**
   * 上传图片到飞书服务器
   * 注意：这需要应用凭证，普通webhook可能无法直接上传图片
   */
  async uploadImage(imageBuffer, filename = 'chart.png') {
    try {
      console.log(`🔥 Starting upload process for: ${filename}`)
      console.log(`📊 Image buffer size: ${imageBuffer.length} bytes`)
      
      // 获取访问令牌
      const accessToken = await this.getAppAccessToken()
      console.log(`🔑 Using access token: ${accessToken?.substring(0, 10)}...`)
      
      // 创建FormData
      const formData = new FormData()
      formData.append('image_type', 'message')
      formData.append('image', imageBuffer, {
        filename: filename,
        contentType: 'image/png'
      })

      console.log(`📤 Uploading to: ${this.baseUrl}/open-apis/im/v1/images`)

      // 尝试上传到飞书图片接口
      const response = await axios.post(
        `${this.baseUrl}/open-apis/im/v1/images`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 30000
        }
      )

      console.log(`📊 Upload response status: ${response.status}`)
      console.log(`📊 Upload response data:`, JSON.stringify(response.data, null, 2))

      if (response.data && response.data.code === 0) {
        console.log(`✅ Image uploaded successfully: ${filename}`)
        return {
          success: true,
          image_key: response.data.data.image_key,
          filename: filename
        }
      } else {
        console.warn('⚠️ Feishu image upload failed:', response.data)
        return {
          success: false,
          error: response.data?.msg || 'Upload failed'
        }
      }
    } catch (error) {
      console.error('❌ Failed to upload image to Feishu:', error.message)
      
      // 打印详细的错误信息
      if (error.response) {
        console.error(`🔍 HTTP Status: ${error.response.status}`)
        console.error(`🔍 Response headers:`, JSON.stringify(error.response.headers, null, 2))
        console.error(`🔍 Response data:`, JSON.stringify(error.response.data, null, 2))
        
        // 如果是认证错误，给出建议
        if (error.response.status === 401) {
          console.error(`💡 Suggestion: Check FEISHU_APP_ID and FEISHU_APP_SECRET in environment variables`)
        } else if (error.response.status === 400) {
          console.error(`💡 Suggestion: Check request format, image type, or token permissions`)
        }
      } else if (error.request) {
        console.error(`🔍 No response received:`, error.request)
      } else {
        console.error(`🔍 Request setup error:`, error.message)
      }
      
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data
      }
    }
  }

  /**
   * 批量上传多个图片
   */
  async uploadMultipleImages(chartsData, limit = 4) {
    const uploadPromises = []
    const chartKeys = Object.keys(chartsData).slice(0, limit)
    
    console.log(`📤 Uploading ${chartKeys.length} images to Feishu...`)

    for (const key of chartKeys) {
      const chart = chartsData[key]
      if (chart && chart.buffer) {
        const filename = `${key}.png`
        uploadPromises.push(
          this.uploadImage(chart.buffer, filename).then(result => ({
            chartKey: key,
            ...result
          }))
        )
      }
    }

    try {
      const results = await Promise.all(uploadPromises)
      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)

      console.log(`📊 Image upload results: ${successful.length} success, ${failed.length} failed`)
      
      if (failed.length > 0) {
        console.warn('⚠️ Failed uploads:', failed.map(f => f.chartKey).join(', '))
      }

      return {
        successful: successful.reduce((acc, item) => {
          acc[item.chartKey] = {
            image_key: item.image_key,
            filename: item.filename
          }
          return acc
        }, {}),
        failed: failed.map(f => f.chartKey),
        total: results.length
      }
    } catch (error) {
      console.error('❌ Batch upload failed:', error.message)
      return {
        successful: {},
        failed: chartKeys,
        total: chartKeys.length,
        error: error.message
      }
    }
  }

  /**
   * 检查是否支持图片上传
   */
  isUploadSupported() {
    return this.webhookUrl && this.webhookUrl.includes('feishu.cn')
  }
}

module.exports = FeishuImageUploader