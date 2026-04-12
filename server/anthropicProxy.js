import { Router } from 'express'

export function createAnthropicProxy() {
  const router = Router()

  router.post('/', async (req, res) => {
    const apiKey = req.headers['x-api-key']
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required. Set it in Settings.' })
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(req.body)
      })

      if (!response.ok) {
        const error = await response.text()
        return res.status(response.status).json({ error })
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
