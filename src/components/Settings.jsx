import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../lib/store'
import { getAllTagsWithCounts } from '../lib/tagUtils'
import { saveConfig, fetchEmailStatus, triggerEmailSync, testEmailConnection, restartEmailPoller, authHeader, getVaultToken, setVaultToken } from '../lib/api'
import { fetchAuthStatus, logout as authLogout } from '../lib/auth'
import TagCleanup from './TagCleanup'
import AgentPanel from './AgentPanel'
import JSZip from 'jszip'

export default function Settings() {
  const apiKey = useStore(s => s.apiKey)
  const setApiKey = useStore(s => s.setApiKey)
  const model = useStore(s => s.model)
  const setModel = useStore(s => s.setModel)
  const notes = useStore(s => s.notes)
  const bm25Index = useStore(s => s.bm25Index)
  const clearChat = useStore(s => s.clearChat)
  const vaultContext = useStore(s => s.vaultContext)
  const vaultContextLoading = useStore(s => s.vaultContextLoading)
  const loadContext = useStore(s => s.loadContext)
  const generateContextAction = useStore(s => s.generateContext)

  const [keyInput, setKeyInput] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [showTagCleanup, setShowTagCleanup] = useState(false)
  const [contextStatus, setContextStatus] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const [tokenInput, setTokenInput] = useState(getVaultToken())
  const [tokenStatus, setTokenStatus] = useState('')

  // Email ingestion state
  const [emailCfg, setEmailCfg] = useState({ enabled: false, host: 'imap.gmail.com', port: 993, secure: true, user: '', pass: '', pollInterval: 5 })
  const [emailStatus, setEmailStatus] = useState(null)
  const [emailMsg, setEmailMsg] = useState('')
  const [emailTesting, setEmailTesting] = useState(false)
  const [emailSyncing, setEmailSyncing] = useState(false)
  const [showEmailPass, setShowEmailPass] = useState(false)

  const loadEmailStatus = useCallback(async () => {
    try {
      const s = await fetchEmailStatus()
      setEmailStatus(s)
    } catch {}
  }, [])

  // Load vault context + email status on mount
  useEffect(() => { loadContext(); loadEmailStatus() }, [])

  // Load email config from server config
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/config')
        const cfg = await res.json()
        if (cfg.email) setEmailCfg(prev => ({ ...prev, ...cfg.email }))
      } catch {}
    })()
  }, [])

  const handleSaveEmail = async () => {
    try {
      await saveConfig({ email: emailCfg })
      await restartEmailPoller()
      setEmailMsg('Saved!')
      loadEmailStatus()
    } catch (err) {
      setEmailMsg(`Error: ${err.message}`)
    }
    setTimeout(() => setEmailMsg(''), 3000)
  }

  const handleTestEmail = async () => {
    setEmailTesting(true)
    setEmailMsg('Testing connection...')
    try {
      const result = await testEmailConnection(emailCfg)
      if (result.success) {
        setEmailMsg(`Connected! ${result.messageCount} messages in inbox.`)
      } else {
        setEmailMsg(`Failed: ${result.error}`)
      }
    } catch (err) {
      setEmailMsg(`Error: ${err.message}`)
    }
    setEmailTesting(false)
    setTimeout(() => setEmailMsg(''), 5000)
  }

  const handleSyncEmail = async () => {
    setEmailSyncing(true)
    setEmailMsg('Syncing...')
    try {
      const result = await triggerEmailSync()
      if (result.skipped) {
        setEmailMsg(result.reason)
      } else {
        setEmailMsg(`Done: ${result.processed} processed, ${result.skipped} skipped`)
      }
      loadEmailStatus()
    } catch (err) {
      setEmailMsg(`Error: ${err.message}`)
    }
    setEmailSyncing(false)
    setTimeout(() => setEmailMsg(''), 5000)
  }

  // Detect whether the server requires login (to show/hide Sign out button)
  useEffect(() => {
    fetchAuthStatus().then(s => setAuthRequired(!!s.required))
  }, [])

  const handleLogout = async () => {
    await authLogout()
    window.location.reload()
  }

  const tagCount = getAllTagsWithCounts(notes).size

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
          'x-api-key': keyInput,
          ...authHeader()
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }]
        })
      })

      if (res.ok) {
        setKeyStatus('Key is valid!')
        setApiKey(keyInput)
      } else {
        const err = await res.json().catch(() => ({}))
        const msg = typeof err.error === 'object' ? err.error.message : (err.error || res.status)
        setKeyStatus(`Invalid: ${msg}`)
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

        {/* Vault Access Token */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Vault Access Token</h3>
          <p className="text-xs text-gray-500 mb-3">
            Required when the server was started with <code className="font-mono">VAULT_AUTH_TOKEN</code>. Stored in this
            browser's localStorage and sent as <code className="font-mono">Authorization: Bearer &lt;token&gt;</code> on
            every request to this vault.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="vault access token"
              className="flex-1 bg-gray-800 text-gray-200 text-sm rounded-lg px-4 py-2.5 border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-500 font-mono"
            />
            <button
              onClick={() => {
                setVaultToken(tokenInput.trim())
                setTokenStatus(tokenInput.trim() ? 'Saved' : 'Cleared')
                setTimeout(() => setTokenStatus(''), 2000)
              }}
              className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500"
            >
              Save
            </button>
            {tokenStatus && <span className="text-xs py-2 text-green-400">{tokenStatus}</span>}
          </div>
        </section>

        {/* Model Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">AI Model</h3>
          <p className="text-xs text-gray-500 mb-3">
            Used for Chat and Brainstorm. If you get overload errors, try a different model.
          </p>
          <div className="space-y-2">
            {[
              { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4', desc: 'Best balance of speed and quality' },
              { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Fastest, most available, lower cost' },
              { id: 'claude-opus-4-6', label: 'Claude Opus 4', desc: 'Most capable, slower, higher cost' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  model === m.id
                    ? 'bg-indigo-600/10 border-indigo-500/50 text-gray-200'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                }`}
              >
                <div className="text-sm font-medium flex items-center gap-2">
                  {m.label}
                  {model === m.id && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">Active</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                <div className="text-[10px] text-gray-600 mt-0.5 font-mono">{m.id}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Vault Context */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Vault Context</h3>
          <p className="text-xs text-gray-500 mb-3">
            A persistent profile of your vault that gets injected into AI chat. Helps Claude understand your world — key topics, projects, interests, and frequent entities.
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                if (!apiKey) {
                  setContextStatus('Set your API key first')
                  setTimeout(() => setContextStatus(''), 3000)
                  return
                }
                if (notes.length === 0) {
                  setContextStatus('No notes in vault')
                  setTimeout(() => setContextStatus(''), 3000)
                  return
                }
                setContextStatus('Generating...')
                try {
                  await generateContextAction()
                  setContextStatus('Context refreshed!')
                } catch (err) {
                  setContextStatus(`Error: ${err.message}`)
                }
                setTimeout(() => setContextStatus(''), 4000)
              }}
              disabled={vaultContextLoading}
              className="w-full text-left text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700 border border-gray-700 disabled:opacity-50"
            >
              <div className="font-medium">{vaultContextLoading ? 'Generating context...' : 'Refresh Context'}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Analyze all notes and generate a vault profile for AI chat
              </div>
            </button>
            {contextStatus && (
              <div className={`text-xs px-2 ${contextStatus.includes('Error') || contextStatus.includes('Set') || contextStatus.includes('No notes') ? 'text-amber-400' : 'text-green-400'}`}>
                {contextStatus}
              </div>
            )}
            {vaultContext && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-2 font-medium">Current vault profile:</div>
                <div className="text-xs text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                  {vaultContext}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Email Ingestion */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Email Ingestion</h3>
          <p className="text-xs text-gray-500 mb-3">
            Forward emails to your vault Gmail — they'll be processed by Claude into structured knowledge notes. Use a Gmail app password (not your regular password).
          </p>

          <div className="space-y-3">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Enable email polling</span>
              <button
                onClick={() => setEmailCfg(prev => ({ ...prev, enabled: !prev.enabled }))}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: emailCfg.enabled ? 'var(--accent)' : 'var(--bg-surface)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                  style={{
                    background: '#fff',
                    left: emailCfg.enabled ? '22px' : '2px'
                  }}
                />
              </button>
            </div>

            {/* Preset */}
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true },
                { label: 'Office 365', host: 'outlook.office365.com', port: 993, secure: true },
                { label: 'Yahoo', host: 'imap.mail.yahoo.com', port: 993, secure: true },
              ].map(preset => (
                <button
                  key={preset.host}
                  onClick={() => setEmailCfg(prev => ({ ...prev, host: preset.host, port: preset.port, secure: preset.secure }))}
                  className="text-[11px] px-3 py-1.5 rounded-lg border transition-colors"
                  style={{
                    background: emailCfg.host === preset.host ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: emailCfg.host === preset.host ? 'var(--accent)' : 'var(--border)',
                    color: emailCfg.host === preset.host ? 'var(--accent-hi)' : 'var(--text-secondary)'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Connection fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">IMAP Host</label>
                <input
                  type="text"
                  value={emailCfg.host}
                  onChange={e => setEmailCfg(prev => ({ ...prev, host: e.target.value }))}
                  className="w-full bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Port</label>
                <input
                  type="number"
                  value={emailCfg.port}
                  onChange={e => setEmailCfg(prev => ({ ...prev, port: parseInt(e.target.value) || 1143 }))}
                  className="w-full bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Username (email address)</label>
              <input
                type="text"
                value={emailCfg.user}
                onChange={e => setEmailCfg(prev => ({ ...prev, user: e.target.value }))}
                placeholder="gerben.boersema+vault@gmail.com"
                className="w-full bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Password (App password)</label>
              <div className="flex gap-2">
                <input
                  type={showEmailPass ? 'text' : 'password'}
                  value={emailCfg.pass}
                  onChange={e => setEmailCfg(prev => ({ ...prev, pass: e.target.value }))}
                  className="flex-1 bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
                />
                <button
                  onClick={() => setShowEmailPass(!showEmailPass)}
                  className="text-xs bg-gray-800 text-gray-400 px-2.5 rounded-lg hover:bg-gray-700 border border-gray-700"
                >
                  {showEmailPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Poll interval */}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Poll interval</label>
              <select
                value={emailCfg.pollInterval}
                onChange={e => setEmailCfg(prev => ({ ...prev, pollInterval: parseInt(e.target.value) }))}
                className="bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value={1}>Every 1 minute</option>
                <option value={5}>Every 5 minutes</option>
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleSaveEmail} className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500">
                Save
              </button>
              <button onClick={handleTestEmail} disabled={emailTesting} className="text-xs bg-gray-800 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50">
                {emailTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={handleSyncEmail} disabled={emailSyncing || !emailCfg.enabled} className="text-xs bg-gray-800 text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50">
                {emailSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            {/* Status */}
            {emailMsg && (
              <div className={`text-xs px-1 ${emailMsg.includes('Error') || emailMsg.includes('Failed') ? 'text-red-400' : emailMsg.includes('Done') || emailMsg.includes('Connected') || emailMsg === 'Saved!' ? 'text-green-400' : 'text-amber-400'}`}>
                {emailMsg}
              </div>
            )}
            {emailStatus && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={emailStatus.enabled ? 'text-green-400' : 'text-gray-500'}>
                    {emailStatus.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {emailStatus.lastPoll && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last checked</span>
                    <span className="text-gray-300">{new Date(emailStatus.lastPoll).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Total processed</span>
                  <span className="text-gray-300">{emailStatus.totalProcessed || 0}</span>
                </div>
                {emailStatus.lastError && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last error</span>
                    <span className="text-red-400 truncate ml-4">{emailStatus.lastError}</span>
                  </div>
                )}
              </div>
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
              onClick={() => setShowTagCleanup(true)}
              className="w-full text-left text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700 border border-gray-700"
            >
              <div className="font-medium">🏷 Clean Up Tags</div>
              <div className="text-xs text-gray-500 mt-0.5">Normalize, merge duplicates, remove orphan tags ({tagCount} tags)</div>
            </button>

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

            {authRequired && (
              <button
                onClick={handleLogout}
                className="w-full text-left text-sm bg-gray-800 text-gray-300 px-4 py-3 rounded-lg hover:bg-gray-700 border border-gray-700"
              >
                <div className="font-medium">Sign Out</div>
                <div className="text-xs text-gray-500 mt-0.5">End your session on this device</div>
              </button>
            )}
          </div>
        </section>

        {/* Agent API */}
        <section>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <AgentPanel />
          </div>
        </section>
      </div>

      {showTagCleanup && <TagCleanup onClose={() => setShowTagCleanup(false)} />}
    </div>
  )
}
