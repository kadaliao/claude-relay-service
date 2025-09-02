/**
 * Webhook Chart Generator
 * Generate dashboard charts using Chart.js and Canvas
 */

const { ChartJSNodeCanvas } = require('chartjs-node-canvas')
const ChartDataLabels = require('chartjs-plugin-datalabels')
const fs = require('fs')
const path = require('path')

class WebhookChartGenerator {
  constructor(config) {
    this.config = config
    this.width = config.charts.width || 800
    this.height = config.charts.height || 400
    this.theme = config.charts.theme || 'light'

    // Set colors based on theme
    this.colors = this.getThemeColors()

    // Initialize Chart.js Canvas renderer
    this.chartRenderer = new ChartJSNodeCanvas({
      width: this.width,
      height: this.height,
      backgroundColor: this.colors.background,
      plugins: {
        modern: [ChartDataLabels]
      }
    })

    // Create chart save directory
    this.chartsDir = path.join(process.cwd(), 'charts')
    this.ensureChartsDirectory()
  }

  /**
   * Ensure chart save directory exists
   */
  ensureChartsDirectory() {
    try {
      if (!fs.existsSync(this.chartsDir)) {
        fs.mkdirSync(this.chartsDir, { recursive: true })
        console.log(`📁 Created charts directory: ${this.chartsDir}`)
      }
    } catch (error) {
      console.error('❌ Failed to create charts directory:', error.message)
    }
  }

  /**
   * Save chart to file
   */
  async saveChartToFile(imageBuffer, filename) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const fullFilename = `${timestamp}_${filename}.png`
      const filePath = path.join(this.chartsDir, fullFilename)

      await fs.promises.writeFile(filePath, imageBuffer)
      console.log(`💾 Chart saved: ${fullFilename}`)

