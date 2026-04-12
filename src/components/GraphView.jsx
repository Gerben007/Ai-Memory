import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'

const REPULSION = 500
const SPRING_STRENGTH = 0.05
const IDEAL_LENGTH = 120
const GRAVITY = 0.01
const DAMPING = 0.85
const INITIAL_TEMP = 1.0
const COOLING = 0.995
const MIN_TEMP = 0.01

const TAG_PALETTE = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635'
]

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getTagColor(tag) {
  if (!tag) return '#64748b'
  return TAG_PALETTE[hashCode(tag) % TAG_PALETTE.length]
}

function buildGraphData(notes) {
  const nodes = notes.map(note => {
    const wordCount = (note.body || '').split(/\s+/).filter(Boolean).length
    const tags = note.frontmatter?.tags || []
    return {
      id: note.filename,
      title: note.frontmatter?.title || note.filename.replace(/\.md$/, ''),
      tags,
      primaryTag: tags[0] || null,
      wordCount,
      radius: Math.max(6, Math.min(20, Math.sqrt(wordCount) * 0.5)),
      color: getTagColor(tags[0]),
      x: 0, y: 0,
      vx: 0, vy: 0
    }
  })

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges = []
  const edgeSet = new Set()

  // Wikilink edges
  for (const note of notes) {
    const links = extractWikilinks(note.body || '')
    for (const link of links) {
      const targetNote = notes.find(n => {
        const t = (n.frontmatter?.title || '').toLowerCase()
        const name = n.filename.replace(/\.md$/, '').toLowerCase()
        return t === link.target.toLowerCase() || name === link.target.toLowerCase()
      })
      if (targetNote) {
        const key = [note.filename, targetNote.filename].sort().join('::')
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push({
            source: note.filename,
            target: targetNote.filename,
            type: 'wikilink'
          })
        }
      }
    }
  }

  // Shared tag edges
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const tagsA = new Set(notes[i].frontmatter?.tags || [])
      const tagsB = notes[j].frontmatter?.tags || []
      const shared = tagsB.filter(t => tagsA.has(t))
      if (shared.length > 0) {
        const key = [notes[i].filename, notes[j].filename].sort().join('::')
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push({
            source: notes[i].filename,
            target: notes[j].filename,
            type: 'tag',
            weight: shared.length
          })
        }
      }
    }
  }

  return { nodes, edges, nodeMap }
}

