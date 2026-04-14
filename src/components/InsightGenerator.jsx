import { useState, useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTitle, getTags, getAllTagsWithCounts, getBody } from '../lib/tagUtils'
import { chatCompletion } from '../lib/api'
import { renderMarkdown } from '../lib/markdownParser'

export default function InsightGenerator() {
  const notes = useStore(s => s.notes)
  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)

  const [loading, setLoading] = useState(false)
  const [insight, setInsight] = useState(null)
  const [error, setError] = useState(null)

  const vaultSummary = useMemo(() => {
    const tagCounts = getAllTagsWithCounts(notes)
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    const titles = notes.map(n => `- ${getTitle(n)} [${getTags(n).join(', ')}]`).join('\n')
    const totalWords = notes.reduce((sum, n) => sum + (getBody(n) || '').split(/\s+/).filter(Boolean).length, 0)

    return {
      noteCount: notes.length,
      tagCount: tagCounts.size,
      totalWords,
      topTags: topTags.map(([t, c]) => `${t} (${c})`).join(', '),
      titles
    }
  }, [notes])

  const generateInsight = async () => {
    if (!apiKey) {
      setError('Set your Claude API key in Settings first.')
      return
    }
    setLoading(true)
    setError(null)
    setInsight(null)

    try {
      const res = await chatCompletion({
        model,
        max_tokens: 1500,
        system: `You are a knowledge management advisor analyzing a personal knowledge vault. Be specific, reference actual note titles and tags. Write in concise bullet points with markdown formatting. Focus on actionable insights.`,
        messages: [{
          role: 'user',
          content: `Analyze my knowledge vault and give me insights:

**Stats**: ${vaultSummary.noteCount} notes, ${vaultSummary.tagCount} tags, ~${vaultSummary.totalWords.toLocaleString()} words

**Top tags**: ${vaultSummary.topTags}

**All notes**:
${vaultSummary.titles}

Please tell me:
1. **Knowledge clusters** — What topics am I focused on? Are there natural groupings?
2. **Gaps** — What areas seem underdeveloped given my interests?
3. **Connection opportunities** — Which notes should I link together that aren't currently linked?
4. **Tag suggestions** — Are there tags that should be merged, split, or created?
5. **One surprising observation** — Something I might not have noticed about my vault.`
        }]
      }, apiKey)

      const data = await res.json()
      const text = data.content?.[0]?.text || 'No response generated.'
      setInsight(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-5 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>AI Insights</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Pattern analysis across {vaultSummary.noteCount} notes
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!insight && !loading && !error && (
          <div className="max-w-md mx-auto text-center py-12">
            <svg className="mx-auto mb-4 opacity-30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--accent-hi)' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Discover patterns in your knowledge vault
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
              AI analyzes your note titles, tags, and structure to find clusters, gaps, and connection opportunities.
            </p>
            <button
              onClick={generateInsight}
              disabled={loading}
              className="btn-primary"
              style={{ padding: '10px 24px', fontSize: 13 }}
            >
              Generate Insights
            </button>
            {!apiKey && (
              <p className="text-xs mt-3" style={{ color: 'var(--amber)' }}>
                Requires Claude API key (set in Settings)
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="text-2xl mb-3 animate-pulse" style={{ color: 'var(--accent-hi)' }}>
              <svg className="mx-auto" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66Z"/>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.66Z"/>
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Analyzing your vault...</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>This takes 10-20 seconds</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto text-center py-8">
            <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>
            <button onClick={generateInsight} className="btn-secondary text-xs">Try Again</button>
          </div>
        )}

        {insight && (
          <div className="max-w-2xl mx-auto">
            <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(insight) }} />
            <div className="mt-6 flex gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button onClick={generateInsight} disabled={loading} className="btn-secondary text-xs">
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
