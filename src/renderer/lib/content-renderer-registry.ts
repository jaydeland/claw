import type { ComponentType } from "react"
import { MermaidBlock } from "../components/mermaid-block"
import { Base64ImageBlock } from "../components/base64-image-block"
import { SVGBlock } from "../components/svg-block"

/**
 * Content Renderer Registry
 *
 * A registry-based system for rendering special content types in code blocks.
 * Supports matching by language tag (e.g., ```mermaid) or content pattern
 * detection for cases where Streamdown doesn't set the language class.
 */

export interface ContentRendererProps {
  code: string
  className?: string
}

export interface ContentRenderer {
  /** Match by language tag (e.g., "mermaid", "svg") */
  languages?: string[]

  /** Match by content pattern (fallback when no language tag) */
  contentPattern?: RegExp

  /** The component to render this content */
  component: ComponentType<ContentRendererProps>

  /** Priority (higher = checked first, default: 0) */
  priority?: number

  /** Human-readable name for debugging */
  name: string
}

// Registry of content renderers - pre-populated with built-in renderers
const contentRendererRegistry: ContentRenderer[] = [
  // Mermaid diagrams - support both language tag and content detection
  {
    name: "mermaid",
    languages: ["mermaid"],
    contentPattern:
      /^(sequenceDiagram|flowchart|graph\s|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|requirementDiagram|sankey|xychart|block)/,
    component: MermaidBlock,
    priority: 10,
  },
  // Base64 embedded images (PNG, JPG, GIF, WebP)
  {
    name: "base64-image",
    contentPattern: /^data:image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,/i,
    component: Base64ImageBlock,
    priority: 10,
  },
  // SVG inline
  {
    name: "svg",
    languages: ["svg"],
    contentPattern: /^<svg[\s>]/i,
    component: SVGBlock,
    priority: 10,
  },
]

/**
 * Register a content renderer
 * Call this during module initialization to add renderers
 */
export function registerContentRenderer(renderer: ContentRenderer): void {
  contentRendererRegistry.push(renderer)
  // Re-sort by priority after adding
  contentRendererRegistry.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/**
 * Find a matching content renderer for the given content
 *
 * @param language - Language tag from code block (e.g., "mermaid")
 * @param content - The actual code content
 * @returns The matching renderer, or null if none found
 */
export function findContentRenderer(
  language: string | undefined,
  content: string
): ContentRenderer | null {
  const trimmedContent = content.trim()

  for (const renderer of contentRendererRegistry) {
    // Check language match first (higher priority)
    if (language && renderer.languages?.includes(language.toLowerCase())) {
      return renderer
    }

    // Fallback to content pattern detection
    // Only use pattern matching when no language is specified
    if (!language && renderer.contentPattern?.test(trimmedContent)) {
      return renderer
    }
  }

  return null
}

/**
 * Get all registered renderers (for debugging)
 */
export function getRegisteredRenderers(): readonly ContentRenderer[] {
  return contentRendererRegistry
}
