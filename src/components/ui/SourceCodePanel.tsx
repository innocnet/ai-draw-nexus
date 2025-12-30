import { useState, useCallback, useEffect } from 'react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markup'
import 'prismjs/themes/prism.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip'
import { X, Copy, Check, Play, Undo2 } from 'lucide-react'

export type SourceLanguage = 'json' | 'xml' | 'mermaid'

interface SourceCodePanelProps {
  code: string
  language: SourceLanguage
  title: string
  onApply: (code: string) => void
  onClose: () => void
  className?: string
}

const highlightCode = (code: string, language: SourceLanguage): string => {
  if (language === 'json') {
    return Prism.highlight(code, Prism.languages.json, 'json')
  } else if (language === 'xml') {
    return Prism.highlight(code, Prism.languages.markup, 'markup')
  } else {
    // mermaid - use plain text highlighting
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

export function SourceCodePanel({
  code,
  language,
  title,
  onApply,
  onClose,
  className,
}: SourceCodePanelProps) {
  const [editedCode, setEditedCode] = useState(code)
  const [hasChanges, setHasChanges] = useState(false)
  const [copied, setCopied] = useState(false)

  // Sync editedCode when code prop changes
  useEffect(() => {
    setEditedCode(code)
    setHasChanges(false)
  }, [code])

  // Handle code change
  const handleCodeChange = useCallback((value: string) => {
    setEditedCode(value)
    setHasChanges(value !== code)
  }, [code])

  // Copy code handler
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }, [editedCode])

  // Apply code changes
  const handleApplyCode = useCallback(() => {
    if (editedCode.trim() && hasChanges) {
      onApply(editedCode)
      setHasChanges(false)
    }
  }, [editedCode, hasChanges, onApply])

  // Reset code to original
  const handleResetCode = useCallback(() => {
    setEditedCode(code)
    setHasChanges(false)
  }, [code])

  return (
    <div className={cn(
      'absolute bottom-4 right-4 z-10 w-96 max-h-[70%] flex flex-col border border-border bg-surface shadow-lg',
      className
    )}>
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {hasChanges && (
            <span className="text-xs text-amber-500">• 未保存</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCode}
                className="h-7 w-7 p-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? '已复制' : '复制代码'}</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Code Editor */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ height: '300px' }}>
        <Editor
          value={editedCode}
          onValueChange={handleCodeChange}
          highlight={(code) => highlightCode(code, language)}
          padding={12}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.5,
            minHeight: '100%',
          }}
          textareaClassName="focus:outline-none"
        />
      </div>

      {/* Panel Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetCode}
              disabled={!hasChanges}
              className="gap-1.5"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="text-xs">重置</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>重置为原始代码</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              onClick={handleApplyCode}
              disabled={!hasChanges || !editedCode.trim()}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="text-xs">应用</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>应用代码更改</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
