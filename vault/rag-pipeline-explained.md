---
title: "RAG Pipeline Explained"
tags: [ai, rag, knowledge-management]
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---

Retrieval-Augmented Generation (RAG) is the core technique powering the AI Chat in Knowledge Vault.

## What is RAG?

RAG combines two steps: **retrieval** (finding relevant information) and **generation** (producing a response using that information). Instead of relying solely on the AI's training data, RAG injects your own documents into the conversation.

## How It Works in Knowledge Vault

### Step 1: Chunking

Every note is split into chunks at heading boundaries (`##` and `###`). Each chunk is at most 400 characters with 50 characters of overlap between adjacent chunks. This ensures context isn't lost at chunk boundaries.

### Step 2: BM25 Indexing

All chunks are indexed using the BM25 algorithm — a proven information retrieval formula that scores documents based on term frequency, inverse document frequency, and document length normalization.

The BM25 parameters used are:
- **k1 = 1.5** (term frequency saturation)
- **b = 0.75** (document length normalization)

### Step 3: Query & Retrieval

When you ask a question, the query is tokenized the same way and scored against all chunks. The top 5 chunks are selected based on their BM25 score.

### Step 4: Generation

The retrieved chunks are injected into Claude's system prompt as context. Claude generates a response based on this context and cites which notes it drew from.

## Why BM25?

BM25 is lightweight, works fully offline, and requires no external API or embedding model. For personal knowledge bases under 1000 notes, it provides excellent retrieval quality.

See also: [[Getting Started with Knowledge Vault]], [[Building a Second Brain]]
