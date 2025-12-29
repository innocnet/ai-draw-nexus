export interface Env {
  AI_PROVIDER: string
  AI_BASE_URL: string
  AI_API_KEY: string
  AI_MODEL_ID: string
  ACCESS_PASSWORD?: string
}

export interface LLMConfig {
  provider: string
  baseUrl: string
  apiKey: string
  modelId: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface AnthropicContentPart {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface ChatRequest {
  messages: Message[]
  stream?: boolean
  llmConfig?: LLMConfig
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export interface AnthropicResponse {
  content: Array<{
    type: string
    text: string
  }>
}
