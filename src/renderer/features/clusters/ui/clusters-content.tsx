"use client"

import { Server } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { TwoPaneLayout } from "../../shared/components/tab-view-layout"
import { ClusterList } from "./cluster-list"
import { ClusterDetail } from "./cluster-detail"

export function ClustersContent() {
  const { data: region } = trpc.clusters.getRegion.useQuery()

  return (
    <TwoPaneLayout
      title={
        <>
          <Server className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold">Kubernetes Clusters</span>
        </>
      }
      headerActions={
        region ? (
          <span className="text-xs text-muted-foreground">
            Region: {region}
          </span>
        ) : null
      }
      leftContent={<ClusterList />}
      centerContent={<ClusterDetail />}
      defaultLeftWidth={25}
      minLeftWidth={200}
      maxLeftWidth={400}
    />
  )
}
