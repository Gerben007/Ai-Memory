import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const wikilinkExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src) {
    return src.indexOf('[[')
  },
  tokenizer(src) {
    const match = /^\[\[([^\]]+)\]\]/.exec(src)
    if (match) {
      const inner = match[1]
      const pipeIndex = inner.indexOf('|')
      const target = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner.trim()
      const display = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim()
      return {
        type: 'wikilink',
        raw: match[0],
        target,
        display
      }
    }
  },
  renderer(token) {
    return `<a class="wikilink" data-wikilink="${escapeHtml(token.target)}" href="#">${escapeHtml(token.display)}</a>`
  }
}

const marked = new Marked()

marked.use({
  extensions: [wikilinkExtension],
  renderer: {
    code({ text, lang }) {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
      }
      const highlighted = hljs.highlightAuto(text).value
      return `<pre><code class="hljs">${highlighted}</code></pre>`
    }
  },
  gfm: true,
  breaks: false
})

// Preserve wikilink marker attribute; DOMPurify strips unknown data-* attrs by default only
// when ALLOW_DATA_ATTR is false. It's true by default, but we list it explicitly to document intent.
const SANITIZE_CONFIG = {
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['data-wikilink']
}

export function renderMarkdown(text) {
  if (!text) return ''
  const html = marked.parse(text)
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
