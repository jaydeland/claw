"use client"

import { useState, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Server, ChevronRight, Loader2, Check, X, AlertCircle } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedClusterIdAtom, selectedClustersCategoryAtom } from "../../clusters/atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"

interface ClustersTabContentProps {
  isMobileFullscreen?: boolean
  className?: string
}

function getStatusIcon(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Check className="h-3 w-3 text-emerald-500" />
    case "CREATING":
    case "UPDATING":
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
    case "DELETING":
      return <Loader2 className="h-3 w-3 text-red-500 animate-spin" />
    case "FAILED":
      return <X className="h-3 w-3 text-red-500" />
    default:
      return <AlertCircle className="h-3 w-3 text-muted-foreground" />
  }
}

export function ClustersTabContent({ className, isMobileFullscreen }: ClustersTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const setSelectedCluster = useSetAtom(selectedClusterIdAtom)
  const setSelectedCategory = useSetAtom(selectedClustersCategoryAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)

  // Fetch clusters
  const { data: clusters, isLoading } = trpc.clusters.discover.useQuery()

  // Handle cluster click - opens full-screen clusters view
  const handleClusterClick = (clusterName: string) => {
    setSelectedCluster(clusterName)
    // Switch to full-screen clusters view
    setSelectedCategory("clusters")
    setSelectedChatId(null)
  }

  // Filter clusters by search query
  const filteredClusters = useMemo(() => {
    if (!clusters) return []
    if (!searchQuery.trim()) return clusters

    const query = searchQuery.toLowerCase()
    return clusters.filter(
      (cluster) =>
        cluster.name.toLowerCase().includes(query) ||
        cluster.region.toLowerCase().includes(query)
    )
  }, [clusters, searchQuery])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Input
          placeholder="Search clusters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
            isMobileFullscreen ? "h-10" : "h-7",
          )}
        />
      </div>

      {/* Clusters list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Server className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No clusters found" : "No clusters available"}
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredClusters.map((cluster) => (
              <button
                key={cluster.name}
                onClick={() => handleClusterClick(cluster.name)}
                className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/5 cursor-pointer w-full text-left"
              >
                <Server className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {cluster.name}
                    </span>
                    {getStatusIcon(cluster.status)}
                  </div>
                  {cluster.region && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {cluster.region}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
