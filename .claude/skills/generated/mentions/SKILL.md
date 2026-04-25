---
name: mentions
description: "Skill for the Mentions area of claw. 20 symbols across 4 files."
---

# Mentions

20 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how render, getFileIconByExtension, createFileIconElement work
- Modifying mentions-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/features/agents/mentions/render-file-mentions.tsx` | MentionChip, base64ToUtf8, parseMention, renderTextWithUltrathink, useRenderFileMentions (+3) |
| `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | appendText, createMentionNode, buildContentFromSerialized, walkTreeOnce, runTriggerDetection (+2) |
| `src/renderer/features/agents/mentions/agents-file-mention.tsx` | getFileIconByExtension, createFileIconElement, getOptionIcon |
| `src/renderer/components/mermaid-block.tsx` | initMermaid, render |

## Entry Points

Start here when exploring this area:

- **`render`** (Function) — `src/renderer/components/mermaid-block.tsx:80`
- **`getFileIconByExtension`** (Function) — `src/renderer/features/agents/mentions/agents-file-mention.tsx:176`
- **`createFileIconElement`** (Function) — `src/renderer/features/agents/mentions/agents-file-mention.tsx:336`
- **`getOptionIcon`** (Function) — `src/renderer/features/agents/mentions/agents-file-mention.tsx:456`
- **`useRenderFileMentions`** (Function) — `src/renderer/features/agents/mentions/render-file-mentions.tsx:316`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `render` | Function | `src/renderer/components/mermaid-block.tsx` | 80 |
| `getFileIconByExtension` | Function | `src/renderer/features/agents/mentions/agents-file-mention.tsx` | 176 |
| `createFileIconElement` | Function | `src/renderer/features/agents/mentions/agents-file-mention.tsx` | 336 |
| `getOptionIcon` | Function | `src/renderer/features/agents/mentions/agents-file-mention.tsx` | 456 |
| `useRenderFileMentions` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 316 |
| `RenderFileMentions` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 363 |
| `extractFileMentions` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 378 |
| `extractTextMentions` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 404 |
| `runTriggerDetection` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 671 |
| `handleSelectionChange` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 565 |
| `updateMentionHighlights` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 583 |
| `initMermaid` | Function | `src/renderer/components/mermaid-block.tsx` | 22 |
| `MentionChip` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 216 |
| `appendText` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 84 |
| `createMentionNode` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 91 |
| `buildContentFromSerialized` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 186 |
| `base64ToUtf8` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 13 |
| `parseMention` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 75 |
| `renderTextWithUltrathink` | Function | `src/renderer/features/agents/mentions/render-file-mentions.tsx` | 296 |
| `walkTreeOnce` | Function | `src/renderer/features/agents/mentions/agents-mentions-editor.tsx` | 267 |

## How to Explore

1. `gitnexus_context({name: "render"})` — see callers and callees
2. `gitnexus_query({query: "mentions"})` — find related execution flows
3. Read key files listed above for implementation details
