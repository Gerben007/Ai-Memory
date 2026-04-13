import { useState, useRef, useEffect } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import { chatCompletion } from '../lib/api'
import SourceCitation from './SourceCitation'

function buildSystemPrompt(retrievedChunks) {
  let prompt = `You are a helpful AI assistant with access to the user's personal knowledge vault.
Answer questions based on the provided context. If the context doesn't contain relevant information, say so honestly.
Always cite your sources using [Source: filename > heading] format when referencing specific information from the context.

`

  if (retrievedChunks.length > 0) {
    prompt += '=== RETRIEVED CONTEXT ===\n\n'
    for (const { chunk, score } of retrievedChunks) {
      const heading = chunk.heading ? ` > ${chunk.heading}` : ''
      prompt += `[Source: ${chunk.noteFilename}${heading}] (relevance: ${score.toFixed(2)})\n`
      prompt += `${chunk.text}\n\n`
    }
    prompt += '=== END CONTEXT ===\n'
  } else {
    prompt += 'No relevant context was found in the vault for this query.\n'
  }

  return prompt
}

export default function ChatPanel() {
  const chatMessages = useStore(s => s.chatMessages)
  const addMessage = useStore(s => s.addMessage)
  const updateLastMessage = useStore(s => s.updateLastMessage)
  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)
  const search = useStore(s => s.search)
  const setActiveView = useStore(s => s.setActiveView)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    if (!apiKey) {
      addMessage({
        role: 'assistant',
        content: 'Please set your Claude API key in Settings first.',
        sources: []
      })
      return
    }

    const query = input.trim()
    setInput('')

    // Add user message
    addMessage({ role: 'user', content: query })

    // RAG: search vault for relevant chunks
    const results = search(query, 5)
    const sources = results.map(r => ({
      filename: r.chunk.noteFilename,
      noteTitle: r.chunk.noteTitle,
      heading: r.chunk.heading,
      score: r.score
    }))

    // Build system prompt with retrieved chunks
    const systemPrompt = buildSystemPrompt(results)

    // Prepare messages for API (last 10 pairs max)
    const recentMessages = chatMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))
    recentMessages.push({ role: 'user', content: query })

    // Add placeholder assistant message
    addMessage({ role: 'assistant', content: '', sources })

    setLoading(true)
    try {
      const res = await chatCompletion({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: recentMessages,
        stream: false
      }, apiKey)

      const data = await res.json()
      const fullContent = data.content?.[0]?.text

      updateLastMessage({ content: fullContent || 'No response — try again.', sources })
    } catch (err) {
      const isOverload = err.type === 'overloaded_error' || err.status === 529
      const isRateLimit = err.type === 'rate_limit_error' || err.status === 429
      const msg = isOverload
        ? 'Anthropic API is overloaded. Wait 30 seconds and try again.'
        : isRateLimit
          ? 'Rate limit reached. Wait a minute and try again.'
          : `Error: ${err.message}`
      updateLastMessage({ content: msg, sources: [] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-3 py-2 md:p-4 bg-gray-900/50">
        <h2 className="text-sm md:text-lg font-bold text-gray-200">AI Chat</h2>
        <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">
          Ask questions about your vault
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <div className="text-4xl mb-4">💬</div>
            <p className="text-sm">Ask a question about your vault</p>
            <p className="text-xs text-gray-600 mt-2">
              The AI will search your notes using BM25 and include relevant context
            </p>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] md:max-w-[80%] rounded-xl px-3 py-2 md:px-4 md:py-3 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <div
                    className="prose-vault text-sm"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) || (loading && i === chatMessages.length - 1 ? '<span class="animate-pulse">Thinking...</span>' : '') }}
                  />
                  <SourceCitation sources={msg.sources} />
                </>
              ) : (
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-3 md:p-4 bg-gray-900/50">
        {!apiKey && (
          <div className="mb-2 text-xs text-amber-400 flex items-center gap-2">
            <span>API key not set.</span>
            <button
              onClick={() => setActiveView('settings')}
              className="underline hover:text-amber-300"
            >
              Go to Settings
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about your vault..."
            className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-xl px-4 py-3 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
