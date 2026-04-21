import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import fs from 'fs'
import path from 'path'

let _PDFParse, _XLSX, _mammoth
async function loadParser(name) {
  try {
    switch (name) {
      case 'pdf':     if (!_PDFParse) _PDFParse = (await import('pdf-parse')).PDFParse;    return _PDFParse
      case 'xlsx':    if (!_XLSX)     _XLSX     = (await import('xlsx')).default;           return _XLSX
      case 'mammoth': if (!_mammoth)  _mammoth  = (await import('mammoth')).default;        return _mammoth
    }
  } catch { return null }
  return null
}

async function extractAttachmentText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase()
  try {
    if (ext === '.pdf') {
      const PDFParse = await loadParser('pdf')
      if (!PDFParse) return null
      const tmpPath = `/tmp/att-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      fs.writeFileSync(tmpPath, buffer)
      const parser = new PDFParse({})
      await parser.load(tmpPath)
      const info = await parser.getInfo().catch(() => ({}))
      const numPages = info?.Pages || 1
      const pages = []
      for (let i = 1; i <= numPages; i++) {
        try {
          const t = await parser.getPageText(i)
          if (t?.trim()) pages.push(t.trim())
        } catch {}
      }
      if (!pages.length) {
        try { const t = await parser.getText(); if (t?.trim()) pages.push(t.trim()) } catch {}
      }
      parser.destroy()
      fs.unlinkSync(tmpPath)
      return pages.join('\n\n') || null
    }
    if (ext === '.docx') {
      const mammoth = await loadParser('mammoth')
      if (!mammoth) return null
      const result = await mammoth.convertToMarkdown({ buffer })
      return result.value || null
    }
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      const XLSX = await loadParser('xlsx')
      if (!XLSX) return null
      const workbook = XLSX.read(buffer)
      const parts = []
      for (const name of workbook.SheetNames) {
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
        if (!json.length) continue
        const header = json[0].map(h => String(h || ''))
        const rows = json.slice(1, 101)
        let md = `**${name}**\n| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`
        for (const row of rows) md += `| ${row.map(c => String(c || '')).join(' | ')} |\n`
        parts.push(md)
      }
      return parts.join('\n\n') || null
    }
    if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.xml' || ext === '.html' || ext === '.htm') {
      return buffer.toString('utf-8').slice(0, 10000)
    }
  } catch (err) {
    console.error(`[Email] Failed to extract text from ${filename}:`, err.message)
  }
  return null
}

export function createEmailPoller(vaultDir, configPath) {
  const statePath = path.join(vaultDir, '.vault-email-state.json')
  let interval = null
  let polling = false
  let status = { lastPoll: null, lastError: null, totalProcessed: 0, enabled: false }

  function loadState() {
    try {
      if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    } catch {}
    return { lastUid: 0, lastPoll: null, totalProcessed: 0 }
  }

  function saveState(state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  function loadConfig() {
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return cfg.email || null
      }
    } catch {}
    return null
  }

  async function testConnection(cfg) {
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port || 1143,
      secure: cfg.secure || false,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
      logger: false
    })
    try {
      await client.connect()
      const folder = cfg.folder || 'INBOX'
      const lock = await client.getMailboxLock(folder)
      const count = client.mailbox.exists
      lock.release()
      await client.logout()
      return { success: true, messageCount: count, folder }
    } catch (err) {
      try { await client.logout() } catch {}
      return { success: false, error: err.message }
    }
  }

  async function poll() {
    if (polling) return { skipped: true, reason: 'Already polling' }
    const cfg = loadConfig()
    if (!cfg?.enabled) return { skipped: true, reason: 'Email polling disabled' }
    if (!cfg.host || !cfg.user || !cfg.pass) return { skipped: true, reason: 'Incomplete config' }

    const apiKey = (() => {
      try {
        const c = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return c.anthropicKey || c.apiKey || null
      } catch { return null }
    })()
    const model = (() => {
      try {
        const c = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return c.model || 'claude-sonnet-4-6'
      } catch { return 'claude-sonnet-4-6' }
    })()

    polling = true
    const state = loadState()
    let processed = 0
    let skipped = 0

    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port || 1143,
      secure: cfg.secure || false,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
      logger: false
    })

    try {
      await client.connect()
      const folder = cfg.folder || 'INBOX'
      const lock = await client.getMailboxLock(folder)

      try {
        const searchCriteria = state.lastUid > 0 ? { uid: `${state.lastUid + 1}:*` } : { all: true }
        const uids = []

        for await (const msg of client.fetch(searchCriteria, { uid: true, source: true })) {
          if (msg.uid <= state.lastUid) continue
          uids.push(msg.uid)

          try {
            const parsed = await simpleParser(msg.source)
            const result = await processEmail(parsed, apiKey, model)

            if (result.skip) {
              console.log(`[Email] Skipped: ${parsed.subject} — ${result.reason}`)
              skipped++
            } else {
              console.log(`[Email] Saved: ${result.filename}`)
              processed++
            }
          } catch (err) {
            console.error(`[Email] Failed to process UID ${msg.uid}:`, err.message)
          }

          state.lastUid = Math.max(state.lastUid, msg.uid)
        }
      } finally {
        lock.release()
      }

      await client.logout()

      state.lastPoll = new Date().toISOString()
      state.totalProcessed = (state.totalProcessed || 0) + processed
      saveState(state)

      status = { lastPoll: state.lastPoll, lastError: null, totalProcessed: state.totalProcessed, enabled: true }
      console.log(`[Email] Poll complete: ${processed} processed, ${skipped} skipped`)
      return { processed, skipped }
    } catch (err) {
      console.error('[Email] Poll error:', err.message)
      status = { ...status, lastError: err.message, lastPoll: new Date().toISOString() }
      state.lastPoll = new Date().toISOString()
      saveState(state)
      throw err
    } finally {
      polling = false
    }
  }

  function ensureAttachmentsDir() {
    const dir = path.join(vaultDir, 'attachments')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  async function saveAttachments(attachments, slug) {
    if (!attachments?.length) return { savedFiles: [], extractedTexts: [] }
    const attDir = ensureAttachmentsDir()
    const savedFiles = []
    const extractedTexts = []

    for (const att of attachments) {
      const filename = att.filename || `attachment-${Date.now().toString(36)}`
      const safeName = `${slug}-${filename}`.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
      const filePath = path.join(attDir, safeName)

      try {
        fs.writeFileSync(filePath, att.content)
        savedFiles.push({ name: filename, path: `attachments/${safeName}`, size: att.size || att.content.length, type: att.contentType })
        console.log(`[Email] Saved attachment: ${safeName} (${att.contentType})`)

        const extracted = await extractAttachmentText(att.content, filename)
        if (extracted?.trim()) {
          extractedTexts.push({ name: filename, text: extracted.slice(0, 8000) })
          console.log(`[Email] Extracted ${extracted.length} chars from ${filename}`)
        }
      } catch (err) {
        console.error(`[Email] Failed to save attachment ${filename}:`, err.message)
      }
    }

    return { savedFiles, extractedTexts }
  }

  async function processEmail(parsed, apiKey, model) {
    const subject = parsed.subject || 'No Subject'
    const from = parsed.from?.text || ''
    const to = parsed.to?.text || ''
    const cc = parsed.cc?.text || ''
    const date = parsed.date?.toISOString() || ''
    const messageId = parsed.messageId || ''
    const body = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') || ''
    const meta = { from, to, cc, date, subject, messageId }

    const slug = subject.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    const { savedFiles, extractedTexts } = await saveAttachments(parsed.attachments, slug)
    meta.attachments = savedFiles

    const hasBody = body.trim() && body.trim().length >= 20
    const hasAttachmentText = extractedTexts.length > 0

    if (!hasBody && !hasAttachmentText) {
      return { skip: true, reason: 'Empty or too short (no extractable content)' }
    }

    let fullContent = body
    if (extractedTexts.length > 0) {
      const attSection = extractedTexts.map(a => `\n--- Attachment: ${a.name} ---\n${a.text}`).join('\n')
      fullContent = `${body}\n\n## ATTACHMENT CONTENTS\n${attSection}`
    }

    if (!apiKey) {
      return saveRawEmail(meta, fullContent)
    }

    try {
      const attachmentInfo = savedFiles.length > 0
        ? `\n\nAttachments: ${savedFiles.map(f => `${f.name} (${f.type})`).join(', ')}`
        : ''

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `You are a knowledge extraction expert. Convert this email into a concise knowledge note for a personal vault.

Rules:
- Extract KNOWLEDGE and DECISIONS — ignore pleasantries, signatures, disclaimers, threading artifacts
- Title: concise (max 8 words), captures the core topic
- Tags: 2-5 hierarchical using parent/child format (e.g., finance/vat, project/ai-memory)
  NEVER use generic tags: reference, document, email, note, summary, import, general, misc
- Content: structured markdown with clear headings
- If the email contains action items, list them under "## Action Items"
- If there are attachments, incorporate their content into the note and list them under "## Attachments" with their filenames
- If there is no real knowledge (OTP codes, spam, marketing, automated notifications), return {"skip": true, "reason": "..."}
- Ignore email signatures, legal disclaimers, and quoted reply chains

Return ONLY valid JSON:
{ "title": "...", "tags": [...], "content": "..." }
or { "skip": true, "reason": "..." }`,
          messages: [{
            role: 'user',
            content: `From: ${from}\nTo: ${to}\nCC: ${cc}\nDate: ${date}\nSubject: ${subject}${attachmentInfo}\n\n${fullContent.slice(0, 12000)}`
          }]
        })
      })

      if (!response.ok) {
        console.error(`[Email] AI error ${response.status}`)
        return saveRawEmail(meta, fullContent)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return saveRawEmail(meta, fullContent)

      const result = JSON.parse(jsonMatch[0])
      if (result.skip) return { skip: true, reason: result.reason || 'AI skipped' }

      return saveNote(result.title || subject, result.tags || [], result.content || fullContent, meta)
    } catch (err) {
      console.error('[Email] AI processing failed:', err.message)
      return saveRawEmail(meta, fullContent)
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function yamlEscape(s) {
    return String(s || '').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '')
  }

  function saveNote(title, tags, content, meta = {}) {
    const now = new Date().toISOString()
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
    let filename = `email-${slug}.md`
    if (fs.existsSync(path.join(vaultDir, filename))) {
      filename = `email-${slug}-${Date.now().toString(36)}.md`
    }

    const tagStr = tags.map(t => t.includes(',') ? `"${t}"` : t).join(', ')
    const frontmatter = [
      '---',
      `title: "${yamlEscape(title)}"`,
      `tags: [${tagStr}]`,
      `created: ${now}`,
      `updated: ${now}`,
      `source: email`,
      meta.from ? `email_from: "${yamlEscape(meta.from)}"` : null,
      meta.to ? `email_to: "${yamlEscape(meta.to)}"` : null,
      meta.cc ? `email_cc: "${yamlEscape(meta.cc)}"` : null,
      meta.date ? `email_date: ${meta.date}` : null,
      meta.subject ? `email_subject: "${yamlEscape(meta.subject)}"` : null,
      meta.messageId ? `email_message_id: "${yamlEscape(meta.messageId)}"` : null,
      '---'
    ].filter(Boolean).join('\n')

    const emailHeader = [
      '> **Email received**',
      meta.from ? `> **From:** ${meta.from}` : null,
      meta.to ? `> **To:** ${meta.to}` : null,
      meta.cc ? `> **CC:** ${meta.cc}` : null,
      meta.date ? `> **Date:** ${new Date(meta.date).toLocaleString()}` : null,
      meta.subject ? `> **Subject:** ${meta.subject}` : null
    ].filter(Boolean).join('\n')

    let attachmentSection = ''
    if (meta.attachments?.length) {
      const links = meta.attachments.map(a => `- [${a.name}](${a.path}) *(${a.type}, ${formatSize(a.size)})*`)
      attachmentSection = `\n\n## Attachments\n\n${links.join('\n')}\n`
    }

    const fullContent = `${frontmatter}\n\n${emailHeader}\n\n---\n\n${content}${attachmentSection}\n`
    fs.writeFileSync(path.join(vaultDir, filename), fullContent, 'utf-8')
    return { skip: false, filename }
  }

  function saveRawEmail(meta, body) {
    return saveNote(
      meta.subject || 'Untitled Email',
      ['email/unprocessed'],
      body.slice(0, 4000),
      meta
    )
  }

  function start() {
    const cfg = loadConfig()
    if (!cfg?.enabled) {
      console.log('[Email] Polling disabled in config')
      return
    }
    const minutes = cfg.pollInterval || 5
    console.log(`[Email] Starting poller — every ${minutes} min`)

    poll().catch(err => console.error('[Email] Initial poll failed:', err.message))

    interval = setInterval(() => {
      poll().catch(err => console.error('[Email] Poll failed:', err.message))
    }, minutes * 60 * 1000)
  }

  function stop() {
    if (interval) {
      clearInterval(interval)
      interval = null
      console.log('[Email] Poller stopped')
    }
  }

  function restart() {
    stop()
    start()
  }

  function getStatus() {
    const cfg = loadConfig()
    const state = loadState()
    return {
      enabled: cfg?.enabled || false,
      lastPoll: state.lastPoll,
      lastError: status.lastError,
      totalProcessed: state.totalProcessed || 0,
      polling,
      configured: !!(cfg?.host && cfg?.user && cfg?.pass)
    }
  }

  return { start, stop, restart, poll, testConnection, getStatus }
}
