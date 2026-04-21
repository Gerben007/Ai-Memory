import { STOPWORDS } from './stopwords'

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

export class BM25Index {
  constructor({ k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1
    this.b = b
    this.chunks = []
    this.docCount = 0
    this.avgDocLength = 0
    this.docLengths = []
    this.termFreqs = []
    this.docFreqs = new Map()
    this.buildTimeMs = 0
  }

  build(chunks) {
    const start = performance.now()

    this.chunks = chunks
    this.docCount = chunks.length
    this.docLengths = []
    this.termFreqs = []
    this.docFreqs = new Map()

    if (this.docCount === 0) {
      this.avgDocLength = 0
      this.buildTimeMs = performance.now() - start
      return
    }

    let totalLength = 0

    for (let i = 0; i < this.docCount; i++) {
      const tokens = tokenize(this.chunks[i].text)
      this.docLengths[i] = tokens.length
      totalLength += tokens.length

      // Count term frequencies for this document
      const freqs = new Map()
      for (const token of tokens) {
        freqs.set(token, (freqs.get(token) || 0) + 1)
      }
      this.termFreqs[i] = freqs

      // Update document frequencies (how many docs contain each term)
      for (const term of freqs.keys()) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1)
      }
    }

    this.avgDocLength = totalLength / this.docCount

    this.buildTimeMs = performance.now() - start
    console.log(
      `BM25 index built: ${this.docCount} chunks, ${this.docFreqs.size} terms, ${this.buildTimeMs.toFixed(1)}ms`
    )
  }

  search(query, topK = 5) {
    if (this.docCount === 0) return []

    const queryTokens = [...new Set(tokenize(query))]
    if (queryTokens.length === 0) return []

    const scores = []

    for (let i = 0; i < this.docCount; i++) {
      let score = 0

      for (const term of queryTokens) {
        const df = this.docFreqs.get(term)
        if (!df) continue

        const tf = this.termFreqs[i].get(term) || 0
        if (tf === 0) continue

        // IDF: BM25+ variant (always non-negative)
        const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1)

        // Normalized term frequency
        const tfNorm = (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * this.docLengths[i] / this.avgDocLength))

        score += idf * tfNorm
      }

      if (score > 0) {
        scores.push({ chunk: this.chunks[i], score })
      }
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, topK)
  }

  getStats() {
    return {
      totalChunks: this.docCount,
      totalTerms: this.docFreqs.size,
      avgDocLength: Math.round(this.avgDocLength * 10) / 10,
      buildTimeMs: Math.round(this.buildTimeMs * 10) / 10
    }
  }
}
