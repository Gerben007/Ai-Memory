import { Marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

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
    return `<a class="wikilink" data-wikilink="${token.target}" href="#">${token.display}</a>`
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

export function renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text)
}
