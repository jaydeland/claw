"use client"

import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react"
import { createPortal } from "react-dom"
import { useAtomValue } from "jotai"
import { sessionInfoAtom } from "../../../lib/atoms"
import { IconSpinner } from "../../../components/ui/icons"
import { ChevronRight } from "lucide-react"
import type { SlashCommandOption, SlashTriggerPayload } from "./types"
import {
  filterBuiltinCommands,
  BUILTIN_SLASH_COMMANDS,
} from "./builtin-commands"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"

interface AgentsSlashCommandProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (command: SlashCommandOption) => void
  searchText: string
  position: { top: number; left: number }
  projectPath?: string
  isPlanMode?: boolean
  disabledCommands?: string[]
}

// Memoized to prevent re-renders when parent re-renders
export const AgentsSlashCommand = memo(function AgentsSlashCommand({
  isOpen,
  onClose,
  onSelect,
  searchText,
  position,
  projectPath,
  isPlanMode,
  disabledCommands,
}: AgentsSlashCommandProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const placementRef = useRef<"above" | "below" | null>(null)
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Debounce search text (300ms to match file mention)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // Get SDK-discovered commands from session info
  const sessionInfo = useAtomValue(sessionInfoAtom)

  // Map SDK commands to dropdown format
  const sdkCommands: SlashCommandOption[] = useMemo(() => {
    if (!sessionInfo?.slashCommands) return []

    return sessionInfo.slashCommands.map((cmd) => ({
      id: `sdk:${cmd.source}:${cmd.name}`,
      name: cmd.name,
      command: `/${cmd.name}`,
      description: cmd.description,
      category: "repository" as const,
      argumentHint: cmd.argumentHint,
      source: cmd.source,
    }))
  }, [sessionInfo?.slashCommands])

  // Fallback: Fetch commands from filesystem if SDK hasn't provided them yet
  const { data: fileCommands = [], isLoading } = trpc.commands.list.useQuery(
    { projectPath },
    {
      enabled: isOpen && !sessionInfo?.slashCommands?.length,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  )

  // Transform FileCommand to SlashCommandOption (fallback)
  const fallbackCommands: SlashCommandOption[] = useMemo(() => {
    if (sessionInfo?.slashCommands?.length) return [] // Use SDK commands if available
    return fileCommands.map((cmd) => ({
      id: `custom:${cmd.source}:${cmd.name}`,
      name: cmd.name,
      command: `/${cmd.name}`,
      description: cmd.description || `Custom command from ${cmd.source}`,
      category: "repository" as const,
      path: cmd.path,
      argumentHint: cmd.argumentHint,
    }))
  }, [fileCommands, sessionInfo?.slashCommands])

  // Use SDK commands or fallback to filesystem commands
  const customCommands = sessionInfo?.slashCommands?.length ? sdkCommands : fallbackCommands

  // State for loading command content
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  // tRPC utils for fetching command content
  const trpcUtils = trpc.useUtils()

  // Handle command selection
  const handleSelect = useCallback(
    async (option: SlashCommandOption) => {
      // For builtin commands, call onSelect directly
      if (option.category === "builtin") {
        onSelect(option)
        return
      }

      // For SDK commands, just pass through (SDK handles execution)
      if (option.id.startsWith("sdk:")) {
        onSelect(option)
        return
      }

      // For old-style custom commands with path (fallback), fetch content
      if (option.path) {
        setIsLoadingContent(true)
        try {
          const result = await trpcUtils.commands.getContent.fetch({
            path: option.path,
          })

          // Call onSelect with the fetched prompt
          onSelect({
            ...option,
            prompt: result.content,
          })
        } catch (error) {
          console.error("Failed to fetch slash command content:", error)
          onClose()
        } finally {
          setIsLoadingContent(false)
        }
      } else {
        // Fallback - just call onSelect without prompt
        onSelect(option)
      }
    },
    [onSelect, onClose, trpcUtils],
  )

  // Combine and filter commands, then group hierarchically
  const { hierarchicalGroups, flatOptions } = useMemo(() => {
    let builtinFiltered = filterBuiltinCommands(debouncedSearchText)

    // Hide /plan when already in Plan mode, hide /agent when already in Agent mode
    if (isPlanMode !== undefined) {
      builtinFiltered = builtinFiltered.filter((cmd) => {
        if (isPlanMode && cmd.name === "plan") return false
        if (!isPlanMode && cmd.name === "agent") return false
        return true
      })
    }

    // Filter out disabled commands
    if (disabledCommands && disabledCommands.length > 0) {
      builtinFiltered = builtinFiltered.filter(
        (cmd) => !disabledCommands.includes(cmd.name),
      )
    }

    // Filter custom commands by search
    let customFiltered = customCommands
    if (debouncedSearchText) {
      const query = debouncedSearchText.toLowerCase()
      customFiltered = customCommands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.command.toLowerCase().includes(query),
      )
    }

    // Combine all commands
    const allCommands = [...customFiltered, ...builtinFiltered]

    // Group hierarchically
    const groups = groupWorkflowsHierarchically(allCommands)

    // Flatten for keyboard navigation (build a flat array including group headers)
    const flat: Array<{ type: "command" | "namespace" | "subgroup"; data: any; index: number }> = []
    let cmdIndex = 0

    for (const group of groups) {
      // Add namespace header
      flat.push({ type: "namespace", data: { namespace: group.namespace, count: group.totalCount }, index: cmdIndex++ })

      // Only show contents if expanded or searching
      const groupKey = group.namespace
      if (expandedGroups.has(groupKey) || debouncedSearchText) {
        // Add sub-groups
        for (const subGroup of group.subGroups) {
          flat.push({ type: "subgroup", data: { namespace: group.namespace, name: subGroup.name, count: subGroup.items.length }, index: cmdIndex++ })

          // Only show sub-group items if expanded or searching
          const subGroupKey = `${group.namespace}:${subGroup.name}`
          if (expandedGroups.has(subGroupKey) || debouncedSearchText) {
            for (const item of subGroup.items) {
              flat.push({ type: "command", data: item, index: cmdIndex++ })
            }
          }
        }

        // Add flat items
        for (const item of group.flatItems) {
          flat.push({ type: "command", data: item, index: cmdIndex++ })
        }
      }
    }

    return { hierarchicalGroups: groups, flatOptions: flat }
  }, [debouncedSearchText, customCommands, isPlanMode, disabledCommands, expandedGroups])

  // Toggle group/subgroup expansion
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }, [])

  // Auto-expand all groups when searching
  useEffect(() => {
    if (debouncedSearchText) {
      const allKeys = new Set<string>()
      for (const group of hierarchicalGroups) {
        allKeys.add(group.namespace)
        for (const subGroup of group.subGroups) {
          allKeys.add(`${group.namespace}:${subGroup.name}`)
        }
      }
      setExpandedGroups(allKeys)
    }
  }, [debouncedSearchText, hierarchicalGroups])

  // Track previous values for smarter selection reset
  const prevIsOpenRef = useRef(isOpen)
  const prevSearchRef = useRef(debouncedSearchText)

  // CONSOLIDATED: Single useLayoutEffect for selection management
  useLayoutEffect(() => {
    const didJustOpen = isOpen && !prevIsOpenRef.current
    const didSearchChange = debouncedSearchText !== prevSearchRef.current

    // Reset to first command when opening or search changes
    if (didJustOpen || didSearchChange) {
      // Find first command item (skip headers)
      const firstCmdIndex = flatOptions.findIndex(item => item.type === "command")
      setSelectedIndex(firstCmdIndex >= 0 ? firstCmdIndex : 0)
    }
    // Clamp to valid range if options shrunk
    else if (flatOptions.length > 0 && selectedIndex >= flatOptions.length) {
      setSelectedIndex(Math.max(0, flatOptions.length - 1))
    }

    // Update refs
    prevIsOpenRef.current = isOpen
    prevSearchRef.current = debouncedSearchText
  }, [isOpen, debouncedSearchText, flatOptions.length, selectedIndex, flatOptions])

  // Reset placement when closed
  useEffect(() => {
    if (!isOpen) {
      placementRef.current = null
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          if (flatOptions.length > 0) {
            // Find next command item (skip headers)
            let nextIndex = (selectedIndex + 1) % flatOptions.length
            while (nextIndex !== selectedIndex && flatOptions[nextIndex].type !== "command") {
              nextIndex = (nextIndex + 1) % flatOptions.length
            }
            setSelectedIndex(nextIndex)
          }
          break
        case "ArrowUp":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          if (flatOptions.length > 0) {
            // Find previous command item (skip headers)
            let prevIndex = (selectedIndex - 1 + flatOptions.length) % flatOptions.length
            while (prevIndex !== selectedIndex && flatOptions[prevIndex].type !== "command") {
              prevIndex = (prevIndex - 1 + flatOptions.length) % flatOptions.length
            }
            setSelectedIndex(prevIndex)
          }
          break
        case "ArrowRight":
          // Expand group/subgroup if on header
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          const currentItem = flatOptions[selectedIndex]
          if (currentItem?.type === "namespace") {
            toggleGroup(currentItem.data.namespace)
          } else if (currentItem?.type === "subgroup") {
            toggleGroup(`${currentItem.data.namespace}:${currentItem.data.name}`)
          }
          break
        case "ArrowLeft":
          // Collapse group/subgroup if on header
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          const item = flatOptions[selectedIndex]
          if (item?.type === "namespace") {
            toggleGroup(item.data.namespace)
          } else if (item?.type === "subgroup") {
            toggleGroup(`${item.data.namespace}:${item.data.name}`)
          }
          break
        case "Enter":
          if (e.shiftKey) return
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          const selected = flatOptions[selectedIndex]
          if (selected?.type === "command") {
            handleSelect(selected.data)
          } else if (selected?.type === "namespace") {
            toggleGroup(selected.data.namespace)
          } else if (selected?.type === "subgroup") {
            toggleGroup(`${selected.data.namespace}:${selected.data.name}`)
          }
          break
        case "Escape":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          const tabSelected = flatOptions[selectedIndex]
          if (tabSelected?.type === "command") {
            handleSelect(tabSelected.data)
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [isOpen, flatOptions, selectedIndex, handleSelect, onClose, toggleGroup])

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return

    if (selectedIndex === 0) {
      dropdownRef.current.scrollTo({ top: 0, behavior: "auto" })
      return
    }

    const elements = dropdownRef.current.querySelectorAll("[data-option-index]")
    const selectedElement = elements[selectedIndex] as HTMLElement
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex, isOpen])

  // Click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Calculate dropdown dimensions (matching file mention style)
  const dropdownWidth = 320
  const itemHeight = 28  // h-7 = 28px to match file mention
  const headerHeight = 24
  // Calculate total height based on visible items
  const requestedHeight = Math.min(
    flatOptions.length * itemHeight + 8,
    300,  // Slightly taller for hierarchical view
  )
  const gap = 8

  // Decide placement like Radix Popover (auto-flip top/bottom)
  const safeMargin = 10
  const caretOffsetBelow = 20
  const availableBelow =
    window.innerHeight - (position.top + caretOffsetBelow) - safeMargin
  const availableAbove = position.top - safeMargin

  // Compute desired placement, but lock it for the duration of the open state
  if (placementRef.current === null) {
    const condition1 =
      availableAbove >= requestedHeight && availableBelow < requestedHeight
    const condition2 =
      availableAbove > availableBelow && availableAbove >= requestedHeight
    const shouldPlaceAbove = condition1 || condition2
    placementRef.current = shouldPlaceAbove ? "above" : "below"
  }
  const placeAbove = placementRef.current === "above"

  // Compute final top based on placement
  let finalTop = placeAbove
    ? position.top - gap
    : position.top + gap + caretOffsetBelow

  // Slight left bias to better align with '/'
  const leftOffset = -4
  let finalLeft = position.left + leftOffset

  // Adjust horizontal overflow
  if (finalLeft + dropdownWidth > window.innerWidth - safeMargin) {
    finalLeft = window.innerWidth - dropdownWidth - safeMargin
  }
  if (finalLeft < safeMargin) {
    finalLeft = safeMargin
  }

  // Compute actual maxHeight based on available space on the chosen side
  const computedMaxHeight = Math.max(
    80,
    Math.min(
      requestedHeight,
      placeAbove ? availableAbove - gap : availableBelow - gap,
    ),
  )
  const transformY = placeAbove ? "translateY(-100%)" : "translateY(0)"

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[99999] overflow-y-auto rounded-[10px] border border-border bg-popover py-1 text-xs text-popover-foreground shadow-lg dark [&::-webkit-scrollbar]:hidden"
      style={{
        top: finalTop,
        left: finalLeft,
        width: `${dropdownWidth}px`,
        maxHeight: `${computedMaxHeight}px`,
        transform: transformY,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } as React.CSSProperties}
    >
      {/* Hierarchical command groups */}
      {flatOptions.length > 0 && (
        <>
          {flatOptions.map((item, index) => {
            const isSelected = selectedIndex === index

            // Namespace header
            if (item.type === "namespace") {
              const isExpanded = expandedGroups.has(item.data.namespace) || !!debouncedSearchText
              return (
                <div
                  key={`ns:${item.data.namespace}`}
                  data-option-index={index}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleGroup(item.data.namespace)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "group inline-flex w-[calc(100%-8px)] mx-1 items-center outline-none",
                    "h-6 px-1.5 justify-start text-xs font-medium rounded-md",
                    "transition-colors cursor-pointer select-none",
                    isSelected
                      ? "dark:bg-neutral-800 bg-accent text-foreground"
                      : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform mr-1", isExpanded && "rotate-90")} />
                  <span className="font-semibold">{item.data.namespace}</span>
                  <span className="text-[10px] ml-1.5 opacity-60">({item.data.count})</span>
                </div>
              )
            }

            // Sub-group header
            if (item.type === "subgroup") {
              const groupKey = `${item.data.namespace}:${item.data.name}`
              const isExpanded = expandedGroups.has(groupKey) || !!debouncedSearchText
              return (
                <div
                  key={groupKey}
                  data-option-index={index}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleGroup(groupKey)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "group inline-flex w-[calc(100%-8px)] mx-1 items-center outline-none",
                    "h-6 px-1.5 justify-start text-xs font-medium rounded-md pl-5",
                    "transition-colors cursor-pointer select-none",
                    isSelected
                      ? "dark:bg-neutral-800 bg-accent text-foreground"
                      : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform mr-1", isExpanded && "rotate-90")} />
                  <span>{item.data.name}</span>
                  <span className="text-[10px] ml-1.5 opacity-60">({item.data.count})</span>
                </div>
              )
            }

            // Command item
            const cmd = item.data as SlashCommandOption
            return (
              <div
                key={cmd.id}
                data-option-index={index}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect(cmd)
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "group inline-flex w-[calc(100%-8px)] mx-1 items-center whitespace-nowrap outline-none",
                  "h-7 px-1.5 justify-start text-xs rounded-md",
                  // Indent based on depth (namespace + subgroup or just namespace)
                  item.data.displayName ? "pl-7" : "pl-4",
                  "transition-colors cursor-pointer select-none",
                  isSelected
                    ? "dark:bg-neutral-800 bg-accent text-foreground"
                    : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1 w-full min-w-0">
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    /{item.data.displayName || cmd.name}
                  </span>
                  <span className="text-muted-foreground flex-1 min-w-0 ml-2 overflow-hidden text-[10px] truncate">
                    {cmd.description}
                  </span>
                </span>
              </div>
            )
          })}
        </>
      )}

      {/* Loading state for repository commands */}
      {isLoading && (
        <div className="flex items-center gap-1.5 h-7 px-1.5 mx-1 text-xs text-muted-foreground">
          <IconSpinner className="h-3.5 w-3.5" />
          <span>Loading commands...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && flatOptions.length === 0 && (
        <div className="h-7 px-1.5 mx-1 flex items-center text-xs text-muted-foreground">
          {debouncedSearchText
            ? `No commands matching "${debouncedSearchText}"`
            : "No commands available"}
        </div>
      )}
    </div>,
    document.body
  )
})
