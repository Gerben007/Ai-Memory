import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '../lib/store'
import { extractWikilinks } from '../lib/wikilinkParser'
import TagPill from './TagPill'
import { renderMarkdown } from '../lib/markdownParser'
import { getTagColor, getTags } from '../lib/tagUtils'

// Physics constants are scaled by screen size in the simulation loop
const BASE_REPULSION = 12000
const BASE_SPRING_STRENGTH = 0.015
const BASE_IDEAL_LENGTH = 280
const GRAVITY = 0       // no center pull — nodes float freely
const DAMPING = 0.85
const INITIAL_TEMP = 1.0
const COOLING = 0.997
const MIN_TEMP = 0.01
const DRIFT = 0.03      // very gentle drift — barely perceptible floating

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0 }
  return Math.abs(hash)
}

function getTitle(note) {
  if (note.frontmatter?.title) return note.frontmatter.title
  const raw = note.content || ''
  const m = raw.match(/^title:\s*"?([^"\n]+)"?/m)
  if (m) return m[1].trim()
  return note.filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

// How many days ago was a note last edited? Returns 0..1 where 1 = now, 0 = 30+ days ago
function getRecency(note) {
  const updated = note.frontmatter?.updated || note.frontmatter?.created
  if (!updated) return 0
  const daysSince = (Date.now() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.min(1, 1 - daysSince / 30))
}

function buildGraphData(notes) {
  const nodes = notes.map(note => {
    const tags = getTags(note)
    const recency = getRecency(note)
    return {
      id: note.filename, title: getTitle(note), tags, primaryTag: tags[0] || null,
      connections: 0, // computed after edges are built
      recency,
      radius: 12, // placeholder, sized after connection count
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

  // Count connections per node and size by connection count
  const connCounts = new Map()
  for (const e of edges) {
    connCounts.set(e.source, (connCounts.get(e.source) || 0) + 1)
    connCounts.set(e.target, (connCounts.get(e.target) || 0) + 1)
  }
  for (const node of nodes) {
    node.connections = connCounts.get(node.id) || 0
    // Size: 8px for isolated nodes, scales up with connections, max 36px for hubs
    // Scale down as vault grows — log dampens growth for large connection counts
    node.radius = Math.max(5, Math.min(22, 5 + Math.log2(node.connections + 1) * 4))
  }

  // Count notes per tag, sorted by usage
  const tagCounts = new Map()
  notes.forEach(n => getTags(n).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)))
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }))
  return { nodes, edges, allTags }
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
                {tags.map(tag => (<TagPill key={tag} tag={tag} />))}
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

