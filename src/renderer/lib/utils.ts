import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow as dateFnsFormatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDistanceToNow(date: Date | number | string, options?: { addSuffix?: boolean }): string {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return dateFnsFormatDistanceToNow(dateObj, options)
}

// Re-export platform utilities
export { isMacOS as isMac } from "./utils/platform"
