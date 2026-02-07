# Ollama Model Settings Refactor

## What This Is

Refactor the Ollama model selection UI to allow users to curate a personal list of models from available Cloud Models. The model dropdown in chat should only show the user's curated list, and the selected model should be used for requests.

## Core Value

Users have control over which Ollama models appear in their dropdown, making model selection faster and more intentional.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Browse available Cloud Models from Ollama API/library
- [ ] Add models from Cloud list to personal "My Models" list
- [ ] Remove models from personal "My Models" list
- [ ] Set one model as default for new chats
- [ ] Model dropdown shows only "My Models" (not all fetched models)
- [ ] Selected model in dropdown is used for chat requests

### Out of Scope

- Model pulling from cloud to local — v1 only shows status, doesn't trigger pulls
- Usage quotas or rate limiting per model — not needed for v1
- Custom model configurations (temperature, etc) — keep it simple
- Cross-device sync of model lists — local only for v1

## Context

This is a brownfield refactor of an existing Electron desktop app (Claw). The codebase uses:
- React 19 + TypeScript for UI
- Jotai for state management
- tRPC for main/renderer communication
- Ollama integration already exists with API fetching

Current behavior: All fetched Ollama models appear in the dropdown. Users can manually add models via a dialog, but there's no browsing of available cloud models.

Desired behavior: Two distinct lists in Settings > Models:
1. "Available Cloud Models" — all models from ollama.com/library that aren't in user's list
2. "My Models" — user's curated list that appears in chat dropdown

## Constraints

- **Tech stack**: Must use existing React/Jotai/tRPC patterns
- **Compatibility**: Must maintain backward compatibility with existing `ollamaModels` config
- **Scope**: Frontend-only changes, no backend API modifications needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two-list UI (Cloud vs My) | Clear separation between discovery and curation | — Pending |
| Dropdown shows My Models only | Reduces noise, matches user intent | — Pending |
| Default model setting | Users want a preferred model for new chats | — Pending |

---
*Last updated: 2026-02-07 after project initialization*
