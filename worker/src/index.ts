import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

export interface Env {
  AI_PROVIDER: string
  AI_BASE_URL: string
  AI_API_KEY: string
  AI_MODEL_ID: string
  ACCESS_PASSWORD?: string
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface AnthropicContentPart {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

interface ChatRequest {
  messages: Message[]
  stream?: boolean
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface AnthropicResponse {
  content: Array<{
    type: string
    text: string
  }>
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Password',
  'Access-Control-Expose-Headers': 'X-Quota-Exempt',
}

/**
 * 验证访问密码
 * @returns { valid: boolean, exempt: boolean }
 * - valid: 请求是否有效（密码正确或无需密码）
 * - exempt: 是否免除配额消耗
 */
function validateAccessPassword(request: Request, env: Env): { valid: boolean; exempt: boolean } {
  const password = request.headers.get('X-Access-Password')
  const configuredPassword = env.ACCESS_PASSWORD

  // 后端未配置密码，所有请求都有效但不免除配额
  if (!configuredPassword) {
    return { valid: true, exempt: false }
  }

  // 请求携带密码
  if (password) {
    if (password === configuredPassword) {
      return { valid: true, exempt: true }
    }
    // 密码错误
    return { valid: false, exempt: false }
  }

  // 未携带密码，有效但不免除配额
  return { valid: true, exempt: false }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)

    // Route handling
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env)
    }

    // URL parsing endpoint
    if (url.pathname === '/api/parse-url' && request.method === 'POST') {
      return handleParseUrl(request)
    }

    // Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders })
  },
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    // 验证访问密码
    const { valid, exempt } = validateAccessPassword(request, env)
    if (!valid) {
      return new Response(JSON.stringify({ error: '访问密码错误' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ChatRequest = await request.json()
    const { messages, stream = false } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request: messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const provider = env.AI_PROVIDER || 'openai'

    // 添加配额免除标记的响应头
    const quotaHeaders = { ...corsHeaders, 'X-Quota-Exempt': exempt ? 'true' : 'false' }

    if (stream) {
      // Streaming response
      switch (provider) {
        case 'anthropic':
          return streamAnthropic(messages, env, exempt)
        case 'openai':
        default:
          return streamOpenAI(messages, env, exempt)
      }
    } else {
      // Non-streaming response
      let response: string

      switch (provider) {
        case 'anthropic':
          response = await callAnthropic(messages, env)
          break
        case 'openai':
        default:
          response = await callOpenAI(messages, env)
          break
      }

      return new Response(JSON.stringify({ content: response }), {
        headers: { ...quotaHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error('Chat error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

async function callOpenAI(messages: Message[], env: Env): Promise<string> {
  const baseUrl = env.AI_BASE_URL
  const apiKey = env.AI_API_KEY

  if (!apiKey) {
    throw new Error('AI_API_KEY not configured')
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL_ID,
      messages: messages,
      max_tokens: 64000,
      stream: false,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data: OpenAIResponse = await response.json()
  console.log(data.choices[0]?.message?.content)
  return data.choices[0]?.message?.content || ''
}

async function callAnthropic(messages: Message[], env: Env): Promise<string> {
  const baseUrl = env.AI_BASE_URL 
  const apiKey = env.AI_API_KEY

  if (!apiKey) {
    throw new Error('AI_API_KEY not configured')
  }

  // Convert OpenAI format to Anthropic format
  const systemMessage = messages.find((m) => m.role === 'system')
  const nonSystemMessages = messages.filter((m) => m.role !== 'system')

  const anthropicMessages = nonSystemMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: typeof m.content === 'string' ? m.content : convertContentPartsToAnthropic(m.content),
  }))

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.AI_MODEL_ID ,
      max_tokens: 64000,
      system: typeof systemMessage?.content === 'string' ? systemMessage.content : '',
      messages: anthropicMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  const data: AnthropicResponse = await response.json()
  return data.content[0]?.text || ''
}

function convertContentPartsToAnthropic(parts: ContentPart[]): AnthropicContentPart[] {
  return parts
    .map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text || '' }
      }
      if (part.type === 'image_url' && part.image_url?.url) {
        // Handle base64 data URL format: data:image/jpeg;base64,/9j/4AAQ...
        const url = part.image_url.url
        if (url.startsWith('data:')) {
          const matches = url.match(/^data:(image\/[^;]+);base64,(.+)$/)
          if (matches) {
            return {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: matches[1],
                data: matches[2],
              },
            }
          }
        }
        // For URL-based images, we cannot directly convert to Anthropic format
        // Anthropic requires base64 data, so we return a text placeholder
        return { type: 'text' as const, text: `[Image URL: ${url}]` }
      }
      return { type: 'text' as const, text: '' }
    })
    .filter((part) => part.type === 'image' || (part.type === 'text' && part.text))
}

/**
 * Stream OpenAI response using SSE
 */
async function streamOpenAI(messages: Message[], env: Env, exempt: boolean = false): Promise<Response> {
  const baseUrl = env.AI_BASE_URL
  const apiKey = env.AI_API_KEY

  if (!apiKey) {
    throw new Error('AI_API_KEY not configured')
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL_ID,
      messages: messages,
      max_tokens: 64000,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  // Transform the stream to SSE format for the client
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'))
            continue
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Quota-Exempt': exempt ? 'true' : 'false',
    },
  })
}

