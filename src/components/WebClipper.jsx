import { useState } from 'react'
import { useStore } from '../lib/store'
import { authHeader, getVaultToken } from '../lib/api'

export default function WebClipper() {
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const [testResult, setTestResult] = useState(null)
  const defaultUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002'
  const [vaultUrl, setVaultUrl] = useState(defaultUrl)

  // The bookmarklet code — uses the configured vault URL. The access token is
  // baked into the bookmarklet so the bookmarklet can authenticate from an
  // arbitrary site's origin. Warn the user if no token is configured (means
  // the server allows unauthenticated clips — generally only acceptable for
  // local-only setups).
  const token = getVaultToken()
  const authLine = token ? `,'Authorization':'Bearer ${token.replace(/'/g, "\\'")}'` : ''
  const bookmarkletCode = `javascript:void(function(){var s=window.getSelection().toString().trim();var t=document.title;var u=window.location.href;if(!s){s=document.querySelector('article,main,.post-content,[role=main]');s=s?s.innerText.slice(0,5000):document.body.innerText.slice(0,2000)}fetch('${vaultUrl}/api/clip',{method:'POST',headers:{'Content-Type':'application/json'${authLine}},body:JSON.stringify({title:t.slice(0,100),content:s.slice(0,5000),url:u,tags:['clip']})}).then(r=>r.json()).then(d=>{if(d.filename)alert('Clipped to Knowledge Vault: '+d.title);else alert('Clip failed: '+(d.error||'unknown'))}).catch(e=>alert('Clip failed: '+e.message))}())`

  const handleTest = async () => {
    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          title: 'Test Clip — ' + new Date().toLocaleTimeString(),
          content: 'This is a test clip from the Knowledge Vault web clipper. If you see this note, the clipper is working correctly!',
          url: window.location.href,
          tags: ['clip', 'test']
        })
      })
      const data = await res.json()
      if (data.filename) {
        setTestResult({ ok: true, msg: `Created: ${data.filename}` })
        await loadNotes()
        rebuildIndex()
      } else {
        setTestResult({ ok: false, msg: data.error || 'Failed' })
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message })
    }
    setTimeout(() => setTestResult(null), 5000)
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Web Clipper</h3>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Drag the button below to your browser bookmark bar. Click it on any page to clip content to your vault.
      </p>

      {/* Vault URL config */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>Vault URL:</span>
        <input
          type="text"
          value={vaultUrl}
          onChange={e => setVaultUrl(e.target.value)}
          className="input-glass flex-1 text-xs"
          style={{ padding: '5px 10px' }}
          placeholder="http://192.168.20.62:3002"
        />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <a
          href={bookmarkletCode}
          onClick={e => e.preventDefault()}
          draggable="true"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent-hi)',
            textDecoration: 'none'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          Clip to Vault
        </a>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          ← Drag this to your bookmark bar
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleTest} className="btn-secondary text-[11px]" style={{ padding: '5px 12px' }}>
          Test Clipper
        </button>
        {testResult && (
          <span className="text-[11px]" style={{ color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
            {testResult.msg}
          </span>
        )}
      </div>

      <div className="mt-3 text-[10px] space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p><strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong></p>
        <p>1. Select text on any page (or it grabs the main article)</p>
        <p>2. Click "Clip to Vault" in your bookmarks</p>
        <p>3. Note appears in your vault with title, content, URL, and "clip" tag</p>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-secondary)' }}>API endpoint:</strong> POST {vaultUrl}/api/clip
        </p>
        <pre className="text-[10px] p-2 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
{`{ "title": "...", "content": "...", "url": "...", "tags": ["clip"] }`}
        </pre>
      </div>
    </div>
  )
}
