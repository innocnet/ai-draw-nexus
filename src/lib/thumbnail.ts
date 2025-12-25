import mermaid from 'mermaid'
import { exportToBlob, restoreElements, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { EngineType } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElementAny = any

/**
 * Generate thumbnail from Mermaid diagram
 */
export async function generateMermaidThumbnail(code: string): Promise<string> {
  if (!code.trim()) return ''

  try {
    // Render mermaid to SVG
    const id = `thumbnail-${Date.now()}`
    const { svg } = await mermaid.render(id, code)

    // Convert SVG to PNG using canvas
    return await svgToDataUrl(svg)
  } catch (error) {
    console.error('Failed to generate Mermaid thumbnail:', error)
    return ''
  }
}

/**
 * Fix Excalidraw elements with zero dimensions
 */
function fixZeroDimensionElements(elements: ExcalidrawElementAny[]): ExcalidrawElementAny[] {
  return elements.map(element => {
    if (element.type === 'line' || element.type === 'arrow') {
      const needsFix = element.width === 0 || element.height === 0
      if (needsFix) {
        return {
          ...element,
          width: element.width === 0 ? 1 : element.width,
          height: element.height === 0 ? 1 : element.height,
        }
      }
    }
    return element
  })
}

/**
 * Generate thumbnail from Excalidraw JSON data
 */
export async function generateExcalidrawThumbnail(jsonContent: string): Promise<string> {
  if (!jsonContent.trim()) return ''

  try {
    const parsed = JSON.parse(jsonContent)

    // Support both array format and object format
    let elementsData: ExcalidrawElementAny[]
    if (Array.isArray(parsed)) {
      elementsData = parsed
    } else if (parsed.elements && Array.isArray(parsed.elements)) {
      elementsData = parsed.elements
    } else {
      console.error('Invalid Excalidraw data format')
      return ''
    }

    if (elementsData.length === 0) return ''

    // Fix zero dimension elements and restore
    const fixedElements = fixZeroDimensionElements(elementsData)
    const restoredElements = restoreElements(
      convertToExcalidrawElements(fixedElements),
      null,
      { repairBindings: true }
    )

    // Export to blob - let Excalidraw auto-calculate dimensions to fit all elements
    const blob = await exportToBlob({
      elements: restoredElements,
      appState: {
        exportWithDarkMode: false,
        exportBackground: true,
        viewBackgroundColor: '#ffffff',
      },
      files: null,
      exportPadding: 20,
    })

    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('Failed to generate Excalidraw thumbnail:', error)
    return ''
  }
}

const DRAWIO_EXPORT_URL = import.meta.env.VITE_DRAWIO_EXPORT_URL || 'https://convert.diagrams.net/node/export'

/**
 * Generate thumbnail from Drawio XML data
 * Uses the official Draw.io export service for accurate rendering
 */
export async function generateDrawioThumbnail(xmlContent: string): Promise<string> {
  if (!xmlContent.trim()) return ''

  // try {
  //   // Use Draw.io's official export service
  //   const response = await fetch(DRAWIO_EXPORT_URL, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/x-www-form-urlencoded',
  //     },
  //     body: new URLSearchParams({
  //       xml: xmlContent,
  //       format: 'png',
  //       scale: '1',
  //       bg: '#ffffff',
  //     }),
  //   })

  //   if (!response.ok) {
  //     console.warn('Draw.io export service failed, falling back to simple renderer')
  //     return generateDrawioThumbnailFallback(xmlContent)
  //   }

  //   const blob = await response.blob()
  //   return new Promise((resolve, reject) => {
  //     const reader = new FileReader()
  //     reader.onloadend = () => resolve(reader.result as string)
  //     reader.onerror = reject
  //     reader.readAsDataURL(blob)
  //   })
  // } catch (error) {
  //   console.warn('Draw.io export failed, using fallback:', error)
  // }
  return generateDrawioThumbnailFallback(xmlContent)
}

/**
 * Fallback: Generate simplified thumbnail from Drawio XML
 * Used when the export service is unavailable
 */
function generateDrawioThumbnailFallback(xmlContent: string): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlContent, 'text/xml')

      const parserError = doc.querySelector('parsererror')
      if (parserError) {
        resolve('')
        return
      }

      // Build cell map for edge connections
      const cellMap = new Map<string, { x: number; y: number; width: number; height: number }>()
      doc.querySelectorAll('mxCell').forEach(cell => {
        const id = cell.getAttribute('id')
        const geometry = cell.querySelector('mxGeometry')
        if (id && geometry) {
          cellMap.set(id, {
            x: parseFloat(geometry.getAttribute('x') || '0'),
            y: parseFloat(geometry.getAttribute('y') || '0'),
            width: parseFloat(geometry.getAttribute('width') || '0'),
            height: parseFloat(geometry.getAttribute('height') || '0'),
          })
        }
      })

      const cells = doc.querySelectorAll('mxCell[vertex="1"], mxCell[edge="1"]')
      if (cells.length === 0) {
        resolve('')
        return
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const shapes: Array<{
        type: string; x: number; y: number; width: number; height: number
        fill: string; stroke: string; text?: string; fontSize?: number; fontColor?: string
        points?: Array<{ x: number; y: number }>
      }> = []

      cells.forEach(cell => {
        const geometry = cell.querySelector('mxGeometry')
        if (!geometry) return

        const x = parseFloat(geometry.getAttribute('x') || '0')
        const y = parseFloat(geometry.getAttribute('y') || '0')
        const width = parseFloat(geometry.getAttribute('width') || '0')
        const height = parseFloat(geometry.getAttribute('height') || '0')
        const style = cell.getAttribute('style') || ''
        const isEdge = cell.getAttribute('edge') === '1'

        // Extract text
        const value = cell.getAttribute('value') || ''
        const text = value.replace(/<[^>]*>/g, '').replace(/&\w+;/g, ' ').trim()

        // Parse colors
        let fill = style.match(/fillColor=([^;]+)/)?.[1] || '#ffffff'
        let stroke = style.match(/strokeColor=([^;]+)/)?.[1] || '#000000'
        if (fill === 'none') fill = 'transparent'
        if (stroke === 'none') stroke = '#000000'
        const fontColor = style.match(/fontColor=([^;]+)/)?.[1] || '#000000'
        const fontSize = parseInt(style.match(/fontSize=(\d+)/)?.[1] || '12', 10)

        if (isEdge) {
          const sourceId = cell.getAttribute('source')
          const targetId = cell.getAttribute('target')
          let sx = parseFloat(geometry.querySelector('mxPoint[as="sourcePoint"]')?.getAttribute('x') || '')
          let sy = parseFloat(geometry.querySelector('mxPoint[as="sourcePoint"]')?.getAttribute('y') || '')
          let tx = parseFloat(geometry.querySelector('mxPoint[as="targetPoint"]')?.getAttribute('x') || '')
          let ty = parseFloat(geometry.querySelector('mxPoint[as="targetPoint"]')?.getAttribute('y') || '')

          if (isNaN(sx) && sourceId && cellMap.has(sourceId)) {
            const s = cellMap.get(sourceId)!
            sx = s.x + s.width / 2; sy = s.y + s.height / 2
          }
          if (isNaN(tx) && targetId && cellMap.has(targetId)) {
            const t = cellMap.get(targetId)!
            tx = t.x + t.width / 2; ty = t.y + t.height / 2
          }

          if (!isNaN(sx) && !isNaN(tx)) {
            shapes.push({ type: 'line', x: 0, y: 0, width: 0, height: 0, fill, stroke, points: [{ x: sx, y: sy }, { x: tx, y: ty }] })
            minX = Math.min(minX, sx, tx); minY = Math.min(minY, sy, ty)
            maxX = Math.max(maxX, sx, tx); maxY = Math.max(maxY, sy, ty)
          }
        } else {
          const shapeType = style.includes('ellipse') ? 'ellipse' : 'rect'
          shapes.push({ type: shapeType, x, y, width, height, fill, stroke, text, fontColor, fontSize })
          minX = Math.min(minX, x); minY = Math.min(minY, y)
          maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height)
        }
      })

      if (shapes.length === 0) { resolve(''); return }

      const padding = 20
      const svgWidth = maxX - minX + padding * 2
      const svgHeight = maxY - minY + padding * 2
      const offsetX = -minX + padding
      const offsetY = -minY + padding

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}"><rect width="100%" height="100%" fill="#fff"/>`

      // Draw lines first
      shapes.filter(s => s.type === 'line').forEach(s => {
        if (s.points && s.points.length >= 2) {
          const [p1, p2] = s.points
          svg += `<line x1="${p1.x + offsetX}" y1="${p1.y + offsetY}" x2="${p2.x + offsetX}" y2="${p2.y + offsetY}" stroke="${s.stroke}" stroke-width="1.5" marker-end="url(#arrow)"/>`
        }
      })

      // Draw shapes
      shapes.filter(s => s.type !== 'line').forEach(s => {
        if (s.type === 'ellipse') {
          svg += `<ellipse cx="${s.x + s.width / 2 + offsetX}" cy="${s.y + s.height / 2 + offsetY}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5"/>`
        } else {
          svg += `<rect x="${s.x + offsetX}" y="${s.y + offsetY}" width="${s.width}" height="${s.height}" rx="3" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5"/>`
        }
        if (s.text) {
          const escaped = s.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          svg += `<text x="${s.x + s.width / 2 + offsetX}" y="${s.y + s.height / 2 + offsetY}" font-family="Arial" font-size="${s.fontSize}" fill="${s.fontColor}" text-anchor="middle" dominant-baseline="middle">${escaped}</text>`
        }
      })

      svg += `<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#000"/></marker></defs></svg>`

      resolve(await svgToDataUrl(svg))
    } catch {
      resolve('')
    }
  })
}

