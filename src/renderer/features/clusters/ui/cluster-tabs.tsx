"use client"

import { useAtom } from "jotai"
import { LayoutDashboard, Server, ScrollText } from "lucide-react"
import { cn } from "../../../lib/utils"
import { selectedClusterTabAtom, type ClusterTab } from "../atoms"

const tabs: { id: ClusterTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "nodes", label: "Nodes", icon: Server },
  { id: "logs", label: "Logs", icon: ScrollText },
]

export function ClusterTabs() {
  const [selectedTab, setSelectedTab] = useAtom(selectedClusterTabAtom)

  return (
    <div className="flex items-center gap-1 border-b border-border px-4">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isSelected = selectedTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
              "border-b-2 -mb-[1px]",
              isSelected
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
