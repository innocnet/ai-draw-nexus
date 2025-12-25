import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, Attachment } from '@/types'

interface ChatState {
  // UI messages for display
  messages: ChatMessage[]
  // Initial prompt from Quick Start (Path A)
  initialPrompt: string | null
  // Initial attachments from Quick Start (Path A)
  initialAttachments: Attachment[] | null
  // Streaming state
  isStreaming: boolean

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, data: Partial<ChatMessage>) => void
  clearMessages: () => void
  setInitialPrompt: (prompt: string | null, attachments?: Attachment[] | null) => void
  clearInitialPrompt: () => void
  setStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  initialPrompt: null,
  initialAttachments: null,
  isStreaming: false,

  addMessage: (message) => {
    const id = uuidv4()
    const newMessage: ChatMessage = {
      ...message,
      id,
      timestamp: new Date(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
    }))
    return id
  },

  updateMessage: (id, data) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...data } : msg
      ),
    }))
  },

  clearMessages: () => set({ messages: [] }),

  setInitialPrompt: (prompt, attachments) => set({ initialPrompt: prompt, initialAttachments: attachments ?? null }),

  clearInitialPrompt: () => set({ initialPrompt: null, initialAttachments: null }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
}))
