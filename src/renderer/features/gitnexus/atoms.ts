import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Persisted: whether to auto-start servers when GitNexus tab is opened
export const gitnexusAutoStartAtom = atomWithStorage<boolean>("gitnexus:autoStart", true)

// Persisted: selected repo name for GitNexus
export const gitnexusSelectedRepoAtom = atomWithStorage<string | null>("gitnexus:selectedRepo", null)

// Runtime only: progress lines from install subscription
export const gitnexusInstallProgressAtom = atom<string[]>([])

// Runtime only: progress lines from analyzeProject subscription
export const gitnexusAnalyzeProgressAtom = atom<string[]>([])

// Runtime only: whether an analyze run is in progress
export const gitnexusAnalyzingAtom = atom<boolean>(false)

// Runtime only: whether an install run is in progress
export const gitnexusInstallingAtom = atom<boolean>(false)
