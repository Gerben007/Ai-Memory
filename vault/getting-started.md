---
title: "Getting Started with Knowledge Vault"
tags: [guide, knowledge-management]
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---

Welcome to **Knowledge Vault** — your local-first AI-powered knowledge management system.

## How It Works

Knowledge Vault stores your notes as plain Markdown files in the `/vault` folder. No database, no lock-in. You can edit these files with any text editor.

The app uses **BM25 keyword search** to build an index of all your notes. When you ask the AI a question, it retrieves the most relevant chunks from your notes and feeds them to Claude as context.

## Key Features

- **Markdown Editor** with live preview and syntax highlighting
- **Wikilinks** — link between notes using `[[Note Title]]` syntax
- **BM25 Search** — fast, offline full-text search across all notes
- **AI Chat** — ask questions about your vault with RAG-powered retrieval
- **Brain Map** — visualize connections between your notes
- **Agent API** — structured JSON interface for external AI agents

## Getting Started

1. Create a few notes on topics you care about
2. Use `[[wikilinks]]` to connect related notes
3. Add tags in the frontmatter to categorize notes
4. Try the AI Chat to ask questions about your notes
5. Check the Graph view to see your knowledge network

See also: [[RAG Pipeline Explained]], [[Markdown Syntax Guide]]
