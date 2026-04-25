import { Database } from "lucide-react"

export function ErDiagramTabContent() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        <span>Claw DB Schema</span>
      </div>
    </div>
  )
}
