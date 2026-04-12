import { useState } from 'react'
import { useStore } from '../lib/store'
import { chatCompletion } from '../lib/api'

const SCHEMA = {
  name: "Knowledge Vault Agent API",
  version: "1.0",
  description: "Query the Knowledge Vault using natural language. Returns BM25-ranked chunks from the vault with optional AI-generated response.",
  endpoint: "POST /api/agent/query (via UI) or use the JSON interface below",
  request: {
    query: "string — natural language question",
    top_k: "number — optional, default 5, max chunks to retrieve",
    include_ai_response: "boolean — optional, default true, whether to generate an AI response"
  },
  response: {
    query: "string — original query",
    retrieved_chunks: [
      {
        text: "string — chunk content",
        source: "string — source filename",
        heading: "string | null — section heading",
        tags: ["string"],
        score: "number — BM25 relevance score",
        position: { start: "number", end: "number" }
      }
    ],
    sources: ["string — deduplicated list of source filenames"],
    ai_response: "string | null — Claude's response based on retrieved context"
  }
}

export default function AgentPanel() {
  const search = useStore(s => s.search)
  const apiKey = useStore(s => s.apiKey)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(SCHEMA, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleQuery = async () => {
    if (!query.trim() || loading) return

    setLoading(true)
    try {
      // BM25 search
      const results = search(query, 5)
      const retrieved_chunks = results.map(r => ({
        text: r.chunk.text,
        source: r.chunk.noteFilename,
        heading: r.chunk.heading || null,
        tags: r.chunk.tags || [],
        score: Math.round(r.score * 1000) / 1000,
        position: { start: r.chunk.startPos, end: r.chunk.endPos }
      }))
      const sources = [...new Set(results.map(r => r.chunk.noteFilename))]

      let ai_response = null

      // Get AI response if API key is set
      if (apiKey) {
        let systemPrompt = 'You are a helpful AI assistant. Answer based on the provided context.\n\n'
        for (const chunk of retrieved_chunks) {
          systemPrompt += `[Source: ${chunk.source}${chunk.heading ? ' > ' + chunk.heading : ''}]\n${chunk.text}\n\n`
        }

        try {
          const res = await chatCompletion({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: 'user', content: query }],
            stream: false
          }, apiKey)

          const data = await res.json()
          ai_response = data.content?.[0]?.text || null
        } catch (err) {
          ai_response = `Error: ${err.message}`
        }
      }

      setResult({
        query: query.trim(),
        retrieved_chunks,
        sources,
        ai_response
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4 bg-gray-900/50">
        <h2 className="text-lg font-bold text-gray-200">Agent API</h2>
        <p className="text-xs text-gray-500 mt-1">
          Structured interface for external AI agents (n8n, Claude Code, etc.)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Schema */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">API Schema</h3>
            <button
              onClick={handleCopySchema}
              className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded hover:bg-gray-700 hover:text-gray-200"
            >
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>
          <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
            {JSON.stringify(SCHEMA, null, 2)}
          </pre>
        </section>

        {/* Test Query */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Test Query</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuery()}
              placeholder="Enter a query..."
              className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-lg px-4 py-2.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500"
              disabled={loading}
            />
            <button
              onClick={handleQuery}
              disabled={loading || !query.trim()}
              className="bg-indigo-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Running...' : 'Run Query'}
            </button>
          </div>
        </section>

        {/* Result */}
        {result && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Response</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(result, null, 2))
                }}
                className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded hover:bg-gray-700 hover:text-gray-200"
              >
                Copy Response
              </button>
            </div>
            <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-xs text-green-400 overflow-x-auto max-h-[500px] overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        )}

        {/* Documentation */}
        <section className="border-t border-gray-800 pt-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">How It Works</h3>
          <div className="text-xs text-gray-400 space-y-2">
            <p>
              <strong className="text-gray-300">1. Query Parsing:</strong> Your natural language query is tokenized and scored against all note chunks using BM25.
            </p>
            <p>
              <strong className="text-gray-300">2. Chunk Retrieval:</strong> Notes are split by heading boundaries (## and ###) into chunks of max 400 characters with 50-character overlap. The top 5 chunks by BM25 score are returned.
            </p>
            <p>
              <strong className="text-gray-300">3. AI Response:</strong> If a Claude API key is configured, retrieved chunks are injected into Claude's context as a system prompt. The AI generates a response citing specific sources.
            </p>
            <p>
              <strong className="text-gray-300">4. Structured Output:</strong> The response is returned as JSON with the query, retrieved chunks (with metadata), source list, and AI response — ready for consumption by external agents.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
