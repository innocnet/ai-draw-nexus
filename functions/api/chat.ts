import type { Env, ChatRequest, LLMConfig } from './_shared/types'
import { corsHeaders, handleCors } from './_shared/cors'
import { validateAccessPassword } from './_shared/auth'
import { callOpenAI, callAnthropic } from './_shared/ai-providers'
import { streamOpenAI } from './_shared/stream-openai'
import { streamAnthropic } from './_shared/stream-anthropic'

interface PagesContext {
  request: Request
  env: Env
}

/**
 * 根据 LLM 配置创建有效的环境变量对象
 */
function createEffectiveEnv(env: Env, llmConfig?: LLMConfig): Env {
  if (!llmConfig || !llmConfig.apiKey) {
    return env
  }
  console.log('llmConfig', llmConfig)
  return {
    AI_PROVIDER: llmConfig.provider || env.AI_PROVIDER,
    AI_BASE_URL: llmConfig.baseUrl || env.AI_BASE_URL,
    AI_API_KEY: llmConfig.apiKey,
    AI_MODEL_ID: llmConfig.modelId || env.AI_MODEL_ID,
  }
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders })
}

export const onRequestPost: PagesFunction<Env> = async (context: PagesContext) => {
  const { request, env } = context

  try {
    const { valid, exempt } = validateAccessPassword(request, env)
    if (!valid) {
      return new Response(JSON.stringify({ error: '访问密码错误' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ChatRequest = await request.json()
    const { messages, stream = false, llmConfig } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request: messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 使用自定义 LLM 配置时也免除配额
    const hasCustomLLM = !!(llmConfig && llmConfig.apiKey)
    const effectiveExempt = exempt || hasCustomLLM
    const effectiveEnv = createEffectiveEnv(env, llmConfig)
    const provider = effectiveEnv.AI_PROVIDER || 'openai'
    const quotaHeaders = { ...corsHeaders, 'X-Quota-Exempt': effectiveExempt ? 'true' : 'false' }

    if (stream) {
      switch (provider) {
        case 'anthropic':
          return streamAnthropic(messages, effectiveEnv, effectiveExempt)
        case 'openai':
        default:
          return streamOpenAI(messages, effectiveEnv, effectiveExempt)
      }
    } else {
      let response: string

      switch (provider) {
        case 'anthropic':
          response = await callAnthropic(messages, effectiveEnv)
          break
        case 'openai':
        default:
          response = await callOpenAI(messages, effectiveEnv)
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
