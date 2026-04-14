import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { getAllTagsWithCounts, getTags, getTitle, getBody, getTagColor } from '../lib/tagUtils'

// ── Helpers ────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return 'unknown'
  const now = new Date()
  const then = new Date(dateStr)
  if (isNaN(then.getTime())) return 'unknown'
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`
}

function getWeekKey(date) {
  const d = new Date(date)
  // Start of the week (Monday)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function getDayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Extract date with regex fallback when gray-matter fails
function getNoteDate(note, field = 'created') {
  // Try frontmatter first
  const fm = note.frontmatter
  if (fm?.[field]) return new Date(fm[field])
  if (field === 'created' && fm?.updated) return new Date(fm.updated)
  if (field === 'updated' && fm?.created) return new Date(fm.created)
  // Regex fallback on raw content
  const raw = note.content || ''
  const m = raw.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  if (m) {
    const d = new Date(m[1].trim().replace(/^["']|["']$/g, ''))
    if (!isNaN(d.getTime())) return d
  }
  // Try any date field
  const any = raw.match(/^(?:created|updated|date):\s*(.+)$/m)
  if (any) {
    const d = new Date(any[1].trim().replace(/^["']|["']$/g, ''))
    if (!isNaN(d.getTime())) return d
  }
  return null
}

// ── Shared styles ──────────────────────────────────────────────────────

const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const bigNumberStyle = {
  fontSize: 32,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1.1,
}

// ── Component ──────────────────────────────────────────────────────────

export default function KnowledgePulse() {
  const notes = useStore(s => s.notes)

  // ── Basic stats ────────────────────────────────────────────────────

  const totalNotes = notes.length

  const totalWords = useMemo(() => {
    return notes.reduce((sum, note) => {
      const body = getBody(note)
      return sum + (body ? body.split(/\s+/).filter(Boolean).length : 0)
    }, 0)
  }, [notes])

  const tagCounts = useMemo(() => getAllTagsWithCounts(notes), [notes])

  const totalTags = tagCounts.size

  const avgTagsPerNote = useMemo(() => {
    if (notes.length === 0) return 0
    const total = notes.reduce((sum, note) => sum + getTags(note).length, 0)
    return (total / notes.length).toFixed(1)
  }, [notes])

  // ── Weekly activity (last 12 weeks) ────────────────────────────────

  const weeklyActivity = useMemo(() => {
    const now = new Date()
    const weeks = []
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - i * 7)
      weeks.push({ key: getWeekKey(weekStart), count: 0 })
    }

    for (const note of notes) {
      const d = getNoteDate(note, 'created')
      if (!d) continue
      const wk = getWeekKey(d)
      const match = weeks.find(w => w.key === wk)
      if (match) match.count++
    }

    return weeks
  }, [notes])

  // ── Top 10 tags ────────────────────────────────────────────────────

  const topTags = useMemo(() => {
    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  }, [tagCounts])

  const maxTagCount = topTags.length > 0 ? topTags[0][1] : 1

  // ── Recent activity (last 10 modified) ─────────────────────────────

  const recentNotes = useMemo(() => {
    return notes
      .map(n => ({ note: n, date: getNoteDate(n, 'updated') }))
      .filter(x => x.date)
      .sort((a, b) => b.date - a.date)
      .map(x => x.note)
      .slice(0, 10)
  }, [notes])

  // ── Knowledge streak ───────────────────────────────────────────────

  const streak = useMemo(() => {
    if (notes.length === 0) return 0

    const activeDays = new Set()
    for (const note of notes) {
      const c = getNoteDate(note, 'created')
      const u = getNoteDate(note, 'updated')
      if (c) activeDays.add(getDayKey(c))
      if (u) activeDays.add(getDayKey(u))
    }

    let count = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const check = new Date(today)
      check.setDate(check.getDate() - i)
      const key = getDayKey(check)
      if (activeDays.has(key)) {
        count++
      } else {
        // Allow starting from yesterday if today has no activity yet
        if (i === 0) continue
        break
      }
    }

    return count
  }, [notes])

  // ── Orphan notes ───────────────────────────────────────────────────

  const orphanCount = useMemo(() => {
    return notes.filter(note => {
      const tags = getTags(note)
      return tags.length === 0
    }).length
  }, [notes])

  // ── Sparkline SVG ──────────────────────────────────────────────────

  const sparklineSVG = useMemo(() => {
    const counts = weeklyActivity.map(w => w.count)
    const max = Math.max(...counts, 1)
    const width = 280
    const height = 60
    const padY = 4
    const step = width / (counts.length - 1 || 1)

    const points = counts.map((c, i) => {
      const x = i * step
      const y = height - padY - ((c / max) * (height - padY * 2))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    // Area fill path
    const firstX = 0
    const lastX = ((counts.length - 1) * step).toFixed(1)
    const areaPoints = `${firstX},${height} ${points} ${lastX},${height}`

    return { points, areaPoints, width, height }
  }, [weeklyActivity])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: 16,
        background: 'var(--bg-panel)',
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          Knowledge Pulse
        </h2>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 24,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Stat cards row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}>
            {[
              { label: 'Total Notes', value: totalNotes },
              { label: 'Total Words', value: totalWords.toLocaleString() },
              { label: 'Total Tags', value: totalTags },
              { label: 'Avg Tags/Note', value: avgTagsPerNote },
            ].map(stat => (
              <div key={stat.label} style={cardStyle}>
                <div style={labelStyle}>{stat.label}</div>
                <div style={{ ...bigNumberStyle, marginTop: 6 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Activity Sparkline */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>Weekly Activity</div>
            <svg
              width="100%"
              viewBox={`0 0 ${sparklineSVG.width} ${sparklineSVG.height}`}
              preserveAspectRatio="none"
              style={{ display: 'block' }}
            >
              <polygon
                points={sparklineSVG.areaPoints}
                fill="var(--accent-soft)"
              />
              <polyline
                points={sparklineSVG.points}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              fontSize: 10,
              color: 'var(--text-muted)',
            }}>
              <span>12 weeks ago</span>
              <span>This week</span>
            </div>
          </div>

          {/* Knowledge Streak + Orphan Alert side by side */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 24,
          }}>
            {/* Knowledge Streak */}
            <div style={{
              ...cardStyle,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}>
              <div style={labelStyle}>Knowledge Streak</div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
              }}>
                <span style={{ fontSize: 36 }} role="img" aria-label="flame">
                  {streak > 0 ? '\uD83D\uDD25' : '\u2744\uFE0F'}
                </span>
                <span style={{
                  fontSize: 48,
                  fontWeight: 800,
                  color: streak > 0 ? 'var(--amber)' : 'var(--text-muted)',
                  lineHeight: 1,
                }}>
                  {streak}
                </span>
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}>
                {streak === 0
                  ? 'No activity streak'
                  : streak === 1
                    ? 'consecutive day'
                    : 'consecutive days'}
              </div>
            </div>

            {/* Orphan Alert */}
            <div style={{
              ...cardStyle,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}>
              <div style={labelStyle}>Orphan Alert</div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
              }}>
                <span style={{ fontSize: 36 }} role="img" aria-label="warning">
                  {orphanCount > 0 ? '\u26A0\uFE0F' : '\u2705'}
                </span>
                <span style={{
                  fontSize: 48,
                  fontWeight: 800,
                  color: orphanCount > 0 ? 'var(--amber)' : 'var(--green)',
                  lineHeight: 1,
                }}>
                  {orphanCount}
                </span>
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}>
                {orphanCount === 0
                  ? 'All notes are tagged'
                  : orphanCount === 1
                    ? 'note with no tags'
                    : 'notes with no tags'}
              </div>
            </div>
          </div>

          {/* Most Active Tags */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 14 }}>Most Active Tags</div>
            {topTags.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tags yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topTags.map(([tag, count]) => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 90,
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      textAlign: 'right',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {tag}
                    </div>
                    <div style={{
                      flex: 1,
                      height: 20,
                      background: 'var(--bg-base)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.max((count / maxTagCount) * 100, 4)}%`,
                        height: '100%',
                        background: getTagColor(tag),
                        borderRadius: 6,
                        opacity: 0.8,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <div style={{
                      width: 28,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}>
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 14 }}>Recent Activity</div>
            {recentNotes.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recent activity</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentNotes.map(note => {
                  const title = getTitle(note)
                  const nd = getNoteDate(note, 'updated'); const time = nd ? nd.toISOString() : null
                  return (
                    <div key={note.filename} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 4px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginRight: 12,
                      }}>
                        {title}
                      </span>
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        {relativeTime(time)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