      return {
        filename: fullFilename,
        path: filePath,
        relativePath: `charts/${fullFilename}`
      }
    } catch (error) {
      console.error(`❌ Failed to save chart ${filename}:`, error.message)
      return null
    }
  }

  /**
   * Get configuration key for chart
   */
  getConfigKeyForChart(chartKey) {
    const mapping = {
      'systemOverview': 'systemOverview',
      'modelDistribution': 'modelDistribution', 
      'usageTrend': 'usageTrend',
      'apiKeysTrendRequests': 'apiKeysTrend',
      'apiKeysTrendTokens': 'apiKeysTrend',
      'apiKeyUsage': 'apiKeyUsage',
      'apiKeyCost': 'apiKeyCost',
      'apiKeyActivity': 'apiKeyActivity'
    }
    return mapping[chartKey] || chartKey
  }

  /**
   * Get theme color configuration
   */
  getThemeColors() {
    const isDark = this.theme === 'dark'

    return {
      background: isDark ? '#1f2937' : '#ffffff',
      text: isDark ? '#e5e7eb' : '#374151',
      grid: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(0, 0, 0, 0.1)',
      primary: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      purple: '#8B5CF6',
      pink: '#EC4899',
      teal: '#14B8A6',
      orange: '#F97316',
      indigo: '#6366F1',
      lime: '#84CC16'
    }
  }


  /**
   * Format number display
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K'
    }
    return num.toString()
  }

  /**
   * Generate model usage distribution pie chart
   */
  async generateModelDistributionChart(modelStats) {
    if (!modelStats || modelStats.length === 0) {
      return null
    }

    // Take top 10 models
    const topModels = modelStats.slice(0, 10)

    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: topModels.map((stat) => stat.model || 'Unknown'),
        datasets: [
          {
            data: topModels.map((stat) => stat.allTokens),
            backgroundColor: [
              this.colors.primary,
              this.colors.success,
              this.colors.warning,
              this.colors.error,
              this.colors.purple,
              this.colors.pink,
              this.colors.teal,
              this.colors.orange,
              this.colors.indigo,
              this.colors.lime
            ],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Model Token Usage Distribution',
            font: {
              size: 18,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              usePointStyle: true,
              font: {
                size: 12
              },
              color: this.colors.text,
              generateLabels: (chart) => {
                const data = chart.data
                if (data.labels.length && data.datasets.length) {
                  return data.labels.map((label, i) => {
                    const value = data.datasets[0].data[i]
                    const total = data.datasets[0].data.reduce((sum, val) => sum + val, 0)
                    const percentage = ((value / total) * 100).toFixed(1)
                    return {
                      text: `${label}: ${this.formatNumber(value)} (${percentage}%)`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      index: i
                    }
                  })
                }
                return []
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || ''
                const value = this.formatNumber(context.parsed)
                const total = context.dataset.data.reduce((sum, val) => sum + val, 0)
                const percentage = ((context.parsed / total) * 100).toFixed(1)
                return `${label}: ${value} tokens (${percentage}%)`
              }
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate model distribution chart:', error)
      return null
    }
  }

  /**
   * Generate usage trend line chart
   */
  async generateUsageTrendChart(trendData) {
    if (!trendData || trendData.length === 0) {
      return null
    }

    const chartConfig = {
      type: 'line',
      data: {
        labels: trendData.map((data) => data.label),
        datasets: [
          {
            label: 'Input Tokens',
            data: trendData.map((data) => data.inputTokens),
            borderColor: this.colors.primary,
            backgroundColor: this.colors.primary + '20',
            tension: 0.3,
            fill: false
          },
          {
            label: 'Output Tokens',
            data: trendData.map((data) => data.outputTokens),
            borderColor: this.colors.purple,
            backgroundColor: this.colors.purple + '20',
            tension: 0.3,
            fill: false
          },
          {
            label: 'Cache Create Tokens',
            data: trendData.map((data) => data.cacheCreateTokens),
            borderColor: this.colors.teal,
            backgroundColor: this.colors.teal + '20',
            tension: 0.3,
            fill: false
          },
          {
            label: 'Requests',
            data: trendData.map((data) => data.requests),
            borderColor: this.colors.success,
            backgroundColor: this.colors.success + '20',
            tension: 0.3,
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          title: {
            display: true,
            text: 'Token Usage Trend',
            font: {
              size: 18,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            position: 'top',
            labels: {
              color: this.colors.text,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || ''
                let value = context.parsed.y

                if (label === 'Requests') {
                  return `${label}: ${value.toLocaleString()}`
                } else {
                  return `${label}: ${this.formatNumber(value)} tokens`
                }
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date',
              color: this.colors.text
            },
            ticks: {
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Token Count',
              color: this.colors.text
            },
            ticks: {
              callback: (value) => this.formatNumber(value),
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Requests',
              color: this.colors.text
            },
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              callback: (value) => value.toLocaleString(),
              color: this.colors.text
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate usage trend chart:', error)
      return null
    }
  }

  /**
   * Generate API Keys usage trend chart
   */
  async generateApiKeysTrendChart(apiKeysTrendData, metric = 'requests', apiKeysMap = {}) {
    if (!apiKeysTrendData || !apiKeysTrendData.data || apiKeysTrendData.data.length === 0) {
      return null
    }

    const { data, topApiKeys } = apiKeysTrendData

    // Color array
    const colorPalette = [
      this.colors.primary,
      this.colors.success,
      this.colors.warning,
      this.colors.error,
      this.colors.purple,
      this.colors.pink,
      this.colors.teal,
      this.colors.orange,
      this.colors.indigo,
      this.colors.lime
    ]

    // Prepare datasets
    const datasets = topApiKeys.map((apiKeyId, index) => {
      const chartData = data.map((item) => {
        if (!item.apiKeys || !item.apiKeys[apiKeyId]) return 0
        return metric === 'tokens' ? item.apiKeys[apiKeyId].tokens : item.apiKeys[apiKeyId].requests
      })

      const color = colorPalette[index % colorPalette.length]

      // Use API Key name if available, otherwise use truncated ID
      const keyName = apiKeysMap[apiKeyId] && apiKeysMap[apiKeyId].name && 
                      apiKeysMap[apiKeyId].name !== 'Unnamed' && 
                      apiKeysMap[apiKeyId].name !== '未命名' 
                      ? apiKeysMap[apiKeyId].name 
                      : `Key-${apiKeyId.substring(0, 8)}...`

      return {
        label: keyName,
        data: chartData,
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.4,
        fill: false
      }
    })

    const chartConfig = {
      type: 'line',
      data: {
        labels: data.map((item) => item.label),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `API Keys ${metric === 'tokens' ? 'Token' : 'Request'} Usage Trend (Top ${topApiKeys.length})`,
            font: {
              size: 18,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: {
                size: 11
              },
              color: this.colors.text
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || ''
                const value = context.parsed.y
                return metric === 'tokens'
                  ? `${label}: ${this.formatNumber(value)} tokens`
                  : `${label}: ${value.toLocaleString()} requests`
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date',
              color: this.colors.text
            },
            ticks: {
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: metric === 'tokens' ? 'Token Count' : 'Request Count',
              color: this.colors.text
            },
            ticks: {
              callback: (value) => this.formatNumber(value),
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate API keys trend chart:', error)
      return null
    }
  }

  /**
   * Generate system overview bar chart
   */
  async generateSystemOverviewChart(dashboardData) {
    const chartConfig = {
      type: 'bar',
      data: {
        labels: ['API Keys', 'Service Accounts', 'Today Requests', 'Today Tokens (K)', 'Normal Accounts', 'Error Accounts'],
        datasets: [
          {
            label: 'System Overview',
            data: [
              dashboardData.totalApiKeys,
              dashboardData.totalAccounts,
              dashboardData.todayRequests,
              Math.round(
                (dashboardData.todayInputTokens +
                  dashboardData.todayOutputTokens +
                  dashboardData.todayCacheCreateTokens +
                  dashboardData.todayCacheReadTokens) /
                  1000
              ),
              dashboardData.normalAccounts,
              dashboardData.abnormalAccounts
            ],
            backgroundColor: [
              this.colors.primary,
              this.colors.success,
              this.colors.warning,
              this.colors.purple,
              this.colors.teal,
              this.colors.error
            ],
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'System Overview',
            font: {
              size: 18,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label
                const value = context.parsed.y
                return `${label}: ${value.toLocaleString()}`
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: this.colors.text,
              maxRotation: 45
            },
            grid: {
              color: this.colors.grid
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => this.formatNumber(value),
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate system overview chart:', error)
      return null
    }
  }

  /**
   * Generate API Key usage bar chart
   */
  async generateApiKeyUsageChart(apiKeysDetailedUsage) {
    console.log('🔍 Checking apiKeyUsage chart data availability...')
    
    if (!apiKeysDetailedUsage) {
      console.error('  ❌ apiKeysDetailedUsage data is null/undefined')
      return null
    }
    
    if (!apiKeysDetailedUsage.apiKeysUsage) {
      console.error('  ❌ apiKeysDetailedUsage.apiKeysUsage is null/undefined')
      return null
    }
    
    if (apiKeysDetailedUsage.apiKeysUsage.length === 0) {
      console.error('  ❌ apiKeysDetailedUsage.apiKeysUsage is empty array')
      return null
    }
    
    console.log(`  ✅ Found ${apiKeysDetailedUsage.apiKeysUsage.length} API keys for usage chart`)

    // Filter out API keys with no requests and no cost, then take top 10
    const apiKeysWithData = apiKeysDetailedUsage.apiKeysUsage
      .filter((key) => (key.todayRequests > 0) || (key.todayCost > 0))
      .slice(0, 10)

    // If no API keys have data, return null
    if (apiKeysWithData.length === 0) {
      console.log('  ⚠️ No API keys with usage data found, skipping chart generation')
      return null
    }

    const chartConfig = {
      type: 'bar',
      data: {
        labels: apiKeysWithData.map((key) => {
          const name =
            key.name && key.name !== 'Unnamed' && key.name !== '未命名' ? key.name : `Key-${key.id.substring(0, 8)}`
          return name
        }),
        datasets: [
          {
            label: 'Today Requests',
            data: apiKeysWithData.map((key) => key.todayRequests || 0),
            backgroundColor: this.colors.primary + '80',
            borderColor: this.colors.primary,
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Today Cost ($)',
            data: apiKeysWithData.map((key) => key.todayCost || 0),
            backgroundColor: this.colors.warning + '80',
            borderColor: this.colors.warning,
            borderWidth: 1,
            type: 'line',
            yAxisID: 'y1',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'API Keys Daily Usage Statistics - ' + new Date().toLocaleDateString('en-US'),
            font: {
              size: 20,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 25
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: this.colors.text,
              font: {
                size: 13,
                weight: 'bold'
              },
              usePointStyle: true,
              padding: 20
            }
          },
          datalabels: {
            display: function(context) {
              // Only show labels for Cost dataset (line chart)
              return context.dataset.label.includes('Cost') && 
                     context.parsed && context.parsed.y && context.parsed.y > 0
            },
            color: '#D97706', // Darker orange for better contrast
            font: {
              size: 11,
              weight: 'bold'
            },
            formatter: (value) => {
              // Only show cost labels since we're only displaying cost data labels
              return value > 0 ? '$' + value.toFixed(3) : ''
            },
            anchor: 'center', // Center anchor for line chart points
            align: 'bottom', // Below the line points
            offset: 10, // Space below line points
            rotation: -10, // Slight rotation to avoid overlap with line
            clip: false,
            backgroundColor: 'rgba(245, 158, 11, 0.9)', // Orange background for cost
            borderColor: '#D97706',
            borderWidth: 1,
            borderRadius: 4,
            padding: 4,
            textAlign: 'center'
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || ''
                const value = context.parsed.y

                if (label.includes('Cost')) {
                  return `${label}: $${value.toFixed(6)}`
                } else {
                  return `${label}: ${value.toLocaleString()}`
                }
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'API Keys',
              color: this.colors.text,
              font: {
                size: 14,
                weight: 'bold'
              }
            },
            ticks: {
              color: this.colors.text,
              maxRotation: 35,
              font: {
                size: 11,
                weight: 'bold'
              }
            },
            grid: {
              color: this.colors.grid
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Requests',
              color: this.colors.text,
              font: {
                size: 13,
                weight: 'bold'
              }
            },
            ticks: {
              callback: (value) => this.formatNumber(value),
              color: this.colors.text,
              font: {
                size: 11
              }
            },
            grid: {
              color: this.colors.grid
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Cost ($)',
              color: this.colors.text,
              font: {
                size: 13,
                weight: 'bold'
              }
            },
            grid: {
              drawOnChartArea: false,
              color: this.colors.grid
            },
            ticks: {
              callback: (value) => '$' + value.toFixed(4),
              color: this.colors.text,
              font: {
                size: 11
              }
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate API key usage chart:', error)
      return null
    }
  }

  /**
   * Generate API Key cost distribution pie chart
   */
  async generateApiKeyCostChart(apiKeysDetailedUsage) {
    console.log('🔍 Checking apiKeyCost chart data availability...')
    
    if (!apiKeysDetailedUsage) {
      console.error('  ❌ apiKeysDetailedUsage data is null/undefined')
      return null
    }
    
    if (!apiKeysDetailedUsage.apiKeysUsage) {
      console.error('  ❌ apiKeysDetailedUsage.apiKeysUsage is null/undefined')
      return null
    }
    
    if (apiKeysDetailedUsage.apiKeysUsage.length === 0) {
      console.error('  ❌ apiKeysDetailedUsage.apiKeysUsage is empty array')
      return null
    }
    
    console.log(`  ✅ Found ${apiKeysDetailedUsage.apiKeysUsage.length} API keys for cost chart`)

    // Filter and sort by total cost
    const apiKeysWithCost = apiKeysDetailedUsage.apiKeysUsage
      .filter((key) => (key.totalCost || 0) > 0)
      .sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0))
      .slice(0, 10) // Top 10

    if (apiKeysWithCost.length === 0) {
      return null
    }

    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: apiKeysWithCost.map((key) => {
          const name =
            key.name && key.name !== 'Unnamed' && key.name !== '未命名' ? key.name : `Key-${key.id.substring(0, 8)}`
          return name
        }),
        datasets: [
          {
            data: apiKeysWithCost.map((key) => key.totalCost || 0),
            backgroundColor: [
              this.colors.primary,
              this.colors.success,
              this.colors.warning,
              this.colors.error,
              this.colors.purple,
              this.colors.pink,
              this.colors.teal,
              this.colors.orange,
              this.colors.indigo,
              this.colors.lime
            ],
            borderWidth: 2,
            borderColor: this.colors.background
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'API Keys Total Cost Distribution - Till ' + new Date().toLocaleDateString('en-US'),
            font: {
              size: 20,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              padding: 15,
              usePointStyle: true,
              font: {
                size: 11,
                weight: 'bold'
              },
              color: this.colors.text,
              generateLabels: (chart) => {
                const data = chart.data
                if (data.labels.length && data.datasets.length) {
                  const total = data.datasets[0].data.reduce((sum, val) => sum + val, 0)
                  return data.labels.map((label, i) => {
                    const value = data.datasets[0].data[i]
                    const percentage = ((value / total) * 100).toFixed(1)
                    // Truncate long labels
                    const shortLabel = label.length > 15 ? label.substring(0, 15) + '...' : label
                    return {
                      text: `${shortLabel}: $${value.toFixed(4)} (${percentage}%)`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      strokeStyle: data.datasets[0].backgroundColor[i],
                      lineWidth: 2,
                      index: i
                    }
                  })
                }
                return []
              }
            }
          },
          datalabels: {
            display: function(context) {
              const total = context.chart.data.datasets[0].data.reduce((sum, val) => sum + val, 0)
              const percentage = ((context.parsed / total) * 100)
              return percentage > 8 // Only show labels >8% to avoid overlap
            },
            color: 'white',
            font: {
              size: 11,
              weight: 'bold'
            },
            formatter: (value, context) => {
              const total = context.chart.data.datasets[0].data.reduce((sum, val) => sum + val, 0)
              const percentage = ((value / total) * 100).toFixed(1)
              return `$${value.toFixed(3)}\n${percentage}%`
            },
            anchor: 'center',
            align: 'center',
            textAlign: 'center',
            clip: false,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            borderRadius: 4,
            padding: 3
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || ''
                const value = context.parsed
                const total = context.dataset.data.reduce((sum, val) => sum + val, 0)
                const percentage = ((value / total) * 100).toFixed(1)
                return `${label}: $${value.toFixed(4)} (${percentage}%)`
              }
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate API key cost chart:', error)
      return null
    }
  }

  /**
   * Generate API Key activity timeline chart
   */
  async generateApiKeyActivityChart(apiKeysTrend, apiKeysMap = {}) {
    if (!apiKeysTrend || !apiKeysTrend.data || apiKeysTrend.data.length === 0) {
      return null
    }

    const { data, topApiKeys } = apiKeysTrend

    // Color array
    const colorPalette = [
      this.colors.primary,
      this.colors.success,
      this.colors.warning,
      this.colors.error,
      this.colors.purple,
      this.colors.pink,
      this.colors.teal,
      this.colors.orange,
      this.colors.indigo,
      this.colors.lime
    ]

    // Prepare datasets - only show top 5 most active API Keys
    const datasets = topApiKeys.slice(0, 5).map((apiKeyId, index) => {
      const chartData = data.map((item) => {
        if (!item.apiKeys || !item.apiKeys[apiKeyId]) return 0
        return item.apiKeys[apiKeyId].requests || 0
      })

      const color = colorPalette[index % colorPalette.length]

      // Use API Key name if available, otherwise use truncated ID
      const keyName = apiKeysMap[apiKeyId] && apiKeysMap[apiKeyId].name && 
                      apiKeysMap[apiKeyId].name !== 'Unnamed' && 
                      apiKeysMap[apiKeyId].name !== '未命名' 
                      ? apiKeysMap[apiKeyId].name 
                      : `Key-${apiKeyId.substring(0, 8)}...`

      return {
        label: keyName,
        data: chartData,
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.4,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5
      }
    })

    const chartConfig = {
      type: 'line',
      data: {
        labels: data.map((item) => item.label),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          title: {
            display: true,
            text: `API Keys Activity Trend (Top ${datasets.length})`,
            font: {
              size: 18,
              weight: 'bold'
            },
            color: this.colors.text,
            padding: 20
          },
          legend: {
            position: 'top',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: {
                size: 12
              },
              color: this.colors.text
            }
          },
          datalabels: {
            display: function (context) {
              // Only show labels on last data point to avoid crowding
              return context.dataIndex === context.dataset.data.length - 1 && context.parsed && context.parsed.y && context.parsed.y > 0
            },
            color: this.colors.text,
            font: {
              size: 10,
              weight: 'bold'
            },
            formatter: (value) => {
              return value > 0 ? this.formatNumber(value) : ''
            },
            anchor: 'end',
            align: 'top',
            offset: 8,
            clip: false,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderColor: this.colors.text,
            borderWidth: 1,
            borderRadius: 3,
            padding: 2
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || ''
                const value = context.parsed.y
                return `${label}: ${value.toLocaleString()} requests`
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date',
              color: this.colors.text
            },
            ticks: {
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Request Count',
              color: this.colors.text
            },
            ticks: {
              callback: (value) => this.formatNumber(value),
              color: this.colors.text
            },
            grid: {
              color: this.colors.grid
            }
          }
        }
      }
    }

    try {
      const imageBuffer = await this.chartRenderer.renderToBuffer(chartConfig)
      return imageBuffer
    } catch (error) {
      console.error('Failed to generate API key activity chart:', error)
      return null
    }
  }

  /**
   * Generate all charts
   */
  async generateAllCharts(dashboardData) {
    console.log('📊 Generating dashboard charts...')
    console.log('🔧 Chart generation configuration:')
    
    try {
      const enabled = this.config.charts.enabled || {}
      
      // 输出详细的配置状态
      Object.entries(enabled).forEach(([key, value]) => {
        const status = value ? '✅ WILL GENERATE' : '❌ SKIPPED'
        console.log(`  - ${key}: ${status}`)
      })
      
      const chartPromises = []
      const chartKeys = []

      // Create API Keys mapping for trend charts
      const apiKeysMap = {}
      if (dashboardData.apiKeysDetailedUsage && dashboardData.apiKeysDetailedUsage.apiKeysUsage) {
        dashboardData.apiKeysDetailedUsage.apiKeysUsage.forEach(key => {
          apiKeysMap[key.id] = { name: key.name, isActive: key.isActive }
        })
      }

      // Generate charts based on configuration
      if (enabled.systemOverview === true) {
        console.log('🏗️ Adding systemOverview chart to generation queue')
        chartPromises.push(this.generateSystemOverviewChart(dashboardData))
        chartKeys.push('systemOverview')
      }

      if (enabled.modelDistribution === true) {
        console.log('🏗️ Adding modelDistribution chart to generation queue')
        chartPromises.push(this.generateModelDistributionChart(dashboardData.modelStats))
        chartKeys.push('modelDistribution')
      }

      if (enabled.usageTrend === true) {
        console.log('🏗️ Adding usageTrend chart to generation queue')
        chartPromises.push(this.generateUsageTrendChart(dashboardData.usageTrend))
        chartKeys.push('usageTrend')
      }

      if (enabled.apiKeysTrend === true) {
        console.log('🏗️ Adding apiKeysTrend charts (requests & tokens) to generation queue')
        chartPromises.push(this.generateApiKeysTrendChart(dashboardData.apiKeysTrend, 'requests', apiKeysMap))
        chartKeys.push('apiKeysTrendRequests')
        chartPromises.push(this.generateApiKeysTrendChart(dashboardData.apiKeysTrend, 'tokens', apiKeysMap))
        chartKeys.push('apiKeysTrendTokens')
      }

      // API Key specific charts
      if (enabled.apiKeyUsage === true) {
        console.log('🏗️ Adding apiKeyUsage chart to generation queue')
        chartPromises.push(this.generateApiKeyUsageChart(dashboardData.apiKeysDetailedUsage))
        chartKeys.push('apiKeyUsage')
      }

      if (enabled.apiKeyCost === true) {
        console.log('🏗️ Adding apiKeyCost chart to generation queue')
        chartPromises.push(this.generateApiKeyCostChart(dashboardData.apiKeysDetailedUsage))
        chartKeys.push('apiKeyCost')
      }

      if (enabled.apiKeyActivity === true) {
        console.log('🏗️ Adding apiKeyActivity chart to generation queue')
        chartPromises.push(this.generateApiKeyActivityChart(dashboardData.apiKeysTrend, apiKeysMap))
        chartKeys.push('apiKeyActivity')
      }

      // Generate all charts
      console.log(`🚀 Starting generation of ${chartPromises.length} charts...`)
      const chartResults = await Promise.all(chartPromises)
      const charts = {}
      const savedFiles = {}

      // Process chart results and save to files
      console.log('📊 Processing chart generation results:')
      for (let index = 0; index < chartResults.length; index++) {
        const chart = chartResults[index]
        const chartKey = chartKeys[index]

        if (chart) {
          charts[chartKey] = chart
          console.log(`  ✅ ${chartKey}: Generated successfully (${this.formatBytes(chart.length)})`)

          // Save chart to file
          const fileInfo = await this.saveChartToFile(chart, chartKey)
          if (fileInfo) {
            savedFiles[chartKey] = fileInfo
            console.log(`  💾 ${chartKey}: Saved to ${fileInfo.filename}`)
          } else {
            console.warn(`  ⚠️ ${chartKey}: Generated but failed to save to file`)
          }
        } else {
          console.error(`  ❌ ${chartKey}: Generation failed (returned null)`)
        }
      }

      console.log(`✅ Generated ${Object.keys(charts).length} charts successfully`)
      console.log(`📊 Chart types: ${Object.keys(charts).join(', ')}`)
      console.log(`💾 Saved ${Object.keys(savedFiles).length} chart files`)

      // Show new feature hints
      const newFeatures = ['apiKeyUsage', 'apiKeyCost', 'apiKeyActivity']
      const generatedNewFeatures = newFeatures.filter((key) => charts[key])
      if (generatedNewFeatures.length > 0) {
        console.log(`✨ New API Key charts generated: ${generatedNewFeatures.join(', ')}`)
      }

      // Return chart data including base64 encoding for full-size charts
      const chartsWithBase64 = {}

      // Add normal size charts with base64 encoding for direct embedding
      Object.entries(charts).forEach(([key, buffer]) => {
        chartsWithBase64[key] = {
          buffer: buffer,
          base64: buffer.toString('base64'),
          dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
          size: buffer.length,
          type: 'normal',
          width: this.width,
          height: this.height
        }
      })

      console.log(`📊 Generated ${Object.keys(chartsWithBase64).length} charts with base64 encoding`)

      return {
        charts: chartsWithBase64,
        files: savedFiles,
        summary: {
          generated: Object.keys(charts).length,
          saved: Object.keys(savedFiles).length,
          newFeatures: newFeatures.filter((key) => charts[key])
        }
      }
    } catch (error) {
      console.error('Failed to generate charts:', error)
      return {
        charts: {},
        files: {},
        summary: {
          generated: 0,
          saved: 0,
          newFeatures: [],
          error: error.message
        }
      }
    }
  }


  /**
   * Format byte size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

module.exports = WebhookChartGenerator
