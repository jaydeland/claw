"use client"

import { useAtom } from "jotai"
import { GitBranch, Database, Layers, Wrench, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { selectedAnalysisTypeAtom } from "../atoms"
import { trpc } from "../../../lib/trpc"
import type { AnalysisType } from "../../../../main/lib/trpc/routers/analyzer"

const TABS: { type: AnalysisType; icon: React.ElementType; label: string; description: string }[] = [
  {
    type: "codeflow",
    icon: GitBranch,
    label: "Code",
    description: "Module dependencies and function relationships",
  },
  {
    type: "db",
    icon: Database,
    label: "Database",
    description: "Schema visualization and table relationships",
  },
  {
    type: "architecture",
    icon: Layers,
    label: "Architecture",
    description: "High-level system components and services",
  },
  {
    type: "build",
    icon: Wrench,
    label: "Build",
    description: "Build system, dependencies, and pipeline",
  },
]

interface AnalysisTypeTabsProps {
  projectId?: string
}

export function AnalysisTypeTabs({ projectId }: AnalysisTypeTabsProps) {
  const [selectedType, setSelectedType] = useAtom(selectedAnalysisTypeAtom)

  // Get all diagrams for this project to show status
  const { data: diagrams } = trpc.analyzer.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  )

  const getDiagramStatus = (type: AnalysisType) => {
    if (!diagrams) return "pending"
    const diagram = diagrams.find((d) => d.type === type)
    return diagram?.status || "pending"
  }

  return (
    <div className="flex items-center justify-center gap-1 p-2 bg-muted/30">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isSelected = selectedType === tab.type
        const status = getDiagramStatus(tab.type)

        return (
          <button
            key={tab.type}
            onClick={() => setSelectedType(tab.type)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-150",
              "hover:bg-accent hover:text-accent-foreground",
              isSelected && "bg-accent text-accent-foreground shadow-sm",
              !isSelected && "text-muted-foreground"
            )}
            title={`${tab.label}: ${tab.description}`}
          >
            <div className="relative">
              <Icon className="h-4 w-4" />
              {status === "generating" && (
                <Loader2 className="h-3 w-3 absolute -bottom-1 -right-1 animate-spin text-blue-500" />
              )}
              {status === "complete" && (
                <CheckCircle2 className="h-3 w-3 absolute -bottom-1 -right-1 text-green-500" />
              )}
              {status === "error" && (
                <AlertCircle className="h-3 w-3 absolute -bottom-1 -right-1 text-red-500" />
              )}
            </div>
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
