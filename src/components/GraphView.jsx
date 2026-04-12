import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'
import { renderMarkdown } from '../lib/markdownParser'

// ── Physics — tuned for maximum spread ──────────────────────────────────
const REPULSION = 12000
const SPRING_STRENGTH = 0.015
const IDEAL_LENGTH = 280
const GRAVITY = 0.001
const DAMPING = 0.78
const INITIAL_TEMP = 1.0
const COOLING = 0.998
const MIN_TEMP = 0.003

const TAG_PALETTE = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635',
  '#e879f9', '#67e8f9', '#fca5a5', '#bef264'
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

function getTags(note) {
  // Try frontmatter tags first
  if (note.frontmatter?.tags && Array.isArray(note.frontmatter.tags) && note.frontmatter.tags.length > 0) {
    return note.frontmatter.tags
  }
  // Fallback: parse tags from raw content if frontmatter parsing missed them
  const raw = note.content || ''
  const tagMatch = raw.match(/^tags:\s*\[([^\]]*)\]/m)
  if (tagMatch) {
    return tagMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  return []
}

function getTitle(note) {
  if (note.frontmatter?.title) return note.frontmatter.title
  // Fallback: parse from raw content
  const raw = note.content || ''
  const titleMatch = raw.match(/^title:\s*"?([^"\n]+)"?/m)
  if (titleMatch) return titleMatch[1].trim()
  return note.filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

