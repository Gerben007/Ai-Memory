import { useStore } from '../lib/store'

export default function SourceCitation({ sources }) {
  const setActiveNote = useStore(s => s.setActiveNote)

  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-gray-800 pt-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Sources</div>
      <div className="flex flex-col gap-1.5">
        {sources.map((source, i) => (
          <button
            key={i}
            onClick={() => setActiveNote(source.filename)}
            className="text-left bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 hover:bg-gray-800 hover:border-indigo-500/30 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-indigo-400 font-medium group-hover:text-indigo-300">
                {source.noteTitle || source.filename}
              </span>
              <span className="text-[10px] text-gray-600">
                {(source.score * 100).toFixed(0)}% match
              </span>
            </div>
            {source.heading && (
              <div className="text-[10px] text-gray-500 mt-0.5"># {source.heading}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
