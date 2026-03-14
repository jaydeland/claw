// Copyright 2026 Claw Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// CLAW SELECTION STATE
// ============================================

/** Selected claw for detail/settings view */
export const selectedClawIdAtom = atom<string | null>(null)

/** Selected claw for settings/detail page (when viewing project-style detail) */
export const selectedClawDetailIdAtom = atom<string | null>(null)

/** Selected execution for chat view */
export const selectedClawExecutionAtom = atom<{
  executionId: string
  clawId: string
  clawName: string
  subChatName?: string
} | null>(null)

// ============================================
// SIDEBAR NAVIGATION STATE
// ============================================

/** Expanded claw groups in sidebar tree view */
export const expandedClawIdsAtom = atomWithStorage<Set<string>>(
  "claws:expandedIds",
  new Set(),
  undefined,
  { getOnInit: true }
)

/** Active tab in claw detail page */
export const clawDetailActiveTabAtom = atomWithStorage<string>(
  "claws:activeTab",
  "general", // "general" | "trigger" | "history" | "files"
  undefined,
  { getOnInit: true }
)

/** Search query for filtering claws */
export const clawSearchQueryAtom = atom<string>("")

// ============================================
// FILES TAB STATE
// ============================================

/** Claw files refresh trigger - increment to force re-fetch */
export const clawFilesRefreshAtom = atom<number>(0)

/** Currently editing file in Files tab */
export const editingClawFileAtom = atom<{
  clawId: string
  fileName: string
  fileType: string
} | null>(null)

// ============================================
// TYPE EXPORTS
// ============================================

export type ClawDetailTab = "general" | "trigger" | "history" | "files"
