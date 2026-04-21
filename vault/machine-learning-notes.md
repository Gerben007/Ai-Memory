---
title: "Machine Learning Notes"
tags: [ai, machine-learning, learning]
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---

A collection of notes on machine learning concepts and techniques.

## Supervised Learning

Supervised learning uses labeled training data to learn a mapping from inputs to outputs. The two main tasks are:

- **Classification** — predicting discrete categories (spam/not spam, cat/dog)
- **Regression** — predicting continuous values (house prices, temperature)

Common algorithms: linear regression, decision trees, random forests, SVMs, neural networks.

## Unsupervised Learning

Unsupervised learning finds patterns in unlabeled data:

- **Clustering** — grouping similar items (K-means, DBSCAN)
- **Dimensionality reduction** — simplifying data while preserving structure (PCA, t-SNE)
- **Anomaly detection** — finding unusual data points

## Information Retrieval

Information retrieval (IR) is the science of searching for information. Key concepts:

### TF-IDF

Term Frequency-Inverse Document Frequency weights terms by how important they are to a document relative to the corpus. See also [[RAG Pipeline Explained]] for how BM25 extends this idea.

### BM25

BM25 (Best Matching 25) is an improvement over TF-IDF that accounts for document length normalization and term frequency saturation. It is the algorithm used in Knowledge Vault's search.

## Neural Networks

Neural networks are composed of layers of interconnected nodes. Deep learning refers to neural networks with many layers.

### Transformers

The Transformer architecture, introduced in "Attention Is All You Need" (2017), revolutionized NLP. Key innovations:
- Self-attention mechanism
- Positional encoding
- Multi-head attention

Modern LLMs like Claude are built on the Transformer architecture.
