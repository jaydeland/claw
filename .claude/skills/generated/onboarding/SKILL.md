---
name: onboarding
description: "Skill for the Onboarding area of claw. 16 symbols across 4 files."
---

# Onboarding

16 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how submitApiKey, handleApiKeyChange, handleApiKeyKeyDown work
- Modifying onboarding-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | isValidCodeFormat, submitCode, handleCodeChange, handleKeyDown, AnthropicOnboardingPage (+3) |
| `src/renderer/features/onboarding/api-key-onboarding-page.tsx` | isValidApiKey, submitApiKey, handleApiKeyChange, handleApiKeyKeyDown |
| `src/renderer/features/onboarding/select-repo-page.tsx` | SelectRepoPage, handleCloneFromGitHub |
| `src/renderer/features/onboarding/aws-bedrock-onboarding-page.tsx` | AwsBedrockOnboardingPage, handleCancelAuth |

## Entry Points

Start here when exploring this area:

- **`submitApiKey`** (Function) — `src/renderer/features/onboarding/api-key-onboarding-page.tsx:59`
- **`handleApiKeyChange`** (Function) — `src/renderer/features/onboarding/api-key-onboarding-page.tsx:98`
- **`handleApiKeyKeyDown`** (Function) — `src/renderer/features/onboarding/api-key-onboarding-page.tsx:108`
- **`isValidCodeFormat`** (Function) — `src/renderer/features/onboarding/anthropic-onboarding-page.tsx:156`
- **`submitCode`** (Function) — `src/renderer/features/onboarding/anthropic-onboarding-page.tsx:219`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `submitApiKey` | Function | `src/renderer/features/onboarding/api-key-onboarding-page.tsx` | 59 |
| `handleApiKeyChange` | Function | `src/renderer/features/onboarding/api-key-onboarding-page.tsx` | 98 |
| `handleApiKeyKeyDown` | Function | `src/renderer/features/onboarding/api-key-onboarding-page.tsx` | 108 |
| `isValidCodeFormat` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 156 |
| `submitCode` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 219 |
| `handleCodeChange` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 242 |
| `handleKeyDown` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 253 |
| `SelectRepoPage` | Function | `src/renderer/features/onboarding/select-repo-page.tsx` | 12 |
| `handleCloneFromGitHub` | Function | `src/renderer/features/onboarding/select-repo-page.tsx` | 91 |
| `AwsBedrockOnboardingPage` | Function | `src/renderer/features/onboarding/aws-bedrock-onboarding-page.tsx` | 30 |
| `handleCancelAuth` | Function | `src/renderer/features/onboarding/aws-bedrock-onboarding-page.tsx` | 173 |
| `AnthropicOnboardingPage` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 35 |
| `formatTokenPreview` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 55 |
| `handleConnectClick` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 161 |
| `handleRejectExistingToken` | Function | `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` | 212 |
| `isValidApiKey` | Function | `src/renderer/features/onboarding/api-key-onboarding-page.tsx` | 20 |

## How to Explore

1. `gitnexus_context({name: "submitApiKey"})` — see callers and callees
2. `gitnexus_query({query: "onboarding"})` — find related execution flows
3. Read key files listed above for implementation details
