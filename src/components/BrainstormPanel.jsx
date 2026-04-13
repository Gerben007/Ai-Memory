import { useState, useRef, useEffect } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import { chatCompletion } from '../lib/api'
import SourceCitation from './SourceCitation'

const BRAINSTORM_MODES = [
  {
    key: 'connections',
    icon: '🔗',
    label: 'Find Connections',
    description: 'Discover hidden links between your notes',
    systemPrompt: (chunks) => `You are a creative thinking partner analyzing a personal knowledge vault.
Your job is to find surprising, non-obvious connections between different notes and ideas.
Look for patterns, shared themes, contradictions, and opportunities to combine ideas.

For each connection you find:
1. Name the two (or more) ideas being connected
2. Explain the connection clearly
3. Suggest what new insight or project could emerge from this connection

Be specific — reference actual content from the notes. Be creative but grounded.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  },
  {
    key: 'ideas',
    icon: '💡',
    label: 'Generate Ideas',
    description: 'Brainstorm new ideas from your existing knowledge',
    systemPrompt: (chunks) => `You are a creative brainstorming partner with access to the user's personal knowledge vault.
Generate 5-7 creative, actionable ideas based on the user's notes and interests.
Each idea should:
1. Build on something already in their vault
2. Be specific and actionable (not vague)
3. Include a concrete next step

Format each idea with a bold title and 2-3 sentences explaining it.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  },
  {
    key: 'gaps',
    icon: '🔍',
    label: 'Knowledge Gaps',
    description: 'Find what\'s missing from your understanding',
    systemPrompt: (chunks) => `You are a research advisor analyzing a personal knowledge vault.
Identify gaps, blind spots, and areas where the user's knowledge could be deeper.
For each gap:
1. What topic is underdeveloped
2. Why it matters given their other notes
3. 2-3 specific questions they should research
4. Suggest what kind of note they should create to fill this gap

Be constructive, not critical. Frame gaps as opportunities.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  },
  {
    key: 'challenge',
    icon: '⚡',
    label: 'Challenge My Thinking',
    description: 'Get your assumptions questioned',
    systemPrompt: (chunks) => `You are a thoughtful devil's advocate analyzing a personal knowledge vault.
Your job is to constructively challenge the user's ideas, assumptions, and conclusions.
For each challenge:
1. Quote or reference the specific assumption you're challenging
2. Explain why it might be wrong or incomplete
3. Offer an alternative perspective
4. Suggest what they could read or research to test this assumption

Be respectful but rigorous. The goal is stronger thinking, not criticism.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  },
  {
    key: 'digest',
    icon: '📊',
    label: 'Weekly Digest',
    description: 'Summarize recent themes and activity',
    systemPrompt: (chunks) => `You are an AI assistant creating a weekly digest of a personal knowledge vault.
Analyze all the notes and provide:

## Themes
Identify 3-5 major themes across the vault.

## Key Insights
What are the most important ideas captured?

## Connections
What notes relate to each other that might not be obviously linked?

## Open Questions
What questions remain unanswered based on the notes?

## Suggested Next Steps
What should the user focus on next based on their notes?

Be concise and actionable.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  },
  {
    key: 'freeform',
    icon: '✨',
    label: 'Free Brainstorm',
    description: 'Ask anything about your vault',
    systemPrompt: (chunks) => `You are a creative thinking partner with access to the user's personal knowledge vault.
Help them brainstorm, think through problems, and generate insights based on their notes.
Always reference specific notes when relevant. Be creative and proactive with suggestions.

=== VAULT CONTEXT ===
${chunks}
=== END CONTEXT ===`
  }
]

function buildContext(results) {
  return results.map(r => {
    const h = r.chunk.heading ? ` > ${r.chunk.heading}` : ''
    return `[${r.chunk.noteFilename}${h}]\n${r.chunk.text}`
  }).join('\n\n')
}

export default function BrainstormPanel() {
  const search = useStore(s => s.search)
  const apiKey = useStore(s => s.apiKey)
  const notes = useStore(s => s.notes)
  const setActiveView = useStore(s => s.setActiveView)
  const quickCapture = useStore(s => s.quickCapture)

  const [mode, setMode] = useState(null)
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [savedIdea, setSavedIdea] = useState('')
  const responseRef = useRef(null)

  useEffect(() => {
    if (responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight
  }, [response])

  const handleRun = async (selectedMode, userQuery) => {
    if (!apiKey) {
      setResponse('Please set your Claude API key in Settings first.')
      return
    }

    const modeConfig = BRAINSTORM_MODES.find(m => m.key === selectedMode)
    if (!modeConfig) return

    setLoading(true)
    setResponse('')
    setSources([])

    // Get broad context from vault
    const query = userQuery || modeConfig.label
    const results = search(query, 15)
    const context = buildContext(results)

    const srcList = results.map(r => ({
      filename: r.chunk.noteFilename,
      noteTitle: r.chunk.noteTitle,
      heading: r.chunk.heading,
      score: r.score
    }))
    setSources(srcList)

    const systemPrompt = modeConfig.systemPrompt(context)
    const userMessage = userQuery
      ? userQuery
      : selectedMode === 'digest'
        ? `Create a digest of my vault. I have ${notes.length} notes.`
        : selectedMode === 'connections'
          ? 'Find the most interesting hidden connections in my vault.'
          : selectedMode === 'ideas'
            ? 'Generate creative ideas based on everything in my vault.'
            : selectedMode === 'gaps'
              ? 'What knowledge gaps do you see in my vault?'
              : selectedMode === 'challenge'
                ? 'Challenge the key assumptions and ideas in my vault.'
                : 'Help me think.'

    // Try streaming first, fall back to non-streaming on error
    const callAPI = async (stream) => {
      const res = await chatCompletion({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream
      }, apiKey)
      return res
    }

    try {
      let res
      try {
        res = await callAPI(true)
      } catch (streamErr) {
        // If streaming fails (e.g. overloaded), retry without streaming
        console.warn('Streaming failed, retrying without stream:', streamErr.message)
        setResponse('API busy, retrying...')
        await new Promise(r => setTimeout(r, 2000))
        res = await callAPI(false)
      }

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('text/event-stream')) {
        // Streaming response
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let full = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  full += parsed.delta.text
                  setResponse(full)
                }
              } catch {}
            }
          }
        }
        if (full) setResponse(full)
        else setResponse('No response received. The API may be overloaded — try again in a moment.')
      } else {
        // Non-streaming JSON response
        const data = await res.json()
        const text = data.content?.[0]?.text || JSON.stringify(data)
        setResponse(text)
      }
    } catch (err) {
      setResponse(`**Error:** ${err.message}\n\nThe Anthropic API may be overloaded. Wait a moment and click **Regenerate** or **Go** to try again.`)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToVault = async () => {
    if (!response) return
    const snippet = response.slice(0, 80).replace(/[#*\n]/g, ' ').trim()
    await quickCapture(`[Brainstorm] ${snippet}...`)
    setSavedIdea('Saved to daily note!')
    setTimeout(() => setSavedIdea(''), 2000)
  }

  // Mode selection screen
  if (!mode) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50">
          <h2 className="text-base md:text-lg font-semibold text-gray-200">🧠 Brainstorm</h2>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">AI-powered thinking tools for your vault</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {BRAINSTORM_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); if (m.key !== 'freeform') handleRun(m.key) }}
                className="text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-indigo-500/50 hover:bg-gray-900/80 transition-colors group"
              >
                <div className="text-2xl mb-2">{m.icon}</div>
                <div className="text-sm font-medium text-gray-200 group-hover:text-indigo-400 transition-colors">{m.label}</div>
                <div className="text-[11px] text-gray-500 mt-1">{m.description}</div>
              </button>
            ))}
          </div>

          {/* Vault overview */}
          <div className="mt-6 max-w-2xl mx-auto bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-2">Your vault at a glance</div>
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-gray-500">Notes:</span> <span className="text-gray-200">{notes.length}</span></div>
              <div><span className="text-gray-500">Tags:</span> <span className="text-gray-200">{new Set(notes.flatMap(n => n.frontmatter?.tags || [])).size}</span></div>
              <div><span className="text-gray-500">Words:</span> <span className="text-gray-200">{notes.reduce((s, n) => s + (n.body || '').split(/\s+/).length, 0).toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Active brainstorm mode
  const currentMode = BRAINSTORM_MODES.find(m => m.key === mode)

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { setMode(null); setResponse(''); setSources([]) }} className="text-gray-400 hover:text-gray-200 text-sm shrink-0">&larr;</button>
          <div className="min-w-0">
            <h2 className="text-sm md:text-base font-semibold text-gray-200 truncate">{currentMode?.icon} {currentMode?.label}</h2>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {response && (
            <>
              <button onClick={handleSaveToVault} className="text-[11px] bg-amber-600 text-white px-3 py-1 rounded-lg hover:bg-amber-500">
                {savedIdea || 'Save to vault'}
              </button>
              <button onClick={() => handleRun(mode, input || undefined)} className="text-[11px] bg-gray-800 text-gray-300 px-3 py-1 rounded-lg hover:bg-gray-700 border border-gray-700">
                Regenerate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Response */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6" ref={responseRef}>
        {loading && !response && (
          <div className="text-center text-gray-500 mt-12">
            <div className="text-3xl mb-3 animate-pulse">🧠</div>
            <p className="text-sm">Analyzing your vault...</p>
          </div>
        )}
        {response && (
          <div className="max-w-2xl mx-auto">
            <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(response) }} />
            {sources.length > 0 && (
              <div className="mt-6">
                <SourceCitation sources={sources} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input for freeform / follow-up */}
      <div className="border-t border-gray-800 p-3 md:p-4 bg-gray-900/50">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleRun(mode, input)}
            placeholder={mode === 'freeform' ? 'What do you want to brainstorm about?' : 'Ask a follow-up question...'}
            className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-xl px-4 py-3 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
            disabled={loading}
          />
          <button
            onClick={() => handleRun(mode, input || undefined)}
            disabled={loading}
            className="bg-indigo-600 text-white px-5 py-3 rounded-xl hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium shrink-0"
          >
            {loading ? '...' : 'Go'}
          </button>
        </div>
      </div>
    </div>
  )
}