// ── Tag selector panel ──────────────────────────────────────────────────
function GraphLegend({ allTags, selectedTag, onSelectTag }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  if (allTags.length === 0) return null

  const filtered = search.trim()
    ? allTags.filter(t => t.tag.toLowerCase().includes(search.toLowerCase()))
    : allTags

  const maxCount = allTags.length > 0 ? allTags[0].count : 1
  const selectedInfo = selectedTag ? allTags.find(t => t.tag === selectedTag) : null

  // Mobile: collapsed toggle button. Desktop: always open panel.
  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden absolute bottom-3 left-3 z-10 bg-gray-900/95 border border-gray-800 rounded-xl backdrop-blur-sm px-3 py-2 flex items-center gap-2 text-xs"
        style={selectedTag ? { borderColor: getTagColor(selectedTag) + '50' } : undefined}
      >
        <span className="text-gray-400">🏷</span>
        {selectedTag ? (
          <span style={{ color: getTagColor(selectedTag) }}>{selectedTag}</span>
        ) : (
          <span className="text-gray-400">Tags</span>
        )}
        <span className="text-[10px] text-gray-600">{open ? '▼' : '▲'}</span>
      </button>

      {/* Panel — always visible on desktop, toggled on mobile */}
      <div className={`absolute z-20 bg-gray-900/95 border border-gray-800 rounded-xl backdrop-blur-sm overflow-hidden text-xs transition-all
        ${open ? 'bottom-14 left-3 right-3 max-h-[60vh]' : 'hidden'}
        md:block md:bottom-4 md:left-4 md:right-auto md:w-60 md:max-h-none
      `}>
        {/* Header */}
        <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Tags</span>
          <div className="flex items-center gap-2">
            {selectedTag && (
              <button
                onClick={() => onSelectTag(null)}
                className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="md:hidden text-gray-500 hover:text-gray-300 text-sm leading-none"
            >&times;</button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 pb-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter tags..."
            className="w-full bg-gray-800/80 text-gray-200 text-[11px] rounded-lg px-2.5 py-1.5 border border-gray-700/50 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
          />
        </div>

        {/* Tag list */}
        <div className="px-2 pb-2 space-y-0.5 max-h-48 md:max-h-56 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-gray-500 text-[10px] text-center py-2">No matching tags</div>
          )}
          {filtered.map(({ tag, count }) => {
            const isActive = selectedTag === tag
            const color = getTagColor(tag)
            const barWidth = Math.max(8, (count / maxCount) * 100)

            return (
              <button
                key={tag}
                onClick={() => { onSelectTag(isActive ? null : tag); if (window.innerWidth < 768) setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all relative overflow-hidden"
                style={{
                  backgroundColor: isActive ? color + '20' : 'transparent',
                  borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent'
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 opacity-[0.04] rounded-lg transition-all"
                  style={{ width: `${barWidth}%`, backgroundColor: color }}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 relative transition-transform"
                  style={{
                    backgroundColor: color,
                    transform: isActive ? 'scale(1.3)' : 'scale(1)',
                    boxShadow: isActive ? `0 0 8px ${color}60` : 'none'
                  }}
                />
                <span
                  className="truncate relative flex-1 transition-colors"
                  style={{ color: isActive ? color : '#94a3b8', fontWeight: isActive ? 600 : 400 }}
                >
                  {tag}
                </span>
                <span
                  className="text-[10px] relative shrink-0 tabular-nums"
                  style={{ color: isActive ? color + 'cc' : '#4b5563' }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Legend — desktop only */}
        <div className="hidden md:block px-3 pb-2 pt-1.5 border-t border-gray-800/80 space-y-1 text-[10px] text-gray-500">
          <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" /> Wikilink</div>
          <div className="flex items-center gap-2"><span className="w-4 h-0 inline-block border-t border-dashed border-pink-400" /> Shared tag</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-gray-400" /><span className="inline-block w-3 h-3 rounded-full bg-gray-400" /> Size = connections</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_6px_2px_rgba(129,140,248,0.5)]" /> Glow = recent</div>
        </div>
      </div>
    </>
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
    // Use the larger dimension — spread wider with more notes
    const maxR = Math.max(w, h) * (n > 50 ? 0.6 : 0.4)
    for (let i = 0; i < n; i++) {
      // Spread in an ellipse matching the screen aspect ratio
      const a = (2 * Math.PI * i) / n + (Math.random() - 0.5) * 0.3
      const r = maxR * (0.3 + Math.random() * 0.7)
      data.nodes[i].x = w / 2 + Math.cos(a) * r * (w / Math.max(w, h))
      data.nodes[i].y = h / 2 + Math.sin(a) * r * (h / Math.max(w, h))
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

      // Scale physics to screen size (reference: 1200px wide desktop)
      const screenScale = Math.min(w, h) / 1200
      const REPULSION = BASE_REPULSION * Math.max(0.3, screenScale)
      const SPRING_STRENGTH = BASE_SPRING_STRENGTH
      const IDEAL_LENGTH = BASE_IDEAL_LENGTH * Math.max(0.4, screenScale)

      if (nodes.length > 0) {
        // Physics forces only while settling (temp > MIN_TEMP)
        if (temp > MIN_TEMP) {
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
        }
        // Collision resolution — prevent overlapping (always active)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = b.x - a.x, dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const minDist = a.radius + b.radius + 6 // 6px gap
            if (dist < minDist) {
              const push = (minDist - dist) * 0.3 / dist
              const px = dx * push, py = dy * push
              a.vx -= px; a.vy -= py
              b.vx += px; b.vy += py
            }
          }
        }
        // Gentle drift — always active, keeps nodes subtly alive
        for (const n of nodes) {
          if (dragRef.current?.id === n.id) continue
          n.vx += (Math.random() - 0.5) * DRIFT
          n.vy += (Math.random() - 0.5) * DRIFT
          // Soft boundary
          const margin = 80, softness = 0.01
          if (n.x < margin)     n.vx += (margin - n.x) * softness
          if (n.x > w - margin) n.vx -= (n.x - (w - margin)) * softness
          if (n.y < margin)     n.vy += (margin - n.y) * softness
          if (n.y > h - margin) n.vy -= (n.y - (h - margin)) * softness
          n.vx *= DAMPING; n.vy *= DAMPING
          n.x += n.vx; n.y += n.vy
        }
        tempRef.current *= COOLING
      }

      // ── RENDER (futuristic) ─────────────────────────────────────────
      const { scale, offsetX, offsetY } = transformRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr)

      const vx0 = -offsetX / scale - 50, vy0 = -offsetY / scale - 50
      const vw = w / scale + 100, vh = h / scale + 100
      ctx.clearRect(vx0, vy0, vw, vh)

      const hoverId = hoverRef.current
      const filterTag = selectedTagRef.current
      const now = performance.now()
      const matchesFilter = (node) => !filterTag || node.tags.includes(filterTag)

      // ── Grid background ──
      const gridSpacing = 50
      ctx.strokeStyle = 'rgba(59,130,246,0.04)'
      ctx.lineWidth = 0.5
      const gx0 = Math.floor(vx0 / gridSpacing) * gridSpacing
      const gy0 = Math.floor(vy0 / gridSpacing) * gridSpacing
      for (let gx = gx0; gx < vx0 + vw; gx += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(gx, vy0); ctx.lineTo(gx, vy0 + vh); ctx.stroke()
      }
      for (let gy = gy0; gy < vy0 + vh; gy += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(vx0, gy); ctx.lineTo(vx0 + vw, gy); ctx.stroke()
      }
      // Grid intersections — bright dots
      ctx.fillStyle = 'rgba(59,130,246,0.08)'
      for (let gx = gx0; gx < vx0 + vw; gx += gridSpacing) {
        for (let gy = gy0; gy < vy0 + vh; gy += gridSpacing) {
          ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill()
        }
      }

      // ── Edges — curved with energy particles ──
      for (const edge of edges) {
        const s = nMap.get(edge.source), t = nMap.get(edge.target)
        if (!s || !t) continue

        const isHl = hoverId === s.id || hoverId === t.id
        const edgeMatchesFilter = !filterTag || (edge.sharedTags && edge.sharedTags.includes(filterTag))
        const dimmed = filterTag && !edgeMatchesFilter && !isHl

        const tc = edge.type === 'wikilink' ? '#60a5fa' : (edge.sharedTags ? getTagColor(edge.sharedTags[0]) : '#475569')

        // Curved edge (bezier with offset control point)
        const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
        const dx = t.x - s.x, dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const curveOffset = Math.min(dist * 0.15, 40)
        const cpx = mx + (-dy / dist) * curveOffset
        const cpy = my + (dx / dist) * curveOffset

        // Edge line
        ctx.globalAlpha = dimmed ? 0.06 : (isHl ? 0.8 : 0.25)
        ctx.strokeStyle = dimmed ? '#1e293b' : tc
        ctx.lineWidth = isHl ? 2.5 : (edge.type === 'wikilink' ? 1.5 : 1)
        ctx.setLineDash(edge.type === 'wikilink' ? [] : [4, 6])
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(cpx, cpy, t.x, t.y); ctx.stroke()
        ctx.setLineDash([])

        // Energy particles flowing along edge
        if (!dimmed && (isHl || edge.type === 'wikilink')) {
          const particleCount = isHl ? 3 : 1
          for (let p = 0; p < particleCount; p++) {
            const speed = 0.0004 + p * 0.00015
            const pt = ((now * speed + hashCode(edge.source + edge.target + p) * 0.1) % 1)
            // Quadratic bezier point
            const u = 1 - pt
            const px = u * u * s.x + 2 * u * pt * cpx + pt * pt * t.x
            const py = u * u * s.y + 2 * u * pt * cpy + pt * pt * t.y
            const pr = isHl ? 2.5 : 1.5
            const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr * 3)
            pGrad.addColorStop(0, tc + 'cc')
            pGrad.addColorStop(1, tc + '00')
            ctx.globalAlpha = isHl ? 0.9 : 0.5
            ctx.fillStyle = pGrad
            ctx.beginPath(); ctx.arc(px, py, pr * 3, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.globalAlpha = isHl ? 1 : 0.6
            ctx.beginPath(); ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2); ctx.fill()
          }
        }
        ctx.globalAlpha = 1

        // Tag label on hover
        if (isHl && edge.type === 'tag' && edge.sharedTags) {
          const label = edge.sharedTags.join(', ')
          ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'
          const tw = ctx.measureText(label).width + 12
          ctx.fillStyle = 'rgba(9,9,13,0.92)'; ctx.strokeStyle = tc + '40'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.roundRect(cpx - tw / 2, cpy - 9, tw, 18, 4); ctx.fill(); ctx.stroke()
          ctx.fillStyle = tc; ctx.fillText(label, cpx, cpy + 3)
        }
      }

      // ── Nodes — ring style with orbital halo ──
      for (const node of nodes) {
        const isHovered = hoverId === node.id
        const matches = matchesFilter(node)
        const dimmed = filterTag && !matches && !isHovered
        const r = isHovered ? node.radius * 1.2 : node.radius
        const recency = node.recency
        const phase = (hashCode(node.id) % 628) / 100
        const pulse = 0.5 + 0.5 * Math.sin(now / 1200 + phase)

        if (!dimmed) {
          // Outer glow field
          const glowR = r + 6 + (recency * 18) + (isHovered ? 10 : 0)
          const glowIntensity = recency * (0.3 + pulse * 0.4) + (isHovered ? 0.4 : 0)
          const gGrad = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR)
          gGrad.addColorStop(0, node.color + Math.round(glowIntensity * 50).toString(16).padStart(2, '0'))
          gGrad.addColorStop(0.6, node.color + Math.round(glowIntensity * 20).toString(16).padStart(2, '0'))
          gGrad.addColorStop(1, node.color + '00')
          ctx.fillStyle = gGrad
          ctx.beginPath(); ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2); ctx.fill()

          // Orbital ring for hub nodes
          if (node.connections >= 3 || isHovered) {
            const orbR = r + 5 + (isHovered ? 4 : 0)
            const orbAlpha = (0.15 + pulse * 0.15) * (isHovered ? 2 : 1)
            ctx.strokeStyle = node.color + Math.round(orbAlpha * 255).toString(16).padStart(2, '0')
            ctx.lineWidth = 0.8
            ctx.setLineDash([3, 8])
            ctx.beginPath(); ctx.arc(node.x, node.y, orbR, now / 2000 + phase, now / 2000 + phase + Math.PI * 1.5); ctx.stroke()
            ctx.setLineDash([])
          }
        }

        // Node core — dark center with bright ring
        const coreR = r * 0.65
        // Dark fill
        ctx.fillStyle = dimmed ? '#111827' : '#0c0f1a'
        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.fill()

        // Bright ring edge
        ctx.strokeStyle = dimmed ? '#1e293b' : node.color
        ctx.lineWidth = isHovered ? 2.5 : 1.5
        ctx.globalAlpha = dimmed ? 0.2 : (isHovered ? 1 : 0.7)
        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.stroke()
        ctx.globalAlpha = 1

        // Inner bright core
        if (!dimmed) {
          const cGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, coreR)
          const coreB = Math.round((0.4 + recency * 0.6) * 255).toString(16).padStart(2, '0')
          cGrad.addColorStop(0, node.color.slice(0, 7) + coreB)
          cGrad.addColorStop(1, node.color + '10')
          ctx.fillStyle = cGrad
          ctx.beginPath(); ctx.arc(node.x, node.y, coreR, 0, Math.PI * 2); ctx.fill()
        }

        // Label
        const isMobile = w < 768
        // Only show labels on hover or for top hubs (reduces clutter with many notes)
        const hubThreshold = nodes.length > 50 ? 15 : nodes.length > 20 ? 8 : 4
        const showLabel = isHovered || (filterTag && matches) || (!isMobile && node.connections >= hubThreshold)
        if (showLabel) {
          const labelY = node.y + r + 14
          // Label background
          ctx.font = `${isHovered ? '600 ' : ''}${isHovered ? 12 : 10}px "IBM Plex Sans", sans-serif`
          ctx.textAlign = 'center'
          const lw = ctx.measureText(node.title).width + 10
          ctx.fillStyle = 'rgba(9,9,13,0.85)'
          ctx.beginPath(); ctx.roundRect(node.x - lw / 2, labelY - 8, lw, 16, 3); ctx.fill()
          ctx.fillStyle = isHovered ? '#f1f5f9' : '#8b8fa8'
          ctx.fillText(node.title, node.x, labelY + 3)
        }
      }

      // ── HUD Tooltip ──
      if (hoverId) {
        const node = nMap.get(hoverId)
        if (node) {
          const tx = node.x + node.radius + 18, ty = node.y - 40
          const tagText = node.tags.length > 0 ? node.tags.join(' · ') : 'untagged'
          const connText = `${node.connections} link${node.connections !== 1 ? 's' : ''}`
          const recencyText = node.recency > 0.8 ? 'ACTIVE' : node.recency > 0.5 ? 'RECENT' : node.recency > 0.2 ? 'THIS MONTH' : 'DORMANT'

          ctx.font = '600 12px "IBM Plex Sans", sans-serif'
          const tw = ctx.measureText(node.title).width
          ctx.font = '10px "IBM Plex Mono", monospace'
          const boxW = Math.max(tw + 12, ctx.measureText(tagText).width + 12, 160) + 24
          const boxH = 72

          // HUD background with accent border
          ctx.fillStyle = 'rgba(9,9,13,0.94)'
          ctx.strokeStyle = node.color + '60'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.roundRect(tx, ty, boxW, boxH, 6); ctx.fill(); ctx.stroke()

          // Accent line at top
          ctx.fillStyle = node.color
          ctx.fillRect(tx + 1, ty + 1, boxW - 2, 2)

          // Title
          ctx.textAlign = 'left'
          ctx.fillStyle = '#f1f5f9'
          ctx.font = '600 12px "IBM Plex Sans", sans-serif'
          ctx.fillText(node.title, tx + 12, ty + 22)

          // Tags
          ctx.fillStyle = node.color
          ctx.font = '10px "IBM Plex Mono", monospace'
          ctx.fillText(tagText, tx + 12, ty + 40)

          // Stats line
          ctx.fillStyle = '#4a5568'
          ctx.fillText(`${connText}`, tx + 12, ty + 58)
          ctx.fillStyle = node.recency > 0.5 ? '#4ade80' : '#64748b'
          ctx.fillText(recencyText, tx + 12 + ctx.measureText(`${connText}   `).width, ty + 58)
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
    const { nodes } = graphRef.current; const n = nodes.length
    const maxR = Math.max(w, h) * 0.4
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n + (Math.random() - 0.5) * 0.3
      const r = maxR * (0.3 + Math.random() * 0.7)
      nodes[i].x = w / 2 + Math.cos(a) * r * (w / Math.max(w, h))
      nodes[i].y = h / 2 + Math.sin(a) * r * (h / Math.max(w, h))
      nodes[i].vx = 0; nodes[i].vy = 0
    }
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
