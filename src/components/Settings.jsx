import { useState } from 'react'
import { useStore } from '../lib/store'
import JSZip from 'jszip'

export default function Settings() {
  const apiKey = useStore(s => s.apiKey)
  const setApiKey = useStore(s => s.setApiKey)
  const notes = useStore(s => s.notes)
  const bm25Index = useStore(s => s.bm25Index)
  const clearChat = useStore(s => s.clearChat)

  const [keyInput, setKeyInput] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const stats = bm25Index.getStats()

  const handleSaveKey = () => {
    setApiKey(keyInput)
    setKeyStatus('Saved!')
    setTimeout(() => setKeyStatus(''), 2000)
  }

  const handleTestKey = async () => {
    if (!keyInput) {
      setKeyStatus('Enter a key first')
      return
    }
    setKeyStatus('Testing...')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keyInput
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }]
        })
      })

      if (res.ok) {
        setKeyStatus('Key is valid!')
        setApiKey(keyInput)
      } else {
        const err = await res.json().catch(() => ({}))
        setKeyStatus(`Invalid: ${err.error || res.status}`)
      }
    } catch (err) {
      setKeyStatus(`Error: ${err.message}`)
    }
    setTimeout(() => setKeyStatus(''), 4000)
  }

  const handleExportZip = async () => {
    const zip = new JSZip()
    for (const note of notes) {
      zip.file(note.filename, note.content)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `knowledge-vault-export-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearChat = () => {
    clearChat()
    setConfirmClear(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4 bg-gray-900/50">
        <h2 className="text-lg font-bold text-gray-200">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-8">
        {/* API Key */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Claude API Key</h3>
          <p className="text-xs text-gray-500 mb-3">
            Your key is stored in localStorage and only sent to Anthropic's API. Never shared elsewhere.
          </p>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-lg px-4 py-2.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500 font-mono"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-xs bg-gray-800 text-gray-400 px-3 rounded-lg hover:bg-gray-700"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveKey}
              className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500"
            >
              Save Key
            </button>
            <button
              onClick={handleTestKey}
              className="text-xs bg-gray-800 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              Test Key
            </button>
            {keyStatus && (
              <span className={`text-xs py-2 ${keyStatus.includes('valid') || keyStatus === 'Saved!' ? 'text-green-400' : 'text-amber-400'}`}>
                {keyStatus}
              </span>
            )}
          </div>
        </section>

        {/* Vault Info */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Vault Information</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Vault path</span>
              <span className="text-gray-300 font-mono text-xs">/vault</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total notes</span>
              <span className="text-gray-300">{notes.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total size</span>
              <span className="text-gray-300">
                {(notes.reduce((sum, n) => sum + (n.content?.length || 0), 0) / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>
        </section>

        {/* BM25 Stats */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">BM25 Index Stats</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total chunks</span>
              <span className="text-gray-300">{stats.totalChunks}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Unique terms</span>
              <span className="text-gray-300">{stats.totalTerms}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Avg chunk length</span>
              <span className="text-gray-300">{stats.avgDocLength} tokens</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Last build time</span>
              <span className="text-gray-300">{stats.buildTimeMs} ms</span>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Actions</h3>
          <div className="space-y-3">
            <button
              onClick={handleExportZip}
              disabled={notes.length === 0}
              className="w-full text-left text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700 border border-gray-700 disabled:opacity-50"
            >
              <div className="font-medium">Export Vault as ZIP</div>
              <div className="text-xs text-gray-500 mt-0.5">Download all {notes.length} notes as a zip file</div>
            </button>

            {confirmClear ? (
              <div className="flex gap-2">
                <button
                  onClick={handleClearChat}
                  className="flex-1 text-sm bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-500"
                >
                  Confirm: Delete all chat history
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="w-full text-left text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700 border border-gray-700"
              >
                <div className="font-medium">Clear Chat History</div>
                <div className="text-xs text-gray-500 mt-0.5">Remove all AI chat messages from localStorage</div>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
