import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'
import { renderMarkdown } from '../lib/markdownParser'

// ── Physics constants (tuned for good spread) ───────────────────────────
const REPULSION = 4000
const SPRING_STRENGTH = 0.03
const IDEAL_LENGTH = 200
const GRAVITY = 0.002
const DAMPING = 0.82
const INITIAL_TEMP = 1.0
const COOLING = 0.997
const MIN_TEMP = 0.005

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
      radius: Math.max(8, Math.min(28, Math.sqrt(wordCount) * 0.7)),
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
          edges.push({ source: note.filename, target: targetNote.filename, type: 'wikilink' })
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
            weight: shared.length,
            sharedTags: shared
          })
        }
      }
    }
  }

  // Collect all unique tags for legend
  const allTags = new Set()
  notes.forEach(n => (n.frontmatter?.tags || []).forEach(t => allTags.add(t)))

  return { nodes, edges, nodeMap, allTags: [...allTags] }
}

// ── Note Popup ──────────────────────────────────────────────────────────
function NotePopup({ note, onClose, onOpenEditor }) {
  if (!note) return null

  const title = note.frontmatter?.title || note.filename.replace(/\.md$/, '')
  const tags = note.frontmatter?.tags || []
  const html = renderMarkdown(note.body || '')

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[700px] max-w-[90%] max-h-[80%] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-100 truncate">{title}</h2>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: getTagColor(tag) + '30', color: getTagColor(tag) }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              onClick={onOpenEditor}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500"
            >
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-1">&times;</button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        {/* Footer */}
        <div className="border-t border-gray-800 px-5 py-3 text-[10px] text-gray-500 flex justify-between">
          <span>{note.filename}</span>
          <span>{(note.body || '').split(/\s+/).filter(Boolean).length} words</span>
        </div>
      </div>
    </div>
  )
}

