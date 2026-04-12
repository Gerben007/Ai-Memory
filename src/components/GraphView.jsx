import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'
import { renderMarkdown } from '../lib/markdownParser'

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
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash)
}

function getTagColor(tag) {
  if (!tag) return '#64748b'
  return TAG_PALETTE[hashCode(tag) % TAG_PALETTE.length]
}

function getTags(note) {
  if (note.frontmatter?.tags && Array.isArray(note.frontmatter.tags) && note.frontmatter.tags.length > 0) return note.frontmatter.tags
  const raw = note.content || ''
  const m = raw.match(/^tags:\s*\[([^\]]*)\]/m)
  if (m) return m[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  return []
}

function getTitle(note) {
  if (note.frontmatter?.title) return note.frontmatter.title
  const raw = note.content || ''
  const m = raw.match(/^title:\s*"?([^"\n]+)"?/m)
  if (m) return m[1].trim()
  return note.filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

function buildGraphData(notes) {
  const nodes = notes.map(note => {
    const wordCount = (note.body || note.content || '').split(/\s+/).filter(Boolean).length
    const tags = getTags(note)
    return {
      id: note.filename, title: getTitle(note), tags, primaryTag: tags[0] || null, wordCount,
      radius: Math.max(10, Math.min(32, Math.sqrt(wordCount) * 0.8 + 4)),
      color: getTagColor(tags[0]), x: 0, y: 0, vx: 0, vy: 0
    }
  })

  const edges = []
  const wikilinkSet = new Set()

  for (const note of notes) {
    const body = note.body || note.content || ''
    for (const link of extractWikilinks(body)) {
      const target = notes.find(n => {
        const t = getTitle(n).toLowerCase(), name = n.filename.replace(/\.md$/, '').toLowerCase()
        return t === link.target.toLowerCase() || name === link.target.toLowerCase()
      })
      if (target) {
        const key = [note.filename, target.filename].sort().join('::')
        if (!wikilinkSet.has(key)) { wikilinkSet.add(key); edges.push({ source: note.filename, target: target.filename, type: 'wikilink' }) }
      }
    }
  }

  const tagEdgeSet = new Set()
  for (let i = 0; i < notes.length; i++) {
    const tagsA = new Set(getTags(notes[i]))
    if (tagsA.size === 0) continue
    for (let j = i + 1; j < notes.length; j++) {
      const shared = getTags(notes[j]).filter(t => tagsA.has(t))
      if (shared.length > 0) {
        const key = [notes[i].filename, notes[j].filename].sort().join('::tag')
        if (!tagEdgeSet.has(key)) { tagEdgeSet.add(key); edges.push({ source: notes[i].filename, target: notes[j].filename, type: 'tag', weight: shared.length, sharedTags: shared }) }
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
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-[700px] max-h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 md:p-5 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-gray-100 truncate">{title}</h2>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(tag => (<span key={tag} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: getTagColor(tag) + '30', color: getTagColor(tag) }}>{tag}</span>))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button onClick={onOpenEditor} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-1">&times;</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="border-t border-gray-800 px-4 py-2 text-[10px] text-gray-500 flex justify-between">
          <span>{note.filename}</span>
          <span>{(note.body || note.content || '').split(/\s+/).filter(Boolean).length} words</span>
        </div>
      </div>
    </div>
  )
}

// ── Legend with search + tag highlight ───────────────────────────────────
function GraphLegend({ allTags, selectedTag, onSelectTag }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)

  if (allTags.length === 0) return null

  const filtered = search.trim()
    ? allTags.filter(t => t.toLowerCase().includes(search.toLowerCase()))
    : allTags

  const VISIBLE_COUNT = 5
  const visible = expanded ? filtered : filtered.slice(0, VISIBLE_COUNT)
  const hasMore = filtered.length > VISIBLE_COUNT

  return (
    <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 bg-gray-900/95 border border-gray-800 rounded-xl backdrop-blur-sm z-10 w-52 md:w-56 overflow-hidden text-xs">
      {/* Search */}
      <div className="p-2 border-b border-gray-800">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setExpanded(true) }}
          placeholder="Search tags..."
          className="w-full bg-gray-800 text-gray-200 text-[11px] rounded px-2 py-1 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
        />
      </div>

      {/* Tag list */}
      <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
        {visible.length === 0 && (
          <div className="text-gray-500 text-[10px] text-center py-1">No matching tags</div>
        )}
        {visible.map(tag => {
          const isActive = selectedTag === tag
          return (
            <button
              key={tag}
              onClick={() => onSelectTag(isActive ? null : tag)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${
                isActive ? 'bg-gray-800 ring-1 ring-inset' : 'hover:bg-gray-800/60'
              }`}
              style={isActive ? { ringColor: getTagColor(tag) } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getTagColor(tag) }} />
              <span className="truncate" style={{ color: isActive ? getTagColor(tag) : '#94a3b8' }}>{tag}</span>
            </button>
          )
        })}

        {/* Show more / less */}
        {hasMore && !expanded && (
          <button onClick={() => setExpanded(true)} className="w-full text-center text-[10px] text-indigo-400 hover:text-indigo-300 py-1">
            +{filtered.length - VISIBLE_COUNT} more
          </button>
        )}
        {expanded && filtered.length > VISIBLE_COUNT && (
          <button onClick={() => setExpanded(false)} className="w-full text-center text-[10px] text-gray-500 hover:text-gray-300 py-1">
            Show less
          </button>
        )}
      </div>

      {/* Edge legend */}
      <div className="px-2 pb-2 pt-1 border-t border-gray-800 space-y-1 text-[10px] text-gray-500">
        <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" /> Wikilink</div>
        <div className="flex items-center gap-2"><span className="w-4 h-0 inline-block border-t border-dashed border-pink-400" /> Shared tag</div>
        {selectedTag && (
          <button onClick={() => onSelectTag(null)} className="text-indigo-400 hover:text-indigo-300 mt-1">Clear filter</button>
        )}
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

  const graphRef = useRef({ nodes: [], edges: [], allTags: [] })
  const animRef = useRef(null)
  const tempRef = useRef(INITIAL_TEMP)
  const dragRef = useRef(null)
  const hoverRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef(null)
  const dragMovedRef = useRef(false)
  const selectedTagRef = useRef(null)

  const [popupNote, setPopupNote] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [selectedTag, setSelectedTag] = useState(null)
  const [, forceUpdate] = useState(0)

  // Keep ref in sync
  useEffect(() => { selectedTagRef.current = selectedTag }, [selectedTag])

  // Build graph
  useEffect(() => {
    const data = buildGraphData(notes)
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight
    const n = data.nodes.length
    const maxR = Math.min(w, h) * 0.42
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n, r = maxR * (0.4 + Math.random() * 0.6)
      data.nodes[i].x = w / 2 + Math.cos(a) * r
      data.nodes[i].y = h / 2 + Math.sin(a) * r
    }
    graphRef.current = data
    setAllTags(data.allTags)
    tempRef.current = INITIAL_TEMP
  }, [notes])

  // Simulation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let running = true

    function resize() {
      const p = canvas.parentElement, dpr = window.devicePixelRatio || 1
      canvas.width = p.clientWidth * dpr; canvas.height = p.clientHeight * dpr
      canvas.style.width = p.clientWidth + 'px'; canvas.style.height = p.clientHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(canvas.parentElement)

    function tick() {
      if (!running) return
      const { nodes, edges } = graphRef.current
      const w = canvas.clientWidth, h = canvas.clientHeight, temp = tempRef.current
      const nMap = new Map(); for (const n of nodes) nMap.set(n.id, n)

      if (nodes.length > 0 && temp > MIN_TEMP) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = b.x - a.x, dy = b.y - a.y
            const dSq = dx * dx + dy * dy || 1, d = Math.sqrt(dSq)
            const f = REPULSION / dSq * temp
            const fx = f * dx / d, fy = f * dy / d
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
          }
        }
        for (const e of edges) {
          const s = nMap.get(e.source), t = nMap.get(e.target)
          if (!s || !t) continue
          const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (d - IDEAL_LENGTH) * SPRING_STRENGTH * temp
          s.vx += f * dx / d; s.vy += f * dy / d; t.vx -= f * dx / d; t.vy -= f * dy / d
        }
        const cx = w / 2, cy = h / 2
        for (const n of nodes) { n.vx += (cx - n.x) * GRAVITY; n.vy += (cy - n.y) * GRAVITY }
        for (const n of nodes) {
          if (dragRef.current?.id === n.id) continue
          n.vx *= DAMPING; n.vy *= DAMPING; n.x += n.vx; n.y += n.vy
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
      const filterTag = selectedTagRef.current

      // Which nodes match the selected tag?
      const matchesFilter = (node) => !filterTag || node.tags.includes(filterTag)

      // Edges
      for (const edge of edges) {
        const s = nMap.get(edge.source), t = nMap.get(edge.target)
        if (!s || !t) continue

        const isHl = hoverId === s.id || hoverId === t.id
        const edgeMatchesFilter = !filterTag || (edge.sharedTags && edge.sharedTags.includes(filterTag))
        const dimmed = filterTag && !edgeMatchesFilter && !isHl

        if (edge.type === 'wikilink') {
          ctx.strokeStyle = dimmed ? '#1e293b' : (isHl ? '#818cf8' : '#4f46e5')
          ctx.lineWidth = isHl ? 3 : 2
          ctx.globalAlpha = dimmed ? 0.15 : (isHl ? 0.9 : 0.5)
          ctx.setLineDash([])
        } else {
          const tc = edge.sharedTags ? getTagColor(edge.sharedTags[0]) : '#94a3b8'
          ctx.strokeStyle = dimmed ? '#1e293b' : (isHl ? tc : tc)
          ctx.lineWidth = isHl ? 2.5 : 1.5
          ctx.globalAlpha = dimmed ? 0.1 : (isHl ? 0.8 : (edgeMatchesFilter && filterTag ? 0.7 : 0.3))
          ctx.setLineDash([6, 4])
        }
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke()
        ctx.setLineDash([]); ctx.globalAlpha = 1

        // Tag label on hover
        if (isHl && edge.type === 'tag' && edge.sharedTags) {
          const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, label = edge.sharedTags.join(', ')
          ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'
          const tw = ctx.measureText(label).width + 8
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.beginPath(); ctx.roundRect(mx - tw / 2, my - 8, tw, 16, 4); ctx.fill()
          ctx.fillStyle = getTagColor(edge.sharedTags[0]); ctx.fillText(label, mx, my + 3)
        }
      }

      // Nodes
      for (const node of nodes) {
        const isHovered = hoverId === node.id
        const matches = matchesFilter(node)
        const dimmed = filterTag && !matches && !isHovered

        const r = isHovered ? node.radius * 1.15 : node.radius
        const grad = ctx.createRadialGradient(node.x - r * 0.25, node.y - r * 0.25, r * 0.1, node.x, node.y, r)

        if (dimmed) {
          grad.addColorStop(0, '#334155'); grad.addColorStop(1, '#1e293b')
        } else {
          if (isHovered) { ctx.shadowColor = node.color; ctx.shadowBlur = 25 }
          grad.addColorStop(0, node.color); grad.addColorStop(1, node.color + '88')
        }

        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = dimmed ? '#1e293b' : (isHovered ? '#ffffff' : node.color + '40')
        ctx.lineWidth = isHovered ? 2 : 1; ctx.stroke()
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0

        // Label — hover OR matching filter
        if (isHovered || (filterTag && matches)) {
          ctx.fillStyle = isHovered ? '#f1f5f9' : '#94a3b8'
          ctx.font = `${isHovered ? 'bold ' : ''}${isHovered ? 13 : 11}px system-ui, sans-serif`
          ctx.textAlign = 'center'; ctx.fillText(node.title, node.x, node.y + r + 16)
        }
      }

      // Tooltip
      if (hoverId) {
        const node = nMap.get(hoverId)
        if (node) {
          const tx = node.x + node.radius + 14, ty = node.y - 30
          const tagText = node.tags.length > 0 ? node.tags.join(', ') : 'untagged'
          const wordText = `${node.wordCount} words`
          ctx.font = 'bold 13px system-ui, sans-serif'
          const tw = ctx.measureText(node.title).width
          ctx.font = '11px system-ui, sans-serif'
          const boxW = Math.max(tw, ctx.measureText(tagText).width, ctx.measureText(wordText).width) + 28
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'; ctx.strokeStyle = node.color + '50'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.roundRect(tx, ty, boxW, 64, 8); ctx.fill(); ctx.stroke()
          ctx.textAlign = 'left'; ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 13px system-ui, sans-serif'
          ctx.fillText(node.title, tx + 14, ty + 20)
          ctx.fillStyle = node.color; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(tagText, tx + 14, ty + 38)
          ctx.fillStyle = '#64748b'; ctx.fillText(wordText, tx + 14, ty + 54)
        }
      }

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { running = false; obs.disconnect(); if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [notes])

  // ── Mouse + Touch ─────────────────────────────────────────────────────
  const getPos = useCallback((clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const { scale, offsetX, offsetY } = transformRef.current
    return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale }
  }, [])

  const findNode = useCallback((pos) => {
    const { nodes } = graphRef.current
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i], dx = pos.x - n.x, dy = pos.y - n.y
      if (dx * dx + dy * dy <= (n.radius + 10) * (n.radius + 10)) return n
    }
    return null
  }, [])

  // Mouse events
  const handleMouseDown = useCallback((e) => {
    const pos = getPos(e.clientX, e.clientY)
    const node = findNode(pos)
    if (node) { dragRef.current = { id: node.id, offsetX: node.x - pos.x, offsetY: node.y - pos.y }; dragMovedRef.current = false }
    else panRef.current = { startX: e.clientX, startY: e.clientY, ...transformRef.current }
  }, [getPos, findNode])

  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      transformRef.current = { ...transformRef.current, offsetX: panRef.current.offsetX + (e.clientX - panRef.current.startX), offsetY: panRef.current.offsetY + (e.clientY - panRef.current.startY) }
      return
    }
    const pos = getPos(e.clientX, e.clientY)
    if (dragRef.current) {
      dragMovedRef.current = true
      const node = graphRef.current.nodes.find(n => n.id === dragRef.current.id)
      if (node) { node.x = pos.x + dragRef.current.offsetX; node.y = pos.y + dragRef.current.offsetY; node.vx = 0; node.vy = 0; tempRef.current = Math.max(tempRef.current, 0.3) }
      return
    }
    const node = findNode(pos)
    const id = node ? node.id : null
    if (hoverRef.current !== id) { hoverRef.current = id; canvasRef.current.style.cursor = id ? 'pointer' : 'grab' }
  }, [getPos, findNode])

  const handleMouseUp = useCallback(() => {
    if (panRef.current) { panRef.current = null; return }
    if (dragRef.current) { const id = dragRef.current.id; const moved = dragMovedRef.current; dragRef.current = null; if (!moved) { const n = notes.find(n => n.filename === id); if (n) setPopupNote(n) } }
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

  // Touch events for mobile
  const touchRef = useRef({ startX: 0, startY: 0, startDist: 0, startScale: 1 })

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      const pos = getPos(t.clientX, t.clientY)
      const node = findNode(pos)
      if (node) { dragRef.current = { id: node.id, offsetX: node.x - pos.x, offsetY: node.y - pos.y }; dragMovedRef.current = false }
      else { touchRef.current = { startX: t.clientX, startY: t.clientY }; panRef.current = { startX: t.clientX, startY: t.clientY, ...transformRef.current } }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      touchRef.current.startDist = Math.sqrt(dx * dx + dy * dy)
      touchRef.current.startScale = transformRef.current.scale
    }
  }, [getPos, findNode])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = Math.max(0.2, Math.min(5, touchRef.current.startScale * (dist / (touchRef.current.startDist || 1))))
      transformRef.current = { ...transformRef.current, scale }
      return
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (dragRef.current) {
        dragMovedRef.current = true
        const pos = getPos(t.clientX, t.clientY)
        const node = graphRef.current.nodes.find(n => n.id === dragRef.current.id)
        if (node) { node.x = pos.x + dragRef.current.offsetX; node.y = pos.y + dragRef.current.offsetY; node.vx = 0; node.vy = 0; tempRef.current = Math.max(tempRef.current, 0.3) }
      } else if (panRef.current) {
        transformRef.current = { ...transformRef.current, offsetX: panRef.current.offsetX + (t.clientX - panRef.current.startX), offsetY: panRef.current.offsetY + (t.clientY - panRef.current.startY) }
      }
    }
  }, [getPos])

  const handleTouchEnd = useCallback((e) => {
    if (dragRef.current) {
      const id = dragRef.current.id; const moved = dragMovedRef.current; dragRef.current = null
      if (!moved) { const n = notes.find(n => n.filename === id); if (n) setPopupNote(n) }
    }
    panRef.current = null
  }, [notes])

  const handleReset = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight
    const { nodes } = graphRef.current; const n = nodes.length; const r = Math.min(w, h) * 0.42
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; const d = r * (0.4 + Math.random() * 0.6); nodes[i].x = w / 2 + Math.cos(a) * d; nodes[i].y = h / 2 + Math.sin(a) * d; nodes[i].vx = 0; nodes[i].vy = 0 }
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 }; tempRef.current = INITIAL_TEMP; forceUpdate(n => n + 1)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-4 py-2 md:px-5 md:py-3 bg-gray-900/50 flex items-center justify-between">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-gray-200">Brain Map</h2>
          <p className="text-[10px] md:text-[11px] text-gray-500">{notes.length} notes &middot; {graphRef.current.edges?.length || 0} connections</p>
        </div>
        <button onClick={handleReset} className="text-[11px] bg-gray-800 text-gray-400 px-3 py-1 rounded-lg hover:bg-gray-700 hover:text-gray-200 border border-gray-700">Reset</button>
      </div>
      <div className="flex-1 relative bg-gray-950 touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          className="absolute inset-0 cursor-grab"
        />
        <GraphLegend allTags={allTags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none"><p>Create some notes to see the graph</p></div>
        )}
        {popupNote && <NotePopup note={popupNote} onClose={() => setPopupNote(null)} onOpenEditor={() => { setActiveNote(popupNote.filename); setActiveView('editor'); setPopupNote(null) }} />}
      </div>
    </div>
  )
}
