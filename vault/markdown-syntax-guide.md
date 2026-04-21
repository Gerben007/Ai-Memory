---
title: "Markdown Syntax Guide"
tags: [guide, markdown]
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---

A quick reference for Markdown syntax used in Knowledge Vault.

## Basic Formatting

- `**bold**` renders as **bold**
- `*italic*` renders as *italic*
- `~~strikethrough~~` renders as ~~strikethrough~~
- `` `inline code` `` renders as `inline code`

## Headings

Use `#` for headings. Knowledge Vault uses `##` and `###` as chunk boundaries for the [[RAG Pipeline Explained|RAG pipeline]].

```
# Heading 1
## Heading 2
### Heading 3
```

## Links

### Wikilinks

Use double brackets to link between notes:

```
[[Note Title]]
[[Note Title|Display Text]]
```

For example: [[Getting Started with Knowledge Vault]]

### External Links

Standard Markdown links work too: `[text](url)`

## Code Blocks

Use triple backticks with a language identifier:

```javascript
function hello() {
  console.log("Hello, Knowledge Vault!");
}
```

## Lists

```
- Unordered item
- Another item
  - Nested item

1. Ordered item
2. Another item
```

## Blockquotes

```
> This is a blockquote
> It can span multiple lines
```

## Tables

```
| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

## Frontmatter

Each note starts with YAML frontmatter:

```yaml
---
title: "Note Title"
tags: [tag1, tag2]
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:00:00Z
---
```
