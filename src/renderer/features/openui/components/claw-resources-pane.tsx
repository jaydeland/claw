"use client"

import { memo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  Database,
  FileCode,
  X,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Search,
  Code2,
  Table,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import {
  openUISelectedResourceAtom,
  openUIClawResourcesExpandedAtom,
} from "../atoms"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom } from "../../agents/atoms"

/**
 * Claw Resources Pane - Shows ER Diagram or Source Code Browser
 */
export const ClawResourcesPane = memo(function ClawResourcesPane() {
  const selectedResource = useAtomValue(openUISelectedResourceAtom)
  const setSelectedResource = useSetAtom(openUISelectedResourceAtom)
  const setClawResourcesExpanded = useSetAtom(openUIClawResourcesExpandedAtom)

  // Close resources pane
  const handleClose = () => {
    setSelectedResource(null)
    setClawResourcesExpanded(false)
  }

  if (!selectedResource) return null

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedResource === "er-diagram" && (
            <>
              <Database className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Database ER Diagram
              </span>
            </>
          )}
          {selectedResource === "source-code" && (
            <>
              <FileCode className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Source Code Browser
              </span>
            </>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedResource === "er-diagram" && <ERDiagramViewer />}
        {selectedResource === "source-code" && <SourceCodeBrowser />}
      </div>
    </div>
  )
})

// ============================================
// ER DIAGRAM VIEWER
// ============================================

const ERDiagramViewer = memo(function ERDiagramViewer() {
  const [zoom, setZoom] = useState(100)

  // Get table info from backend
  const { data: schemaInfo } = trpc.projects.getDatabaseSchema.useQuery()

  return (
    <div className="p-4 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 p-2 bg-background rounded-md border">
        <span className="text-xs text-muted-foreground">Zoom:</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setZoom((z) => Math.max(50, z - 10))}
        >
          -
        </Button>
        <span className="text-xs min-w-[3ch] text-center">{zoom}%</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setZoom((z) => Math.min(150, z + 10))}
        >
          +
        </Button>
      </div>

      {/* ER Diagram */}
      <div className="space-y-4">
        {schemaInfo?.tables.map((table) => (
          <div
            key={table.name}
            className="bg-background rounded-md border shadow-sm overflow-hidden"
          >
            {/* Table Header */}
            <div className="bg-muted px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                <Table className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{table.name}</span>
              </div>
            </div>

            {/* Columns */}
            <div className="divide-y">
              {table.columns.map((column) => (
                <div
                  key={column.name}
                  className="px-3 py-2 text-xs grid grid-cols-[1fr_auto] gap-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {column.primaryKey && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">
                        PK
                      </span>
                    )}
                    {column.foreignKey && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500">
                        FK
                      </span>
                    )}
                    <span className={cn(column.primaryKey ? "font-semibold" : "")}>
                      {column.name}
                    </span>
                    <span className="text-muted-foreground italic">{column.type}</span>
                  </div>
                  {column.nullable && (
                    <span className="text-[10px] text-muted-foreground">nullable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Relationships Info */}
      {schemaInfo?.relationships && schemaInfo.relationships.length > 0 && (
        <div className="bg-background rounded-md border p-3">
          <h3 className="text-sm font-semibold mb-2">Relationships</h3>
          <div className="space-y-1">
            {schemaInfo.relationships.map((rel, idx) => (
              <div key={idx} className="text-xs text-muted-foreground">
                <span className="font-medium">{rel.fromTable}</span>
                <span className="mx-1">→</span>
                <span className="font-medium">{rel.toTable}</span>
                <span className="mx-1">via</span>
                <span className="italic">{rel.constraint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// ============================================
// SOURCE CODE BROWSER
// ============================================

const SourceCodeBrowser = memo(function SourceCodeBrowser() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["src"]))
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Get file tree from backend - use selected project path or app root
  const projectPath = selectedProject?.path || app.getAppPath()
  const { data: fileTree } = trpc.projects.getFileTree.useQuery(
    { path: projectPath },
    { retry: false }
  )

  // Filter files by search
  const filterBySearch = (items: typeof fileTree) => {
    if (!items || !searchQuery) return items
    return items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  const renderTree = (items: typeof fileTree, depth = 0) => {
    if (!items) return null

    return items.map((item) => {
      const paddingLeft = depth * 16
      const isExpanded = expandedFolders.has(item.path)

      if (item.type === "directory") {
        return (
          <div key={item.path}>
            <button
              type="button"
              onClick={() => toggleFolder(item.path)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "text-left"
              )}
              style={{ paddingLeft }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Folder className="h-4 w-4 text-yellow-500" />
              <span className="truncate">{item.name}</span>
            </button>
            {isExpanded && item.children && (
              <div>{renderTree(item.children, depth + 1)}</div>
            )}
          </div>
        )
      }

      // File item
      return (
        <button
          type="button"
          key={item.path}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1 text-sm",
            "hover:bg-accent hover:text-accent-foreground",
            "text-left"
          )}
          style={{ paddingLeft: paddingLeft + 20 }}
        >
          <File className="h-4 w-4 text-blue-400" />
          <span className="truncate">{item.name}</span>
        </button>
      )
    })
  }

  return (
    <div className="p-2">
      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-8"
        />
      </div>

      {/* File Tree */}
      <div className="font-mono text-xs">
        {renderTree(filterBySearch(fileTree))}
      </div>
    </div>
  )
})
