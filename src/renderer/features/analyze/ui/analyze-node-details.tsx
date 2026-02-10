"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FlowNode } from "../atoms"

interface AnalyzeNodeDetailsProps {
  node: FlowNode
  onClose: () => void
}

export function AnalyzeNodeDetails({ node, onClose }: AnalyzeNodeDetailsProps) {
  const { data } = node

  // Helper to render data fields
  const renderField = (key: string, value: unknown) => {
    // Skip internal fields and the label (shown in header)
    if (key === "label" || key === "type") return null

    if (value === null || value === undefined) return null

    // Handle arrays (like columns in database tables)
    if (Array.isArray(value)) {
      return (
        <div key={key} className="mb-4">
          <h4 className="text-sm font-semibold capitalize mb-2">{key}</h4>
          <div className="bg-muted rounded-md p-2">
            {value.map((item, index) => (
              <div key={index} className="text-sm py-1 border-b border-border/50 last:border-0">
                {typeof item === "object" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(item).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-muted-foreground">{k}:</span>
                        <span className="font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  String(item)
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Handle objects
    if (typeof value === "object") {
      return (
        <div key={key} className="mb-4">
          <h4 className="text-sm font-semibold capitalize mb-2">{key}</h4>
          <div className="bg-muted rounded-md p-2 text-sm">
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="flex gap-2 py-0.5">
                <span className="text-muted-foreground">{k}:</span>
                <span className="font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Handle primitive values
    return (
      <div key={key} className="mb-3">
        <h4 className="text-sm font-semibold capitalize">{key}</h4>
        <p className="text-sm text-muted-foreground">{String(value)}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold">{(data.label as string) || node.id}</h3>
          {data.type && (
            <span className="text-xs text-muted-foreground capitalize">{String(data.type)}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* Description (prominent) */}
        {data.description && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-1">Description</h4>
            <p className="text-sm text-muted-foreground">{String(data.description)}</p>
          </div>
        )}

        <div className="h-px bg-border my-4" />

        {/* All other data fields */}
        {Object.entries(data).map(([key, value]) => renderField(key, value))}
      </div>
    </div>
  )
}
