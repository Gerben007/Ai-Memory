import { useState, useRef, useCallback } from 'react'
import { useStore } from '../lib/store'
import { renderMarkdown } from '../lib/markdownParser'
import TagPill from './TagPill'

const ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.eml,.txt,.md'

export default function ImportPanel() {
  const apiKey = useStore(s => s.apiKey)
  const model = useStore(s => s.model)
  const loadNotes = useStore(s => s.loadNotes)
  const rebuildIndex = useStore(s => s.rebuildIndex)
  const setActiveNote = useStore(s => s.setActiveNote)

  const [phase, setPhase] = useState('idle') // idle | parsing | analyzing | review | done
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const [sourceFile, setSourceFile] = useState('')
  const [extractInfo, setExtractInfo] = useState(null)
  const [generatedNotes, setGeneratedNotes] = useState([])
  const [createdNotes, setCreatedNotes] = useState([])
  const fileInputRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    setError(null)
    setPhase('parsing')
    setSourceFile(file.name)

    try {
      // Step 1: Upload and extract text
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/import', {
        method: 'POST',
        body: formData
      })

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}))
        throw new Error(err.error || `Upload failed (${uploadRes.status})`)
      }

      const extracted = await uploadRes.json()
      setExtractInfo(extracted)

      if (extracted.totalChars < 20) {
        throw new Error('No readable text found in this file. It may be a scanned/image-based document.')
      }

      if (!apiKey) {
        throw new Error('Set your Claude API key in Settings to analyze imported files.')
      }

      // Step 2: AI analysis
      setPhase('analyzing')

      const analyzeRes = await fetch('/api/import/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: extracted.title,
          sections: extracted.sections,
          meta: extracted.meta,
          apiKey,
          model
        })
      })

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}))
        throw new Error(err.error || `Analysis failed (${analyzeRes.status})`)
      }

      const { notes } = await analyzeRes.json()
      setGeneratedNotes(notes.map(n => ({ ...n, accepted: true })))
      setPhase('review')

    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }, [apiKey, model])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDone = async () => {
    await loadNotes()
    rebuildIndex()
    setCreatedNotes(generatedNotes.filter(n => n.accepted))
    setPhase('done')
  }

  const handleReset = () => {
    setPhase('idle')
    setError(null)
    setSourceFile('')
    setExtractInfo(null)
    setGeneratedNotes([])
    setCreatedNotes([])
  }

  // ── Idle: Drop zone ──────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50">
          <h2 className="text-base md:text-lg font-semibold text-gray-200">📥 Import Files</h2>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">Drop a file to create notes automatically</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div
            className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
              dragging
                ? 'border-indigo-500 bg-indigo-500/5'
                : 'border-gray-700 hover:border-gray-500 bg-gray-900/30'
            }`}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-4xl mb-4 opacity-40">📄</div>
            <p className="text-sm text-gray-300 font-medium">
              {dragging ? 'Drop file here' : 'Drag & drop a file here'}
            </p>
            <p className="text-xs text-gray-500 mt-2">or click to browse</p>
            <p className="text-[10px] text-gray-600 mt-4">
              Supports: PDF, Word (.docx), Excel (.xlsx), Email (.eml), Text (.txt, .md)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
        {error && (
          <div className="p-4 border-t border-red-500/20 bg-red-500/5">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-400/50 mt-1 hover:text-red-400">Dismiss</button>
          </div>
        )}
      </div>
    )
  }

  // ── Parsing / Analyzing: Loading state ───────────────────────────────
  if (phase === 'parsing' || phase === 'analyzing') {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50">
          <h2 className="text-base md:text-lg font-semibold text-gray-200">📥 Import Files</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="text-3xl mb-4 animate-pulse">
              {phase === 'parsing' ? '📄' : '🧠'}
            </div>
            <p className="text-sm text-gray-300 font-medium">
              {phase === 'parsing' ? 'Extracting text...' : 'AI is analyzing and creating notes...'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{sourceFile}</p>
            {extractInfo && (
              <p className="text-[10px] text-gray-600 mt-2">
                {extractInfo.sections.length} section{extractInfo.sections.length !== 1 ? 's' : ''} · {(extractInfo.totalChars / 1000).toFixed(1)}k chars
              </p>
            )}
            {phase === 'analyzing' && (
              <p className="text-[10px] text-gray-600 mt-3">This may take 30-60 seconds for large files</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Review: Generated notes ──────────────────────────────────────────
  if (phase === 'review') {
    const accepted = generatedNotes.filter(n => n.accepted)
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50 flex items-center justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-gray-200">Review Import</h2>
            <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">
              {generatedNotes.length} note{generatedNotes.length !== 1 ? 's' : ''} from {sourceFile}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-700">
              Cancel
            </button>
            <button
              onClick={handleDone}
              disabled={accepted.length === 0}
              className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-30 font-medium"
            >
              Import {accepted.length} note{accepted.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-3xl mx-auto w-full">
          {generatedNotes.map((note, i) => (
            <div
              key={i}
              className={`border rounded-xl overflow-hidden transition-opacity ${
                note.accepted ? 'border-gray-700 bg-gray-900/50' : 'border-gray-800 bg-gray-950/50 opacity-50'
              }`}
            >
              <div className="px-4 py-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={note.accepted}
                  onChange={() => {
                    const updated = [...generatedNotes]
                    updated[i] = { ...updated[i], accepted: !updated[i].accepted }
                    setGeneratedNotes(updated)
                  }}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200">{note.title}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {note.tags?.map(tag => <TagPill key={tag} tag={tag} />)}
                  </div>
                </div>
              </div>
              {note.accepted && note.content && (
                <div className="px-4 pb-3 border-t border-gray-800/50">
                  <div className="prose-vault text-xs mt-2 max-h-40 overflow-y-auto opacity-70"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content.slice(0, 500) + (note.content.length > 500 ? '\n\n...' : '')) }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-4 py-3 md:px-5 bg-gray-900/50">
        <h2 className="text-base md:text-lg font-semibold text-gray-200">📥 Import Complete</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-sm text-gray-200 font-medium">
            Created {createdNotes.length} note{createdNotes.length !== 1 ? 's' : ''} from {sourceFile}
          </p>
          <div className="mt-4 space-y-2 text-left">
            {createdNotes.map((n, i) => (
              <button
                key={i}
                onClick={() => { setActiveNote(n.filename); }}
                className="w-full text-left px-4 py-2.5 rounded-xl border border-gray-800 hover:border-indigo-500/30 hover:bg-gray-900/50 transition-colors"
              >
                <div className="text-sm text-gray-200">{n.title}</div>
                <div className="flex gap-1 mt-1">
                  {n.tags?.slice(0, 4).map(tag => <TagPill key={tag} tag={tag} />)}
                </div>
              </button>
            ))}
          </div>
          <button onClick={handleReset} className="mt-6 text-xs text-indigo-400 hover:text-indigo-300">
            Import another file
          </button>
        </div>
      </div>
    </div>
  )
}
