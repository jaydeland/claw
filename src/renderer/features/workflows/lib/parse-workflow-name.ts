/**
 * Parsed workflow name structure
 */
export interface ParsedWorkflowName {
  namespace: string | null
  remainder: string // Everything after the namespace separator
  displayName: string // Final display name (after all processing)
  fullName: string // Original full name (cleaned)
}

/**
 * Sub-group within a namespace
 */
export interface WorkflowSubGroup<T> {
  name: string
  items: Array<T & { displayName: string }>
}

/**
 * Hierarchical grouped structure for a namespace
 */
export interface HierarchicalNamespaceGroup<T> {
  namespace: string
  subGroups: WorkflowSubGroup<T>[]
  flatItems: Array<T & { displayName: string }>
  totalCount: number
}

/**
 * Extract namespace from workflow name using FIRST separator
 *
 * Priority order:
 * 1. Colon (:) - Highest priority, explicit namespace
 * 2. Dot (.) - Medium priority, package-style naming
 * 3. Hyphen (-) - Lowest priority
 *
 * Examples:
 * - "/gsd:plan-phase" -> { namespace: "gsd", remainder: "plan-phase" }
 * - "vidyard.work-report" -> { namespace: "vidyard", remainder: "work-report" }
 * - "debug-prod" -> { namespace: "debug", remainder: "prod" }
 * - "plugin:vidyard.debug.prod" -> { namespace: "plugin", remainder: "vidyard.debug.prod" }
 */
export function parseWorkflowName(name: string): ParsedWorkflowName {
  // Remove leading slash if present
  const cleaned = name.startsWith('/') ? name.slice(1) : name

  // Priority 1: Check for colon separator (highest priority)
  const colonIndex = cleaned.indexOf(':')
  if (colonIndex > 0) {
    const namespace = cleaned.slice(0, colonIndex)
    const remainder = cleaned.slice(colonIndex + 1)
    return {
      namespace,
      remainder,
      displayName: remainder,
      fullName: cleaned,
    }
  }

  // Priority 2: Check for dot separator
  const dotIndex = cleaned.indexOf('.')
  if (dotIndex > 0) {
    const namespace = cleaned.slice(0, dotIndex)
    const remainder = cleaned.slice(dotIndex + 1)
    return {
      namespace,
      remainder,
      displayName: remainder,
      fullName: cleaned,
    }
  }

  // Priority 3: Check for hyphen separator
  const hyphenIndex = cleaned.indexOf('-')
  if (hyphenIndex > 0) {
    const namespace = cleaned.slice(0, hyphenIndex)
    const remainder = cleaned.slice(hyphenIndex + 1)
    return {
      namespace,
      remainder,
      displayName: remainder,
      fullName: cleaned,
    }
  }

  // No separator - flat name goes to "General" namespace
  return {
    namespace: null,
    remainder: cleaned,
    displayName: cleaned,
    fullName: cleaned,
  }
}

/**
 * Extract sub-group prefix from a remainder string
 * Looks for the FIRST separator (any of :, ., -) in the remainder
 *
 * Examples:
 * - "plan-phase" -> { prefix: "plan", subName: "phase" }
 * - "debug.prod" -> { prefix: "debug", subName: "prod" }
 * - "execute" -> { prefix: null, subName: "execute" }
 */
function extractSubGroupPrefix(remainder: string): { prefix: string | null; subName: string } {
  // Find all separator positions
  const separators = [
    { char: ':', index: remainder.indexOf(':') },
    { char: '.', index: remainder.indexOf('.') },
    { char: '-', index: remainder.indexOf('-') },
  ].filter(s => s.index > 0)

  if (separators.length === 0) {
    return { prefix: null, subName: remainder }
  }

  // Use the first (leftmost) separator
  const firstSep = separators.reduce((min, curr) =>
    curr.index < min.index ? curr : min
  )

  return {
    prefix: remainder.slice(0, firstSep.index),
    subName: remainder.slice(firstSep.index + 1),
  }
}