export default function GraphView() {
  const canvasRef = useRef(null)
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)

  const graphRef = useRef({ nodes: [], edges: [], nodeMap: new Map() })
  const animRef = useRef(null)
  const tempRef = useRef(INITIAL_TEMP)
  const dragRef = useRef(null)
  const hoverRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef(null)

  const [, forceUpdate] = useState(0)

  // Initialize graph data
  useEffect(() => {
    const { nodes, edges, nodeMap } = buildGraphData(notes)
    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.parentElement.clientWidth
    const h = canvas.parentElement.clientHeight

    // Spread nodes initially
    for (const node of nodes) {
      node.x = w / 2 + (Math.random() - 0.5) * w * 0.6
      node.y = h / 2 + (Math.random() - 0.5) * h * 0.6
    }

    graphRef.current = { nodes, edges, nodeMap }
    tempRef.current = INITIAL_TEMP
  }, [notes])

  // Simulation + rendering loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let running = true

    function resize() {
      const parent = canvas.parentElement
      canvas.width = parent.clientWidth * window.devicePixelRatio
      canvas.height = parent.clientHeight * window.devicePixelRatio
      canvas.style.width = parent.clientWidth + 'px'
      canvas.style.height = parent.clientHeight + 'px'
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement)

    function tick() {
      if (!running) return

      const { nodes, edges } = graphRef.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const temp = tempRef.current

      if (nodes.length > 0 && temp > MIN_TEMP) {
        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x
            const dy = nodes[j].y - nodes[i].y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = REPULSION / (dist * dist)
            const fx = force * dx / dist * temp
            const fy = force * dy / dist * temp
            nodes[i].vx -= fx
            nodes[i].vy -= fy
            nodes[j].vx += fx
            nodes[j].vy += fy
          }
        }

        // Attraction along edges
        for (const edge of edges) {
          const s = nodes.find(n => n.id === edge.source)
          const t = nodes.find(n => n.id === edge.target)
          if (!s || !t) continue
          const dx = t.x - s.x
          const dy = t.y - s.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - IDEAL_LENGTH) * SPRING_STRENGTH * temp
          const fx = force * dx / dist
          const fy = force * dy / dist
          s.vx += fx
          s.vy += fy
          t.vx -= fx
          t.vy -= fy
        }

        // Center gravity
        const cx = w / 2
        const cy = h / 2
        for (const node of nodes) {
          node.vx += (cx - node.x) * GRAVITY
          node.vy += (cy - node.y) * GRAVITY
        }

        // Update positions
        for (const node of nodes) {
          if (dragRef.current?.id === node.id) continue
          node.vx *= DAMPING
          node.vy *= DAMPING
          node.x += node.vx
          node.y += node.vy
        }

        tempRef.current *= COOLING
      }

      // Render
      const { scale, offsetX, offsetY } = transformRef.current
      ctx.setTransform(scale * window.devicePixelRatio, 0, 0, scale * window.devicePixelRatio, offsetX * window.devicePixelRatio, offsetY * window.devicePixelRatio)
      ctx.clearRect(-offsetX / scale, -offsetY / scale, w / scale, h / scale)

      // Draw edges
      for (const edge of edges) {
        const s = nodes.find(n => n.id === edge.source)
        const t = nodes.find(n => n.id === edge.target)
        if (!s || !t) continue

        ctx.strokeStyle = edge.type === 'wikilink' ? '#6366f1' : '#334155'
        ctx.lineWidth = edge.type === 'tag' ? (edge.weight || 1) : 1.5
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw nodes
      for (const node of nodes) {
        ctx.fillStyle = node.color
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fill()

        // Outline for hovered node
        if (hoverRef.current === node.id) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Label
        ctx.fillStyle = '#cbd5e1'
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(node.title, node.x, node.y + node.radius + 14)
      }

      // Tooltip for hovered node
      if (hoverRef.current) {
        const node = nodes.find(n => n.id === hoverRef.current)
        if (node) {
          const tooltipX = node.x + node.radius + 10
          const tooltipY = node.y - 10

          ctx.font = 'bold 12px system-ui, sans-serif'
          const titleWidth = ctx.measureText(node.title).width
          const tagText = node.tags.length > 0 ? `Tags: ${node.tags.join(', ')}` : 'No tags'
          ctx.font = '11px system-ui, sans-serif'
          const tagWidth = ctx.measureText(tagText).width
          const wordText = `${node.wordCount} words`
          const wordWidth = ctx.measureText(wordText).width
          const boxWidth = Math.max(titleWidth, tagWidth, wordWidth) + 20
          const boxHeight = 58

          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
          ctx.strokeStyle = '#334155'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 6)
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = '#f1f5f9'
          ctx.font = 'bold 12px system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(node.title, tooltipX + 10, tooltipY + 18)

          ctx.fillStyle = '#94a3b8'
          ctx.font = '11px system-ui, sans-serif'
          ctx.fillText(tagText, tooltipX + 10, tooltipY + 34)
          ctx.fillText(wordText, tooltipX + 10, tooltipY + 50)
        }
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      running = false
      observer.disconnect()
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [notes])

  // Mouse interactions
  const getMousePos = useCallback((e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return {
      x: (e.clientX - rect.left - offsetX) / scale,
      y: (e.clientY - rect.top - offsetY) / scale
    }
  }, [])

  const findNodeAt = useCallback((pos) => {
    const { nodes } = graphRef.current
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = pos.x - n.x
      const dy = pos.y - n.y
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n
    }
    return null
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Pan
      panRef.current = { startX: e.clientX, startY: e.clientY, ...transformRef.current }
      return
    }
    const pos = getMousePos(e)
    const node = findNodeAt(pos)
    if (node) {
      dragRef.current = { id: node.id, offsetX: node.x - pos.x, offsetY: node.y - pos.y }
    }
  }, [getMousePos, findNodeAt])

  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      transformRef.current = {
        ...transformRef.current,
        offsetX: panRef.current.offsetX + dx,
        offsetY: panRef.current.offsetY + dy
      }
      return
    }

    const pos = getMousePos(e)

    if (dragRef.current) {
      const node = graphRef.current.nodes.find(n => n.id === dragRef.current.id)
      if (node) {
        node.x = pos.x + dragRef.current.offsetX
        node.y = pos.y + dragRef.current.offsetY
        node.vx = 0
        node.vy = 0
        tempRef.current = Math.max(tempRef.current, 0.3) // keep simulation active while dragging
      }
      return
    }

    const node = findNodeAt(pos)
    const newHover = node ? node.id : null
    if (hoverRef.current !== newHover) {
      hoverRef.current = newHover
      canvasRef.current.style.cursor = newHover ? 'pointer' : 'default'
    }
  }, [getMousePos, findNodeAt])

  const handleMouseUp = useCallback((e) => {
    if (panRef.current) {
      panRef.current = null
      return
    }

    if (dragRef.current) {
      // If barely moved, treat as click
      dragRef.current = null
      return
    }

    const pos = getMousePos(e)
    const node = findNodeAt(pos)
    if (node) {
      setActiveNote(node.id)
    }
  }, [getMousePos, findNodeAt, setActiveNote])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const scaleChange = e.deltaY > 0 ? 0.9 : 1.1
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const { scale, offsetX, offsetY } = transformRef.current
    const newScale = Math.max(0.2, Math.min(5, scale * scaleChange))

    transformRef.current = {
      scale: newScale,
      offsetX: mouseX - (mouseX - offsetX) * (newScale / scale),
      offsetY: mouseY - (mouseY - offsetY) * (newScale / scale)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4 bg-gray-900/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Brain Map</h2>
          <p className="text-xs text-gray-500 mt-1">
            {notes.length} notes &middot; Click to open &middot; Alt+drag to pan &middot; Scroll to zoom
          </p>
        </div>
        <button
          onClick={() => { tempRef.current = INITIAL_TEMP; forceUpdate(n => n + 1) }}
          className="text-xs bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-700 hover:text-gray-200"
        >
          Reset Layout
        </button>
      </div>
      <div className="flex-1 relative bg-gray-950">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="absolute inset-0"
        />
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">🕸️</div>
              <p>Create some notes to see the graph</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
