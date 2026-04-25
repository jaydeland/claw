---
name: hotkeys
description: "Skill for the Hotkeys area of claw. 21 symbols across 3 files."
---

# Hotkeys

21 symbols | 3 files | Cohesion: 89%

## When to Use

- Working with code in `src/`
- Understanding how getShortcutsByCategory, getShortcutAction, keysToHotkeyString work
- Modifying hotkeys-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/lib/hotkeys/shortcut-registry.ts` | getShortcutsByCategory, getShortcutAction, keysToHotkeyString, hotkeyStringToKeys, getResolvedHotkey (+7) |
| `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | isModifier, eventKeyToInternal, keyToDisplay, buildHotkeyString, buildDisplayString (+1) |
| `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` | ShortcutListItem, ShortcutDetailPanel, AgentsKeyboardTab |

## Entry Points

Start here when exploring this area:

- **`getShortcutsByCategory`** (Function) — `src/renderer/lib/hotkeys/shortcut-registry.ts:166`
- **`getShortcutAction`** (Function) — `src/renderer/lib/hotkeys/shortcut-registry.ts:177`
- **`keysToHotkeyString`** (Function) — `src/renderer/lib/hotkeys/shortcut-registry.ts:185`
- **`hotkeyStringToKeys`** (Function) — `src/renderer/lib/hotkeys/shortcut-registry.ts:193`
- **`getResolvedHotkey`** (Function) — `src/renderer/lib/hotkeys/shortcut-registry.ts:207`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getShortcutsByCategory` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 166 |
| `getShortcutAction` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 177 |
| `keysToHotkeyString` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 185 |
| `hotkeyStringToKeys` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 193 |
| `getResolvedHotkey` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 207 |
| `getResolvedKeys` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 228 |
| `isCustomHotkey` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 240 |
| `normalizeHotkey` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 251 |
| `detectConflicts` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 281 |
| `AgentsKeyboardTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` | 328 |
| `useHotkeyRecorder` | Function | `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | 151 |
| `keyToDisplay` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 348 |
| `hotkeyToDisplay` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 357 |
| `keysToDisplay` | Function | `src/renderer/lib/hotkeys/shortcut-registry.ts` | 368 |
| `ShortcutListItem` | Function | `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` | 110 |
| `ShortcutDetailPanel` | Function | `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` | 166 |
| `isModifier` | Function | `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | 70 |
| `eventKeyToInternal` | Function | `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | 77 |
| `keyToDisplay` | Function | `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | 93 |
| `buildHotkeyString` | Function | `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` | 100 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `AgentsKeyboardTab → GetShortcutAction` | intra_community | 4 |
| `AgentsKeyboardTab → KeysToHotkeyString` | intra_community | 4 |
| `AgentsKeyboardTab → Set` | cross_community | 4 |
| `AgentsLayout → GetShortcutAction` | cross_community | 4 |
| `AgentsLayout → KeysToHotkeyString` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 3 calls |
| Terminal | 2 calls |

## How to Explore

1. `gitnexus_context({name: "getShortcutsByCategory"})` — see callers and callees
2. `gitnexus_query({query: "hotkeys"})` — find related execution flows
3. Read key files listed above for implementation details
