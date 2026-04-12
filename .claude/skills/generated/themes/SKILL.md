---
name: themes
description: "Skill for the Themes area of claw. 34 symbols across 9 files."
---

# Themes

34 symbols | 9 files | Cohesion: 88%

## When to Use

- Working with code in `src/`
- Understanding how hexToHSL, isLightColor, generateCSSVariables work
- Modifying themes-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/lib/themes/shiki-theme-loader.ts` | has, loadFullTheme, isShikiBundledTheme, getShikiThemeForHighlighting, ensureThemeLoaded (+3) |
| `src/renderer/lib/themes/vscode-to-css-mapping.ts` | hexToHSL, isLightColor, getColorFromTheme, generateCSSVariables, applyCSSVariables (+2) |
| `src/renderer/lib/themes/diff-view-highlighter.ts` | createCustomDiffHighlighter, getDiffHighlighter, preloadDiffHighlighter, getShikiTheme, getAST (+2) |
| `src/renderer/lib/themes/theme-provider.tsx` | VSCodeThemeProvider, useVSCodeTheme, useTerminalTheme, useShikiTheme |
| `src/renderer/components/dialogs/settings-tabs/agents-appearance-tab.tsx` | useIsNarrowScreen, checkWidth, AgentsAppearanceTab |
| `src/renderer/lib/themes/terminal-theme-mapper.ts` | getColorFromTheme, extractTerminalTheme |
| `src/renderer/features/agents/components/settings-tabs/agents-appearance-tab.tsx` | AgentsAppearanceTab |
| `src/renderer/lib/vscode-themes.ts` | isBuiltinTheme |
| `src/renderer/lib/themes/builtin-themes.ts` | getBuiltinThemeById |

## Entry Points

Start here when exploring this area:

- **`hexToHSL`** (Function) — `src/renderer/lib/themes/vscode-to-css-mapping.ts:195`
- **`isLightColor`** (Function) — `src/renderer/lib/themes/vscode-to-css-mapping.ts:280`
- **`generateCSSVariables`** (Function) — `src/renderer/lib/themes/vscode-to-css-mapping.ts:323`
- **`applyCSSVariables`** (Function) — `src/renderer/lib/themes/vscode-to-css-mapping.ts:345`
- **`removeCSSVariables`** (Function) — `src/renderer/lib/themes/vscode-to-css-mapping.ts:357`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `hexToHSL` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 195 |
| `isLightColor` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 280 |
| `generateCSSVariables` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 323 |
| `applyCSSVariables` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 345 |
| `removeCSSVariables` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 357 |
| `getThemeTypeFromColors` | Function | `src/renderer/lib/themes/vscode-to-css-mapping.ts` | 368 |
| `extractTerminalTheme` | Function | `src/renderer/lib/themes/terminal-theme-mapper.ts` | 105 |
| `VSCodeThemeProvider` | Function | `src/renderer/lib/themes/theme-provider.tsx` | 139 |
| `AgentsAppearanceTab` | Function | `src/renderer/components/dialogs/settings-tabs/agents-appearance-tab.tsx` | 124 |
| `AgentsAppearanceTab` | Function | `src/renderer/features/agents/components/settings-tabs/agents-appearance-tab.tsx` | 67 |
| `isBuiltinTheme` | Function | `src/renderer/lib/vscode-themes.ts` | 51 |
| `loadFullTheme` | Function | `src/renderer/lib/themes/shiki-theme-loader.ts` | 170 |
| `ensureThemeLoaded` | Function | `src/renderer/lib/themes/shiki-theme-loader.ts` | 245 |
| `getBuiltinThemeById` | Function | `src/renderer/lib/themes/builtin-themes.ts` | 1410 |
| `getHighlighter` | Function | `src/renderer/lib/themes/shiki-theme-loader.ts` | 153 |
| `getLoadedThemes` | Function | `src/renderer/lib/themes/shiki-theme-loader.ts` | 333 |
| `createCustomDiffHighlighter` | Function | `src/renderer/lib/themes/diff-view-highlighter.ts` | 186 |
| `getDiffHighlighter` | Function | `src/renderer/lib/themes/diff-view-highlighter.ts` | 273 |
| `preloadDiffHighlighter` | Function | `src/renderer/lib/themes/diff-view-highlighter.ts` | 284 |
| `useVSCodeTheme` | Function | `src/renderer/lib/themes/theme-provider.tsx` | 73 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 1 calls |
| Terminal | 1 calls |

## How to Explore

1. `gitnexus_context({name: "hexToHSL"})` — see callers and callees
2. `gitnexus_query({query: "themes"})` — find related execution flows
3. Read key files listed above for implementation details