// ── Graph Legend ─────────────────────────────────────────────────────────
function GraphLegend({ allTags, edgeCount }) {
  if (allTags.length === 0) return null

  return (
    <div className="absolute bottom-4 left-4 bg-gray-900/90 border border-gray-800 rounded-xl p-3 backdrop-blur-sm z-10 max-w-[220px]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Tags</div>
      <div className="flex flex-wrap gap-1.5">
        {allTags.map(tag => (
          <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: getTagColor(tag) + '25', color: getTagColor(tag) }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: getTagColor(tag) }} />
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800 text-[10px] text-gray-500 space-y-0.5">
        <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" /> Wikilink</div>
        <div className="flex items-center gap-2"><span className="w-4 h-0.5 inline-block rounded" style={{ background: 'linear-gradient(90deg, #f472b6, #34d399)' }} /> Shared tag</div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────
export default function GraphView() {
  const canvasRef = useRef(null)
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const graphRef = useRef({ nodes: [], edges: [], nodeMap: new Map(), allTags: [] })
  const animRef = useRef(null)
  const tempRef = useRef(INITIAL_TEMP)
  const dragRef = useRef(null)
  const hoverRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef(null)
  const dragMovedRef = useRef(false)

  const [popupNote, setPopupNote] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [, forceUpdate] = useState(0)

  // Initialize graph data
  useEffect(() => {
    const data = buildGraphData(notes)
    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.parentElement.clientWidth
    const h = canvas.parentElement.clientHeight

    // Spread nodes in a circle for better initial layout
    const n = data.nodes.length
    const radius = Math.min(w, h) * 0.35
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n + (Math.random() - 0.5) * 0.5
      const r = radius * (0.5 + Math.random() * 0.5)
      data.nodes[i].x = w / 2 + Math.cos(angle) * r
      data.nodes[i].y = h / 2 + Math.sin(angle) * r
    }

    graphRef.current = data
    setAllTags(data.allTags)
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
      const dpr = window.devicePixelRatio || 1
      canvas.width = parent.clientWidth * dpr
      canvas.height = parent.clientHeight * dpr
      canvas.style.width = parent.clientWidth + 'px'
      canvas.style.height = parent.clientHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement)

    // Build node lookup for fast edge resolution
    function getNodeMap() {
      const map = new Map()
      for (const n of graphRef.current.nodes) map.set(n.id, n)
      return map
    }

    function tick() {
      if (!running) return

      const { nodes, edges } = graphRef.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const temp = tempRef.current
      const nMap = getNodeMap()

      if (nodes.length > 0 && temp > MIN_TEMP) {
        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x
            const dy = nodes[j].y - nodes[i].y
            const distSq = dx * dx + dy * dy
            const dist = Math.sqrt(distSq) || 1
            const force = REPULSION / distSq * temp
            const fx = force * dx / dist
            const fy = force * dy / dist
            nodes[i].vx -= fx
            nodes[i].vy -= fy
            nodes[j].vx += fx
            nodes[j].vy += fy
          }
        }

        // Attraction along edges
        for (const edge of edges) {
          const s = nMap.get(edge.source)
          const t = nMap.get(edge.target)
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

        // Center gravity (very gentle)
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
          // Keep nodes in bounds with soft bounce
          const pad = 40
          if (node.x < pad) { node.x = pad; node.vx *= -0.5 }
          if (node.x > w - pad) { node.x = w - pad; node.vx *= -0.5 }
          if (node.y < pad) { node.y = pad; node.vy *= -0.5 }
          if (node.y > h - pad) { node.y = h - pad; node.vy *= -0.5 }
        }

        tempRef.current *= COOLING
      }

      // ── Render ──────────────────────────────────────────────────────
      const { scale, offsetX, offsetY } = transformRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
      ctx.clearRect(-offsetX / scale - 10, -offsetY / scale - 10, w / scale + 20, h / scale + 20)

      // Draw edges
      for (const edge of edges) {
        const s = nMap.get(edge.source)
        const t = nMap.get(edge.target)
        if (!s || !t) continue

        if (edge.type === 'wikilink') {
          ctx.strokeStyle = '#6366f1'
          ctx.lineWidth = 2
          ctx.globalAlpha = 0.7
          ctx.setLineDash([])
        } else {
          // Tag edges — colored by the first shared tag
          const tagColor = edge.sharedTags ? getTagColor(edge.sharedTags[0]) : '#94a3b8'
          ctx.strokeStyle = tagColor
          ctx.lineWidth = 1 + (edge.weight || 1) * 0.5
          ctx.globalAlpha = 0.4
          ctx.setLineDash([4, 4])
        }

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1

        // Draw tag label on tag edges
        if (edge.type === 'tag' && edge.sharedTags) {
          const mx = (s.x + t.x) / 2
          const my = (s.y + t.y) / 2
          ctx.fillStyle = edge.sharedTags ? getTagColor(edge.sharedTags[0]) : '#94a3b8'
          ctx.globalAlpha = 0.6
          ctx.font = '9px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(edge.sharedTags.join(', '), mx, my - 4)
          ctx.globalAlpha = 1
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const isHovered = hoverRef.current === node.id

        // Glow effect for hovered node
        if (isHovered) {
          ctx.shadowColor = node.color
          ctx.shadowBlur = 20
        }

        // Node circle with gradient
        const grad = ctx.createRadialGradient(node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0, node.x, node.y, node.radius)
        grad.addColorStop(0, node.color + 'ff')
        grad.addColorStop(1, node.color + 'aa')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fill()

        // Border
        ctx.strokeStyle = isHovered ? '#ffffff' : node.color + '60'
        ctx.lineWidth = isHovered ? 2.5 : 1
        ctx.stroke()

        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0

        // Label
        ctx.fillStyle = isHovered ? '#f1f5f9' : '#94a3b8'
        ctx.font = `${isHovered ? 'bold ' : ''}12px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(node.title, node.x, node.y + node.radius + 16)
      }

      // Tooltip for hovered node
      if (hoverRef.current) {
        const node = nMap.get(hoverRef.current)
        if (node) {
          const tooltipX = node.x + node.radius + 12
          const tooltipY = node.y - 20

          const tagText = node.tags.length > 0 ? node.tags.join(', ') : 'No tags'
          const wordText = `${node.wordCount} words`

          ctx.font = 'bold 13px system-ui, sans-serif'
          const titleWidth = ctx.measureText(node.title).width
          ctx.font = '11px system-ui, sans-serif'
          const tagWidth = ctx.measureText(tagText).width
          const wordWidth = ctx.measureText(wordText).width
          const boxWidth = Math.max(titleWidth, tagWidth, wordWidth) + 24
          const boxHeight = 64

          // Tooltip background
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
          ctx.strokeStyle = node.color + '60'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 8)
          ctx.fill()
          ctx.stroke()

          // Tooltip text
          ctx.fillStyle = '#f1f5f9'
          ctx.font = 'bold 13px system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(node.title, tooltipX + 12, tooltipY + 20)

          ctx.fillStyle = node.color
          ctx.font = '11px system-ui, sans-serif'
          ctx.fillText(tagText, tooltipX + 12, tooltipY + 38)

          ctx.fillStyle = '#64748b'
          ctx.fillText(wordText, tooltipX + 12, tooltipY + 54)
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

  // ── Mouse interactions ────────────────────────────────────────────────
  const getMousePos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
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
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) return n
    }
    return null
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panRef.current = { startX: e.clientX, startY: e.clientY, ...transformRef.current }
      return
    }
    const pos = getMousePos(e)
    const node = findNodeAt(pos)
    if (node) {
      dragRef.current = { id: node.id, offsetX: node.x - pos.x, offsetY: node.y - pos.y }
      dragMovedRef.current = false
    } else {
      // Pan on background drag
      panRef.current = { startX: e.clientX, startY: e.clientY, ...transformRef.current }
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
      dragMovedRef.current = true
      const node = graphRef.current.nodes.find(n => n.id === dragRef.current.id)
      if (node) {
        node.x = pos.x + dragRef.current.offsetX
        node.y = pos.y + dragRef.current.offsetY
        node.vx = 0
        node.vy = 0
        tempRef.current = Math.max(tempRef.current, 0.3)
      }
      return
    }

    const node = findNodeAt(pos)
    const newHover = node ? node.id : null
    if (hoverRef.current !== newHover) {
      hoverRef.current = newHover
      canvasRef.current.style.cursor = newHover ? 'pointer' : 'grab'
    }
  }, [getMousePos, findNodeAt])

  const handleMouseUp = useCallback((e) => {
    if (panRef.current) {
      panRef.current = null
      canvasRef.current.style.cursor = 'grab'
      return
    }

    if (dragRef.current) {
      const didMove = dragMovedRef.current
      const nodeId = dragRef.current.id
      dragRef.current = null

      // If didn't drag far, treat as click — open popup
      if (!didMove) {
        const note = notes.find(n => n.filename === nodeId)
        if (note) setPopupNote(note)
      }
      return
    }
  }, [notes])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const scaleChange = e.deltaY > 0 ? 0.9 : 1.1
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const { scale, offsetX, offsetY } = transformRef.current
    const newScale = Math.max(0.1, Math.min(5, scale * scaleChange))

    transformRef.current = {
      scale: newScale,
      offsetX: mouseX - (mouseX - offsetX) * (newScale / scale),
      offsetY: mouseY - (mouseY - offsetY) * (newScale / scale)
    }
  }, [])

  const handleResetLayout = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.parentElement.clientWidth
    const h = canvas.parentElement.clientHeight
    const { nodes } = graphRef.current
    const n = nodes.length
    const radius = Math.min(w, h) * 0.35
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n + (Math.random() - 0.5) * 0.5
      const r = radius * (0.5 + Math.random() * 0.5)
      nodes[i].x = w / 2 + Math.cos(angle) * r
      nodes[i].y = h / 2 + Math.sin(angle) * r
      nodes[i].vx = 0
      nodes[i].vy = 0
    }
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 }
    tempRef.current = INITIAL_TEMP
    forceUpdate(n => n + 1)
  }

  const handleOpenEditor = () => {
    if (popupNote) {
      setActiveNote(popupNote.filename)
      setActiveView('editor')
      setPopupNote(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4 bg-gray-900/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-200">Brain Map</h2>
          <p className="text-xs text-gray-500 mt-1">
            {notes.length} notes &middot; {graphRef.current.edges?.length || 0} connections &middot; Click node to preview &middot; Drag to move &middot; Scroll to zoom
          </p>
        </div>
        <button
          onClick={handleResetLayout}
          className="text-xs bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-700 hover:text-gray-200 border border-gray-700"
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
          className="absolute inset-0 cursor-grab"
        />
        <GraphLegend allTags={allTags} />
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
            <div className="text-center">
              <div className="text-4xl mb-4">🕸️</div>
              <p>Create some notes to see the graph</p>
            </div>
          </div>
        )}
        {popupNote && (
          <NotePopup note={popupNote} onClose={() => setPopupNote(null)} onOpenEditor={handleOpenEditor} />
        )}
      </div>
    </div>
  )
}
