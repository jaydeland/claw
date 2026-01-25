/**
 * Standardized Dialog Icons
 *
 * Use these constants throughout the application for consistent dialog UI.
 * All icons are from lucide-react for consistency.
 */

import {
  X,              // Close/dismiss dialogs and full-screen views
  Maximize2,      // Expand to full-screen
  ExternalLink,   // Open in dialog/new window
  Minimize2,      // Collapse/minimize (reserved for future use)
  ChevronLeft,    // Back/previous navigation
  ChevronRight,   // Forward/next navigation (mostly for arrows in lists)
  ChevronDown,    // Expand section
  ChevronUp,      // Collapse section
  ChevronsRight,  // Close sidebar (pointing right to indicate sliding out)
} from "lucide-react"

/**
 * Standard dialog icons with consistent sizing
 */
export const DialogIcons = {
  /** Close button for dialogs, modals, and full-screen views */
  Close: X,

  /** Close button for right sidebars (slides out to the right) */
  CloseSidebar: ChevronsRight,

  /** Open content in a dialog or new window */
  OpenDialog: ExternalLink,

  /** Toggle full-screen mode */
  FullScreen: Maximize2,

  /** Minimize or collapse (reserved for future use) */
  Minimize: Minimize2,

  /** Navigate back or to previous item */
  Back: ChevronLeft,

  /** Navigate forward or to next item */
  Forward: ChevronRight,

  /** Expand a collapsible section */
  ExpandSection: ChevronDown,

  /** Collapse an expanded section */
  CollapseSection: ChevronUp,
} as const

/**
 * Standard icon sizes for different contexts
 */
export const DialogIconSizes = {
  /** Default size for dialog action buttons (close, back, etc.) */
  default: "h-4 w-4",

  /** Larger size for prominent actions or full-screen headers */
  large: "h-5 w-5",

  /** Smaller size for compact UI or nested actions */
  small: "h-3.5 w-3.5",

  /** Tiny size for inline indicators */
  tiny: "h-3 w-3",
} as const

/**
 * Size recommendations by context:
 *
 * - Dialog close buttons: default (h-4 w-4)
 * - Full-screen close buttons: default (h-4 w-4)
 * - Sidebar close buttons: default (h-4 w-4)
 * - Action buttons in headers: small (h-3.5 w-3.5)
 * - Mobile back buttons: large (h-5 w-5)
 * - Section expand/collapse: tiny (h-3 w-3)
 */
