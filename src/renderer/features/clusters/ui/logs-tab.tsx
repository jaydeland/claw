"use client"

import { ScrollText } from "lucide-react"

export function LogsTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
      <div className="p-4 rounded-full bg-muted/50">
        <ScrollText className="h-8 w-8" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-medium text-foreground">Pod Logs</h3>
        <p className="text-sm mt-1">Coming Soon</p>
        <p className="text-xs mt-2 max-w-xs">
          Stream logs from pods in real-time, filter by container, and search through log output.
        </p>
      </div>
    </div>
  )
}