/**
 * Group workflows by namespace (flat grouping - for backward compatibility)
 */
export function groupWorkflowsByNamespace<T extends { name: string }>(
  workflows: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {}

  for (const workflow of workflows) {
    const parsed = parseWorkflowName(workflow.name)
    const groupKey = parsed.namespace || 'General'

    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(workflow)
  }

  return groups
}

/**
 * Group workflows hierarchically with sub-groups
 *
 * Algorithm:
 * 1. Group by primary namespace (first separator)
 * 2. Within each namespace, detect common prefixes in remainders
 * 3. If 2+ items share a prefix, create a sub-group
 * 4. Items without common prefixes stay flat
 *
 * Example input:
 * - /gsd:plan-phase
 * - /gsd:plan-milestone
 * - /gsd:plan-verify
 * - /gsd:debug
 * - /gsd:execute-phase
 *
 * Example output:
 * {
 *   namespace: "gsd",
 *   subGroups: [{ name: "plan", items: [phase, milestone, verify] }],
 *   flatItems: [debug, execute-phase],
 *   totalCount: 5
 * }
 */
export function groupWorkflowsHierarchically<T extends { name: string }>(
  workflows: T[]
): HierarchicalNamespaceGroup<T>[] {
  // Step 1: Group by namespace
  const namespaceMap = new Map<string, Array<T & { parsed: ParsedWorkflowName }>>()

  for (const workflow of workflows) {
    const parsed = parseWorkflowName(workflow.name)
    const namespace = parsed.namespace || 'General'

    if (!namespaceMap.has(namespace)) {
      namespaceMap.set(namespace, [])
    }
    namespaceMap.get(namespace)!.push({ ...workflow, parsed })
  }

  // Step 2: Process each namespace to detect sub-groups
  const result: HierarchicalNamespaceGroup<T>[] = []

  for (const [namespace, items] of namespaceMap) {
    // Extract prefix from each item's remainder
    const prefixGroups = new Map<string, Array<T & { parsed: ParsedWorkflowName; subName: string }>>()
    const noPrefix: Array<T & { parsed: ParsedWorkflowName; displayName: string }> = []

    for (const item of items) {
      const { prefix, subName } = extractSubGroupPrefix(item.parsed.remainder)

      if (prefix) {
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, [])
        }
        prefixGroups.get(prefix)!.push({ ...item, subName })
      } else {
        noPrefix.push({ ...item, displayName: item.parsed.remainder })
      }
    }

    // Step 3: Determine which prefixes become sub-groups (2+ items)
    const subGroups: WorkflowSubGroup<T>[] = []
    const flatItems: Array<T & { displayName: string }> = [...noPrefix]

    for (const [prefix, prefixItems] of prefixGroups) {
      if (prefixItems.length >= 2) {
        // Create sub-group
        subGroups.push({
          name: prefix,
          items: prefixItems.map(item => ({
            ...item,
            displayName: item.subName,
          })),
        })
      } else {
        // Single item with prefix goes to flat list with full remainder as display
        for (const item of prefixItems) {
          flatItems.push({ ...item, displayName: item.parsed.remainder })
        }
      }
    }

    // Sort sub-groups by name
    subGroups.sort((a, b) => a.name.localeCompare(b.name))

    // Sort items within sub-groups
    for (const subGroup of subGroups) {
      subGroup.items.sort((a, b) => a.displayName.localeCompare(b.displayName))
    }

    // Sort flat items
    flatItems.sort((a, b) => a.displayName.localeCompare(b.displayName))

    result.push({
      namespace,
      subGroups,
      flatItems,
      totalCount: items.length,
    })
  }

  // Sort namespaces alphabetically, but keep "General" last
  result.sort((a, b) => {
    if (a.namespace === 'General') return 1
    if (b.namespace === 'General') return -1
    return a.namespace.localeCompare(b.namespace)
  })

  return result
}