/**
 * Stream Anthropic response using SSE
 */
async function streamAnthropic(messages: Message[], env: Env, exempt: boolean = false): Promise<Response> {
  const baseUrl = env.AI_BASE_URL
  const apiKey = env.AI_API_KEY

  if (!apiKey) {
    throw new Error('AI_API_KEY not configured')
  }

  // Convert OpenAI format to Anthropic format
  const systemMessage = messages.find((m) => m.role === 'system')
  const nonSystemMessages = messages.filter((m) => m.role !== 'system')

  const anthropicMessages = nonSystemMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: typeof m.content === 'string' ? m.content : convertContentPartsToAnthropic(m.content),
  }))

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.AI_MODEL_ID,
      max_tokens: 64000,
      system: typeof systemMessage?.content === 'string' ? systemMessage.content : '',
      messages: anthropicMessages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  // Transform the stream to SSE format for the client
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  ;(async () => {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'))
            continue
          }

          try {
            const parsed = JSON.parse(data)
            // Anthropic stream format: content_block_delta with delta.text
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`))
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Quota-Exempt': exempt ? 'true' : 'false',
    },
  })
}

/**
 * Check if URL is a WeChat article
 */
function isWechatArticle(url: string): boolean {
  return url.includes('mp.weixin.qq.com')
}

/**
 * Preprocess WeChat article DOM
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function preprocessWechatArticle(document: any): void {
  const jsContent = document.getElementById('js_content')
  if (jsContent) {
    jsContent.style.visibility = 'visible'
    jsContent.style.display = 'block'
  }

  const images = document.querySelectorAll('img[data-src]')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  images.forEach((img: any) => {
    const dataSrc = img.getAttribute('data-src')
    if (dataSrc) {
      img.setAttribute('src', dataSrc)
    }
  })

  const removeSelectors = [
    '#js_pc_qr_code',
    '#js_profile_qrcode',
    '.qr_code_pc_outer',
    '.rich_media_area_extra',
    '.reward_area',
    '#js_tags',
    '.original_area_primary',
    '.original_area_extra',
  ]
  removeSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elements.forEach((el: any) => el.remove())
  })
}

/**
 * Extract content from WeChat article (fallback when Readability fails)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractWechatContent(document: any): { title: string; content: string } | null {
  const titleEl = document.getElementById('activity-name') ||
                  document.querySelector('.rich_media_title') ||
                  document.querySelector('h1')
  const title = titleEl?.textContent?.trim() || '微信公众号文章'

  const contentEl = document.getElementById('js_content') ||
                    document.querySelector('.rich_media_content')

  if (!contentEl) {
    return null
  }

  return { title, content: contentEl.innerHTML }
}

/**
 * Handle URL parsing request
 */
async function handleParseUrl(request: Request): Promise<Response> {
  try {
    const { url } = await request.json() as { url: string }

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: '请提供有效的URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: 'URL格式无效' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isWechat = isWechatArticle(url)

    // Build request headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    if (isWechat) {
      headers['Referer'] = 'https://mp.weixin.qq.com/'
    }

    // Fetch the page
    const response = await fetch(url, { headers, redirect: 'follow' })

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `无法获取页面内容: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const html = await response.text()
    const { document } = parseHTML(html)

    if (isWechat) {
      preprocessWechatArticle(document)
    }

    // Try Readability first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new Readability(document.cloneNode(true) as any)
    let article = reader.parse()

    // Fallback for WeChat
    if (!article && isWechat) {
      const wechatContent = extractWechatContent(document)
      if (wechatContent) {
        article = {
          title: wechatContent.title,
          content: wechatContent.content,
          textContent: '',
          length: wechatContent.content.length,
          excerpt: '',
          byline: '',
          dir: '',
          siteName: '微信公众号',
          lang: 'zh-CN',
          publishedTime: null,
        }
      }
    }

    if (!article) {
      return new Response(
        JSON.stringify({ error: '无法解析页面内容，该页面可能不是文章类型' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })

    turndownService.addRule('removeEmptyLinks', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter: (node: any) => node.nodeName === 'A' && !node.textContent?.trim(),
      replacement: () => '',
    })

    turndownService.addRule('wechatImages', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter: (node: any) => node.nodeName === 'IMG',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      replacement: (_content: string, node: any) => {
        const src = node.getAttribute('src') || node.getAttribute('data-src') || ''
        const alt = node.getAttribute('alt') || ''
        return src ? `![${alt}](${src})` : ''
      },
    })

    const wrappedHtml = `<!DOCTYPE html><html><body>${article.content || ''}</body></html>`
    const { document: contentDoc } = parseHTML(wrappedHtml)
    const markdown = turndownService.turndown(contentDoc.body)

    const siteName = isWechat ? '微信公众号' : parsedUrl.hostname
    const fullMarkdown = `# ${article.title}\n\n> 来源: [${siteName}](${url})\n\n${markdown}`

    return new Response(JSON.stringify({
      success: true,
      data: {
        title: article.title,
        content: fullMarkdown,
        excerpt: article.excerpt,
        siteName: article.siteName || siteName,
        url: url,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Parse URL error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '解析失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
