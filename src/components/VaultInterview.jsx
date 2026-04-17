import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../lib/store'
import { getTitle, getTags, getBody, getAllTagsWithCounts } from '../lib/tagUtils'
import { chatCompletion } from '../lib/api'
import { renderMarkdown } from '../lib/markdownParser'

export default function VaultInterview() {
  const notes = useStore(s => s.notes)
  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)
  const vaultContext = useStore(s => s.vaultContext)
  const generateContext = useStore(s => s.generateContext)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | interviewing | done
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Build vault summary for the AI
  const vaultSummary = useMemo(() => {
    const tagCounts = getAllTagsWithCounts(notes)
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
    const titles = notes.map(n => `- ${getTitle(n)} [${getTags(n).join(', ')}]`).join('\n')
    const totalWords = notes.reduce((sum, n) => sum + (getBody(n) || '').split(/\s+/).filter(Boolean).length, 0)
    return { noteCount: notes.length, tagCount: tagCounts.size, totalWords, topTags, titles }
  }, [notes])

  const systemPrompt = `You are a personal knowledge vault analyst. Your job is to interview the user to understand them deeply — their work, interests, projects, environment, goals, and thinking patterns.

You have access to their vault:
- ${vaultSummary.noteCount} notes, ${vaultSummary.tagCount} tags, ~${vaultSummary.totalWords.toLocaleString()} words
- Top tags: ${vaultSummary.topTags.map(([t, c]) => `${t}(${c})`).join(', ')}
- Notes: ${vaultSummary.titles}

${vaultContext ? `Current vault profile:\n${vaultContext}\n` : ''}

YOUR APPROACH:
1. Analyze the vault for GAPS — what's missing? What topics are mentioned but not well-covered?
2. Ask ONE focused question at a time — specific, not generic
3. After each answer, acknowledge what you learned and ask the next question
4. Focus on: their role/profession, key projects, decision-making context, who they work with, what problems they're trying to solve, their goals
5. After 5-8 questions, summarize what you've learned and offer to update the vault profile
6. Questions should be things the vault DOESN'T already answer

DO NOT ask generic questions like "tell me about yourself." Be specific based on what you see in the vault.
Format: Short questions, conversational tone. Use the person's actual note titles and tags to show you've analyzed their vault.`

  const startInterview = async () => {
    if (!apiKey) return
    setPhase('interviewing')
    setLoading(true)

    try {
      const res = await chatCompletion({
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Analyze my vault and start interviewing me. Identify the biggest gaps in your understanding and ask your first question.' }]
      }, apiKey)

      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      setMessages([
        { role: 'assistant', content: text }
      ])
    } catch (err) {
      setMessages([{ role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')

    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      // Build full message history for context
      const apiMessages = [
        { role: 'user', content: 'Analyze my vault and start interviewing me. Identify the biggest gaps in your understanding and ask your first question.' },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ]

      const res = await chatCompletion({
        model,
        max_tokens: 600,
        system: systemPrompt,
        messages: apiMessages
      }, apiKey)

      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      setMessages([...newMessages, { role: 'assistant', content: text }])
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const finishAndUpdate = async () => {
    setLoading(true)
    try {
      // Ask AI to synthesize everything into a vault profile update
      const apiMessages = [
        { role: 'user', content: 'Analyze my vault and start interviewing me.' },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: `Based on everything I've told you, plus what you know from my vault, generate an updated vault profile. Format it as a clean markdown document with sections: ## About Me, ## Key Projects, ## Professional Context, ## Interests & Expertise, ## Key People & Entities, ## Goals, ## Decision Context. Be specific — use actual names, projects, and details from our conversation.` }
      ]

      const res = await chatCompletion({
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: apiMessages
      }, apiKey)

      const data = await res.json()
      const newContext = data.content?.[0]?.text || ''

      // Save to server
      await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContext })
      })

      // Reload context in store
      await generateContext()

      setMessages([...messages, {
        role: 'assistant',
        content: `**Vault profile updated!** Here's what I saved:\n\n${newContext}`
      }])
      setPhase('done')
    } catch (err) {
      setMessages([...messages, { role: 'assistant', content: `Failed to update: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  // ── Idle state ──
  if (phase === 'idle') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-5 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Vault Interview</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            AI identifies gaps and asks questions to understand you better
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <svg className="mx-auto mb-4 opacity-30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--accent-hi)' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              The AI will analyze your {vaultSummary.noteCount} notes, find gaps in its understanding, and ask targeted questions.
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Your answers are used to build a richer vault profile — making AI Chat, Insights, and auto-tagging smarter.
            </p>
            {vaultContext && (
              <p className="text-[11px] mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Current profile: {vaultContext.slice(0, 120)}…
              </p>
            )}
            <button
              onClick={startInterview}
              disabled={!apiKey || loading}
              className="btn-primary"
              style={{ padding: '10px 24px', fontSize: 13 }}
            >
              {loading ? 'Analyzing vault…' : 'Start Interview'}
            </button>
            {!apiKey && (
              <p className="text-xs mt-3" style={{ color: 'var(--amber)' }}>Set Claude API key in Settings first</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Interview / Done ──
  const questionCount = messages.filter(m => m.role === 'assistant').length

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Vault Interview</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {phase === 'done' ? 'Profile updated' : `Question ${questionCount} — answer to help the AI understand you better`}
          </p>
        </div>
        <div className="flex gap-2">
          {phase === 'interviewing' && questionCount >= 3 && (
            <button
              onClick={finishAndUpdate}
              disabled={loading}
              className="btn-primary text-[11px]"
              style={{ padding: '6px 14px' }}
            >
              {loading ? 'Updating…' : 'Finish & Update Profile'}
            </button>
          )}
          <button
            onClick={() => { setPhase('idle'); setMessages([]) }}
            className="btn-secondary text-[11px]"
            style={{ padding: '6px 12px' }}
          >
            {phase === 'done' ? 'Start Over' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-xl px-4 py-3"
              style={{
                background: msg.role === 'user' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                color: 'var(--text-primary)'
              }}
            >
              <div className="prose-vault text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-4 py-3 animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {phase === 'interviewing' && (
        <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
          <div className="flex gap-2 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Answer the question…"
              className="input-glass flex-1"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="btn-primary text-sm shrink-0"
              style={{ padding: '8px 16px' }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