/**
 * Convert SVG string to PNG data URL
 */
async function svgToDataUrl(svgString: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    // Set crossOrigin to anonymous to avoid tainted canvas
    img.crossOrigin = 'anonymous'

    // Encode SVG as base64 data URL to avoid tainted canvas issue
    const encodedSvg = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${encodedSvg}`

    img.onload = () => {
      // Create canvas with fixed dimensions for thumbnail
      const canvas = document.createElement('canvas')
      const maxWidth = 400
      const maxHeight = 300

      // Calculate aspect ratio
      let width = img.width || maxWidth
      let height = img.height || maxHeight

      if (width > maxWidth) {
        height = (maxWidth / width) * height
        width = maxWidth
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width
        height = maxHeight
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Draw white background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      // Draw image
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to data URL
      try {
        const pngDataUrl = canvas.toDataURL('image/png', 0.8)
        resolve(pngDataUrl)
      } catch (e) {
        reject(new Error('Failed to export canvas: ' + (e as Error).message))
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load SVG'))
    }

    img.src = dataUrl
  })
}

/**
 * Generate thumbnail based on engine type
 */
export async function generateThumbnail(
  content: string,
  engineType: EngineType
): Promise<string> {
  if (!content.trim()) return ''

  switch (engineType) {
    case 'mermaid':
      return generateMermaidThumbnail(content)
    case 'excalidraw':
      return generateExcalidrawThumbnail(content)
    case 'drawio':
      return generateDrawioThumbnail(content)
    default:
      return ''
  }
}
