/**
 * Parsed workflow name structure
 */
export interface ParsedWorkflowName {
  namespace: string | null
  section: string | null
  name: string
  fullPath: string[]
  displayName: string // Name part only (after namespace/section)
}

/**
 * Parse workflow name into hierarchical structure
 *
 * Supports patterns (in priority order):
 * 1. Colon (:) - Highest priority, explicit namespace
 *    - NAME:SECTION.SUBSECTION → { namespace: NAME, section: SECTION, name: SUBSECTION }
 *    - NAME:ITEM → { namespace: NAME, section: null, name: ITEM }
 * 2. Dot (.) - Medium priority, package-style naming
 *    - NAME.ITEM → { namespace: NAME, section: null, name: ITEM }
 * 3. Underscore (_) - Splits on LAST underscore for group
 *    - NAME-SECTION_ITEM → { namespace: NAME-SECTION, section: null, name: ITEM }
 * 4. Hyphen (-) - Lowest priority, splits on LAST hyphen
 *    - NAME-ITEM → { namespace: NAME, section: null, name: ITEM }
 * 5. No separator - Flat name
 *    - ITEM → { namespace: null, section: null, name: ITEM }
 *
 * Examples:
 * - "/gsd:plan-phase" → { namespace: "gsd", name: "plan-phase" }
 * - "/vidyard.work-report" → { namespace: "vidyard", name: "work-report" }
 * - "/gsd:milestone.audit" → { namespace: "gsd", section: "milestone", name: "audit" }
 * - "/gsd-plan-phase_execute" → { namespace: "gsd-plan-phase", name: "execute" }
 * - "/vidyard-debug_prod" → { namespace: "vidyard-debug", name: "prod" }
 * - "/my-long-name" → { namespace: "my-long", name: "name" }
 */
export function parseWorkflowName(name: string): ParsedWorkflowName {
  // Remove leading slash if present
  const cleaned = name.startsWith('/') ? name.slice(1) : name

  // Priority 1: Check for : separator first (highest priority)
  if (cleaned.includes(':')) {
    const [namespace, rest] = cleaned.split(':', 2)

    // Check for . in rest (three-level: NAME:SECTION.SUBSECTION)
    if (rest.includes('.')) {
      const [section, subsection] = rest.split('.', 2)
      return {
        namespace,
        section,
        name: subsection,
        fullPath: [namespace, section, subsection],
        displayName: subsection,
      }
    }

    return {
      namespace,
      section: null,
      name: rest,
      fullPath: [namespace, rest],
      displayName: rest,
    }
  }

  // Priority 2: Check for . separator
  if (cleaned.includes('.')) {
    const [namespace, rest] = cleaned.split('.', 2)
    return {
      namespace,
      section: null,
      name: rest,
      fullPath: [namespace, rest],
      displayName: rest,
    }
  }

  // Priority 3: Check for underscore pattern (NAME-SECTION_ITEM)
  // Split on LAST underscore to separate group from item
  const underscoreIndex = cleaned.lastIndexOf('_')
  if (underscoreIndex > 0 && underscoreIndex < cleaned.length - 1) {
    const namespace = cleaned.slice(0, underscoreIndex)
    const itemName = cleaned.slice(underscoreIndex + 1)
    return {
      namespace,
      section: null,
      name: itemName,
      fullPath: [namespace, itemName],
      displayName: itemName,
    }
  }

  // Priority 4: Check for hyphen pattern (fallback)
  // Split on LAST hyphen if no other pattern matched
  const hyphenIndex = cleaned.lastIndexOf('-')
  if (hyphenIndex > 0 && hyphenIndex < cleaned.length - 1) {
    const namespace = cleaned.slice(0, hyphenIndex)
    const itemName = cleaned.slice(hyphenIndex + 1)
    return {
      namespace,
      section: null,
      name: itemName,
      fullPath: [namespace, itemName],
      displayName: itemName,
    }
  }

  // No separator - flat name
  return {
    namespace: null,
    section: null,
    name: cleaned,
    fullPath: [cleaned],
    displayName: cleaned,
  }
}

/**
 * Group workflows by namespace
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