function buildGraphData(notes) {
  const nodes = notes.map(note => {
    const wordCount = (note.body || note.content || '').split(/\s+/).filter(Boolean).length
    const tags = getTags(note)
    const title = getTitle(note)
    return {
      id: note.filename,
      title,
      tags,
      primaryTag: tags[0] || null,
      wordCount,
      radius: Math.max(10, Math.min(32, Math.sqrt(wordCount) * 0.8 + 4)),
      color: getTagColor(tags[0]),
      x: 0, y: 0,
      vx: 0, vy: 0
    }
  })

  const edges = []
  const wikilinkSet = new Set()

  // Wikilink edges
  for (const note of notes) {
    const body = note.body || note.content || ''
    const links = extractWikilinks(body)
    for (const link of links) {
      const targetNote = notes.find(n => {
        const t = getTitle(n).toLowerCase()
        const name = n.filename.replace(/\.md$/, '').toLowerCase()
        return t === link.target.toLowerCase() || name === link.target.toLowerCase()
      })
      if (targetNote) {
        const key = [note.filename, targetNote.filename].sort().join('::')
        if (!wikilinkSet.has(key)) {
          wikilinkSet.add(key)
          edges.push({ source: note.filename, target: targetNote.filename, type: 'wikilink' })
        }
      }
    }
  }

  // Shared tag edges — ALWAYS add, even if wikilink exists
  const tagEdgeSet = new Set()
  for (let i = 0; i < notes.length; i++) {
    const tagsA = new Set(getTags(notes[i]))
    if (tagsA.size === 0) continue
    for (let j = i + 1; j < notes.length; j++) {
      const tagsB = getTags(notes[j])
      const shared = tagsB.filter(t => tagsA.has(t))
      if (shared.length > 0) {
        const key = [notes[i].filename, notes[j].filename].sort().join('::tag')
        if (!tagEdgeSet.has(key)) {
          tagEdgeSet.add(key)
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

  const allTags = new Set()
  notes.forEach(n => getTags(n).forEach(t => allTags.add(t)))

  return { nodes, edges, allTags: [...allTags] }
}

// ── Note Popup ──────────────────────────────────────────────────────────
function NotePopup({ note, onClose, onOpenEditor }) {
  if (!note) return null
  const title = getTitle(note)
  const tags = getTags(note)
  const html = renderMarkdown(note.body || note.content || '')

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[700px] max-w-[90%] max-h-[80%] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
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
            <button onClick={onOpenEditor} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-1">&times;</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="border-t border-gray-800 px-5 py-3 text-[10px] text-gray-500 flex justify-between">
          <span>{note.filename}</span>
          <span>{(note.body || note.content || '').split(/\s+/).filter(Boolean).length} words</span>
        </div>
      </div>
    </div>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────
function GraphLegend({ allTags }) {
  const [collapsed, setCollapsed] = useState(false)
  if (allTags.length === 0) return null

  return (
    <div className="absolute bottom-4 left-4 bg-gray-900/95 border border-gray-800 rounded-xl backdrop-blur-sm z-10 max-w-[240px] overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)} className="w-full text-left px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider hover:text-gray-200 flex justify-between items-center">
        <span>Legend</span>
        <span>{collapsed ? '+' : '-'}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allTags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: getTagColor(tag) + '20', color: getTagColor(tag) }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: getTagColor(tag) }} />
                {tag}
              </span>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-2 text-[10px] text-gray-500 space-y-1">
            <div className="flex items-center gap-2"><span className="w-5 h-0.5 bg-indigo-500 inline-block rounded" /> Wikilink</div>
            <div className="flex items-center gap-2"><span className="w-5 h-0.5 inline-block rounded border-t border-dashed border-pink-400" /> Shared tag</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────
export default function GraphView() {
  const canvasRef = useRef(null)
  const notes = useStore(s => s.notes)
  const setActiveNote = useStore(s => s.setActiveNote)
  const setActiveView = useStore(s => s.setActiveView)

  const graphRef = useRef({ nodes: [], edges: [], allTags: [] })
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

  // Build graph data
  useEffect(() => {
    const data = buildGraphData(notes)
    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.parentElement.clientWidth
    const h = canvas.parentElement.clientHeight
    const n = data.nodes.length

    // Circular initial spread — much wider
    const maxRadius = Math.min(w, h) * 0.42
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n
      const r = maxRadius * (0.4 + Math.random() * 0.6)
      data.nodes[i].x = w / 2 + Math.cos(angle) * r
      data.nodes[i].y = h / 2 + Math.sin(angle) * r
    }

    graphRef.current = data
    setAllTags(data.allTags)
    tempRef.current = INITIAL_TEMP
  }, [notes])

  // Simulation loop
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

    function tick() {
      if (!running) return
      const { nodes, edges } = graphRef.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const temp = tempRef.current

      // Build lookup
      const nMap = new Map()
      for (const n of nodes) nMap.set(n.id, n)

      if (nodes.length > 0 && temp > MIN_TEMP) {
        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const distSq = dx * dx + dy * dy || 1
            const dist = Math.sqrt(distSq)
            const f = REPULSION / distSq * temp
            const fx = f * dx / dist
            const fy = f * dy / dist
            a.vx -= fx; a.vy -= fy
            b.vx += fx; b.vy += fy
          }
        }

        // Attraction on edges
        for (const e of edges) {
          const s = nMap.get(e.source)
          const t = nMap.get(e.target)
          if (!s || !t) continue
          const dx = t.x - s.x
          const dy = t.y - s.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (dist - IDEAL_LENGTH) * SPRING_STRENGTH * temp
          const fx = f * dx / dist
          const fy = f * dy / dist
          s.vx += fx; s.vy += fy
          t.vx -= fx; t.vy -= fy
        }

        // Gravity
        const cx = w / 2, cy = h / 2
        for (const n of nodes) {
          n.vx += (cx - n.x) * GRAVITY
          n.vy += (cy - n.y) * GRAVITY
        }

        // Integrate
        for (const n of nodes) {
          if (dragRef.current?.id === n.id) continue
          n.vx *= DAMPING; n.vy *= DAMPING
          n.x += n.vx; n.y += n.vy
          // Soft bounds
          const p = 60
          if (n.x < p) { n.x = p; n.vx *= -0.5 }
          if (n.x > w - p) { n.x = w - p; n.vx *= -0.5 }
          if (n.y < p) { n.y = p; n.vy *= -0.5 }
          if (n.y > h - p) { n.y = h - p; n.vy *= -0.5 }
        }
        tempRef.current *= COOLING
      }

      // ── RENDER ──────────────────────────────────────────────────────
      const { scale, offsetX, offsetY } = transformRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)
      ctx.clearRect(-offsetX / scale - 50, -offsetY / scale - 50, w / scale + 100, h / scale + 100)

      const hoverId = hoverRef.current

      // ── Draw edges ────────────────────────────────────────────────
      for (const edge of edges) {
        const s = nMap.get(edge.source)
        const t = nMap.get(edge.target)
        if (!s || !t) continue

        const isHighlighted = hoverId === s.id || hoverId === t.id

        if (edge.type === 'wikilink') {
          ctx.strokeStyle = isHighlighted ? '#818cf8' : '#4f46e5'
          ctx.lineWidth = isHighlighted ? 3 : 2
          ctx.globalAlpha = isHighlighted ? 0.9 : 0.5
          ctx.setLineDash([])
        } else {
          const tagColor = edge.sharedTags ? getTagColor(edge.sharedTags[0]) : '#94a3b8'
          ctx.strokeStyle = isHighlighted ? tagColor : tagColor
          ctx.lineWidth = isHighlighted ? 2.5 : 1.5
          ctx.globalAlpha = isHighlighted ? 0.8 : 0.3
          ctx.setLineDash([6, 4])
        }

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1

        // Tag label at midpoint — only when hovered
        if (isHighlighted && edge.type === 'tag' && edge.sharedTags) {
          const mx = (s.x + t.x) / 2
          const my = (s.y + t.y) / 2
          const label = edge.sharedTags.join(', ')
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          const tw = ctx.measureText(label).width + 8
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
          ctx.beginPath()
          ctx.roundRect(mx - tw / 2, my - 8, tw, 16, 4)
          ctx.fill()
          ctx.fillStyle = getTagColor(edge.sharedTags[0])
          ctx.fillText(label, mx, my + 3)
        }
      }

      // ── Draw nodes ────────────────────────────────────────────────
      for (const node of nodes) {
        const isHovered = hoverId === node.id

        // Glow
        if (isHovered) {
          ctx.shadowColor = node.color
          ctx.shadowBlur = 25
        }

        // Circle
        const r = isHovered ? node.radius * 1.15 : node.radius
        const grad = ctx.createRadialGradient(
          node.x - r * 0.25, node.y - r * 0.25, r * 0.1,
          node.x, node.y, r
        )
        grad.addColorStop(0, node.color)
        grad.addColorStop(1, node.color + '88')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fill()

        // Border
        ctx.strokeStyle = isHovered ? '#ffffff' : node.color + '40'
        ctx.lineWidth = isHovered ? 2 : 1
        ctx.stroke()

        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0

        // LABEL — only on hover
        if (isHovered) {
          ctx.fillStyle = '#f1f5f9'
          ctx.font = 'bold 13px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(node.title, node.x, node.y + r + 18)
        }
      }

      // ── Tooltip ───────────────────────────────────────────────────
      if (hoverId) {
        const node = nMap.get(hoverId)
        if (node) {
          const tx = node.x + node.radius + 14
          const ty = node.y - 30

          const tagText = node.tags.length > 0 ? node.tags.join(', ') : 'untagged'
          const wordText = `${node.wordCount} words`
          const clickText = 'Click to preview'

          ctx.font = 'bold 13px system-ui, sans-serif'
          const tw = ctx.measureText(node.title).width
          ctx.font = '11px system-ui, sans-serif'
          const tagW = ctx.measureText(tagText).width
          const wordW = ctx.measureText(wordText).width
          const clickW = ctx.measureText(clickText).width
          const boxW = Math.max(tw, tagW, wordW, clickW) + 28
          const boxH = 76

          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
          ctx.strokeStyle = node.color + '50'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(tx, ty, boxW, boxH, 8)
          ctx.fill()
          ctx.stroke()

          ctx.textAlign = 'left'
          ctx.fillStyle = '#f1f5f9'
          ctx.font = 'bold 13px system-ui, sans-serif'
          ctx.fillText(node.title, tx + 14, ty + 20)

          ctx.fillStyle = node.color
          ctx.font = '11px system-ui, sans-serif'
          ctx.fillText(tagText, tx + 14, ty + 38)

          ctx.fillStyle = '#64748b'
          ctx.fillText(wordText, tx + 14, ty + 54)

          ctx.fillStyle = '#475569'
          ctx.font = 'italic 10px system-ui, sans-serif'
          ctx.fillText(clickText, tx + 14, ty + 68)
        }
      }

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { running = false; observer.disconnect(); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [notes])

  // ── Mouse ───────────────────────────────────────────────────────────
  const getMousePos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return { x: (e.clientX - rect.left - offsetX) / scale, y: (e.clientY - rect.top - offsetY) / scale }
  }, [])

  const findNodeAt = useCallback((pos) => {
    const { nodes } = graphRef.current
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = pos.x - n.x, dy = pos.y - n.y
      if (dx * dx + dy * dy <= (n.radius + 8) * (n.radius + 8)) return n
    }
    return null
  }, [])

  const handleMouseDown = useCallback((e) => {
    const pos = getMousePos(e)
    const node = findNodeAt(pos)
    if (node) {
      dragRef.current = { id: node.id, offsetX: node.x - pos.x, offsetY: node.y - pos.y }
      dragMovedRef.current = false
    } else {
      panRef.current = { startX: e.clientX, startY: e.clientY, ...transformRef.current }
    }
  }, [getMousePos, findNodeAt])

  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      transformRef.current = {
        ...transformRef.current,
        offsetX: panRef.current.offsetX + (e.clientX - panRef.current.startX),
        offsetY: panRef.current.offsetY + (e.clientY - panRef.current.startY)
      }
      return
    }
    const pos = getMousePos(e)
    if (dragRef.current) {
      dragMovedRef.current = true
      const node = graphRef.current.nodes.find(n => n.id === dragRef.current.id)
      if (node) { node.x = pos.x + dragRef.current.offsetX; node.y = pos.y + dragRef.current.offsetY; node.vx = 0; node.vy = 0; tempRef.current = Math.max(tempRef.current, 0.3) }
      return
    }
    const node = findNodeAt(pos)
    const id = node ? node.id : null
    if (hoverRef.current !== id) { hoverRef.current = id; canvasRef.current.style.cursor = id ? 'pointer' : 'grab' }
  }, [getMousePos, findNodeAt])

  const handleMouseUp = useCallback(() => {
    if (panRef.current) { panRef.current = null; return }
    if (dragRef.current) {
      const id = dragRef.current.id; const moved = dragMovedRef.current; dragRef.current = null
      if (!moved) { const note = notes.find(n => n.filename === id); if (note) setPopupNote(note) }
    }
  }, [notes])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const f = e.deltaY > 0 ? 0.9 : 1.1
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { scale, offsetX, offsetY } = transformRef.current
    const ns = Math.max(0.1, Math.min(5, scale * f))
    transformRef.current = { scale: ns, offsetX: mx - (mx - offsetX) * (ns / scale), offsetY: my - (my - offsetY) * (ns / scale) }
  }, [])

  const handleReset = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight
    const { nodes } = graphRef.current; const n = nodes.length; const r = Math.min(w, h) * 0.42
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; const d = r * (0.4 + Math.random() * 0.6); nodes[i].x = w / 2 + Math.cos(a) * d; nodes[i].y = h / 2 + Math.sin(a) * d; nodes[i].vx = 0; nodes[i].vy = 0 }
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 }; tempRef.current = INITIAL_TEMP; forceUpdate(n => n + 1)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-5 py-3 bg-gray-900/50 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Brain Map</h2>
          <p className="text-[11px] text-gray-500">{notes.length} notes &middot; {graphRef.current.edges?.length || 0} connections &middot; Hover for details &middot; Click to preview</p>
        </div>
        <button onClick={handleReset} className="text-xs bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-700 hover:text-gray-200 border border-gray-700">Reset</button>
      </div>
      <div className="flex-1 relative bg-gray-950">
        <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel} className="absolute inset-0 cursor-grab" />
        <GraphLegend allTags={allTags} />
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
            <p>Create some notes to see the graph</p>
          </div>
        )}
        {popupNote && <NotePopup note={popupNote} onClose={() => setPopupNote(null)} onOpenEditor={() => { setActiveNote(popupNote.filename); setActiveView('editor'); setPopupNote(null) }} />}
      </div>
    </div>
  )
}
