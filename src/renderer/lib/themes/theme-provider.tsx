"use client"

/**
 * VS Code Theme Provider
 * 
 * Provides full VS Code theme support for the application:
 * - Applies CSS variables for UI theming
 * - Integrates with Shiki for syntax highlighting
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useTheme } from "next-themes"

import {
  selectedFullThemeIdAtom,
  fullThemeDataAtom,
  systemLightThemeIdAtom,
  systemDarkThemeIdAtom,
  type VSCodeFullTheme,
} from "../atoms"
import {
  generateCSSVariables,
  applyCSSVariables,
  removeCSSVariables,
  getThemeTypeFromColors,
} from "./vscode-to-css-mapping"
import {
  BUILTIN_THEMES,
  getBuiltinThemeById,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
} from "./builtin-themes"

/**
 * Theme context value
 */
interface ThemeContextValue {
  // Current theme
  currentTheme: VSCodeFullTheme | null
  currentThemeId: string | null
  
  // Theme type (light/dark)
  isDark: boolean
  
  
  // All available themes
  allThemes: VSCodeFullTheme[]
  
  // Theme actions
  setThemeById: (id: string | null) => void
  
  // Shiki theme name (for syntax highlighting)
  shikiThemeName: string
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Hook to access the theme context
 */
export function useVSCodeTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useVSCodeTheme must be used within a VSCodeThemeProvider")
  }
  return context
}


interface VSCodeThemeProviderProps {
  children: ReactNode
}

/**
 * VS Code Theme Provider Component
 */
export function VSCodeThemeProvider({ children }: VSCodeThemeProviderProps) {
  const { resolvedTheme, setTheme: setNextTheme } = useTheme()
  
  // Atoms
  const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
  const [fullThemeData, setFullThemeData] = useAtom(fullThemeDataAtom)
  const systemLightThemeId = useAtomValue(systemLightThemeIdAtom)
  const systemDarkThemeId = useAtomValue(systemDarkThemeIdAtom)
  
  // Use builtin themes only
  const allThemes = BUILTIN_THEMES
  
  // Determine if we're in dark mode (from next-themes or theme type)
  const isDark = useMemo(() => {
    if (fullThemeData) {
      return fullThemeData.type === "dark"
    }
    return resolvedTheme === "dark"
  }, [fullThemeData, resolvedTheme])
  
  // Find the current theme by ID (considering system mode)
  const currentTheme = useMemo(() => {
    if (selectedThemeId === null) {
      // System mode - use the appropriate theme based on system preference
      const systemThemeId = resolvedTheme === "dark" ? systemDarkThemeId : systemLightThemeId
      return getBuiltinThemeById(systemThemeId) || null
    }
    return allThemes.find((t) => t.id === selectedThemeId) || null
  }, [selectedThemeId, allThemes, resolvedTheme, systemLightThemeId, systemDarkThemeId])
  
  // Update fullThemeData when theme changes
  useEffect(() => {
    if (currentTheme) {
      setFullThemeData(currentTheme)
    } else {
      setFullThemeData(null)
    }
  }, [currentTheme, setFullThemeData])
  
  // Apply CSS variables when theme changes
  useEffect(() => {
    if (fullThemeData?.colors) {
      // Generate and apply CSS variables
      const cssVars = generateCSSVariables(fullThemeData.colors)
      applyCSSVariables(cssVars)
      
      // For system mode, let next-themes handle the class
      if (selectedThemeId === null) {
        setNextTheme("system")
      } else {
        // Sync next-themes with the theme type
        const themeType = getThemeTypeFromColors(fullThemeData.colors)
        if (themeType === "dark") {
          document.documentElement.classList.add("dark")
          document.documentElement.classList.remove("light")
        } else {
          document.documentElement.classList.remove("dark")
          document.documentElement.classList.add("light")
        }
        setNextTheme(themeType)
      }
    } else {
      // Remove custom CSS variables when no theme is selected
      removeCSSVariables()
    }
    
    return () => {
      // Cleanup on unmount
      removeCSSVariables()
    }
  }, [fullThemeData, selectedThemeId, setNextTheme])
  
  // Get Shiki theme name for syntax highlighting
  const shikiThemeName = useMemo(() => {
    if (fullThemeData) {
      // For builtin themes, use the ID directly (Shiki supports these)
      if (fullThemeData.source === "builtin") {
        return fullThemeData.id
      }
      // For imported/discovered themes, we'd need to load them into Shiki
      // For now, fall back to a compatible theme
      return fullThemeData.type === "dark" ? "github-dark" : "github-light"
    }
    // Default based on system theme
    return isDark ? "github-dark" : "github-light"
  }, [fullThemeData, isDark])
  
  // Theme actions
  const setThemeById = useCallback((id: string | null) => {
    setSelectedThemeId(id)
  }, [setSelectedThemeId])
  
  const contextValue = useMemo((): ThemeContextValue => ({
    currentTheme: fullThemeData,
    currentThemeId: selectedThemeId,
    isDark,
    allThemes,
    setThemeById,
    shikiThemeName,
  }), [
    fullThemeData,
    selectedThemeId,
    isDark,
    allThemes,
    setThemeById,
    shikiThemeName,
  ])
  
  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to get just the Shiki theme name
 */
export function useShikiTheme(): string {
  const { shikiThemeName } = useVSCodeTheme()
  return shikiThemeName
}
