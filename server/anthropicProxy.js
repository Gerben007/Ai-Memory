import { Router } from 'express'

export function createAnthropicProxy() {
  const router = Router()

  router.post('/', async (req, res) => {
    const apiKey = req.headers['x-api-key']
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required. Set it in Settings.' })
    }

    try {
      const bodyStr = JSON.stringify(req.body)
      const bodySize = Buffer.byteLength(bodyStr)
      console.log(`[Anthropic] Request: model=${req.body.model} max_tokens=${req.body.max_tokens} body_size=${bodySize}b messages=${req.body.messages?.length || 0}`)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: bodyStr
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Anthropic] Error ${response.status}: ${errorText.slice(0, 500)}`)
        try {
          const parsed = JSON.parse(errorText)
          const msg = parsed.error?.message || parsed.message || errorText
          const type = parsed.error?.type || 'api_error'
          return res.status(response.status).json({
            error: { type, message: msg, status: response.status, detail: `Model: ${req.body.model}, Body: ${bodySize}b` }
          })
        } catch {
          return res.status(response.status).json({
            error: { type: 'api_error', message: errorText, status: response.status }
          })
        }
      }

      // If streaming, pipe the response
      if (req.body.stream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(decoder.decode(value, { stream: true }))
          }
        } finally {
          res.end()
        }
      } else {
        const data = await response.json()
        res.json(data)
      }
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
