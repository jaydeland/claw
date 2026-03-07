/**
 * Kubernetes service wrapping kubernetesjs with EKS authentication
 * Provides high-level methods for cluster operations
 */
import https from "node:https"
import { KubernetesClient } from "kubernetesjs"
import type { EksClusterInfo } from "../aws/eks-service"

export interface K8sNode {
  name: string
  status: string
  roles: string[]
  version: string
  internalIp: string
  createdAt: Date
}

export interface K8sNamespace {
  name: string
  status: string
  createdAt: Date
}

export interface K8sPod {
  name: string
  namespace: string
  status: string
  ready: string
  restarts: number
  age: Date
  nodeName: string
  containerCount: number
  metadata?: {
    labels?: Record<string, string>
  }
}

export interface K8sDeployment {
  name: string
  namespace: string
  ready: string
  upToDate: number
  available: number
  age: Date
}

export interface K8sService {
  name: string
  namespace: string
  type: string
  clusterIp: string
  externalIp: string
  ports: string
  age: Date
}

export interface K8sPvc {
  name: string
  namespace: string
  status: string
  volume: string
  capacity: string
  accessModes: string
  storageClass: string
  age: Date
}

/**
 * Creates an authenticated Kubernetes client for an EKS cluster
 */
export function createK8sClient(
  cluster: EksClusterInfo,
  token: string
): KubernetesClient {
  // Disable certificate validation for EKS self-signed certificates
  // kubernetesjs doesn't support custom CA certificates, so we have to disable validation
  // Security note: EKS API requests are still authenticated via IAM tokens
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  // kubernetesjs expects just the endpoint URL
  const client = new KubernetesClient({
    restEndpoint: cluster.endpoint,
  })

  // Store the token, endpoint, and CA for use in requests
  // Note: We'll pass them via opts.headers on each request
  ;(client as any)._eksToken = token
  ;(client as any)._eksEndpoint = cluster.endpoint
  ;(client as any)._eksCa = cluster.certificateAuthority

  return client
}

/**
 * Get request options with EKS authentication
 */
export function getAuthOpts(client: KubernetesClient) {
  const token = (client as any)._eksToken
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
    timeout: 30000,
  }
}

/**
 * List all nodes in the cluster
 */
export async function listNodes(client: KubernetesClient): Promise<K8sNode[]> {
  const opts = getAuthOpts(client)
  const response = await client.listCoreV1Node({ query: {} }, opts)

  return (response.items || []).map((node) => {
    const conditions = node.status?.conditions || []
    const readyCondition = conditions.find((c) => c.type === "Ready")
    const status = readyCondition?.status === "True" ? "Ready" : "NotReady"

    // Extract roles from labels
    const labels = node.metadata?.labels || {}
    const roles = Object.keys(labels)
      .filter((key) => key.startsWith("node-role.kubernetes.io/"))
      .map((key) => key.replace("node-role.kubernetes.io/", ""))

    // Get internal IP
    const addresses = node.status?.addresses || []
    const internalIp =
      addresses.find((a) => a.type === "InternalIP")?.address || ""

    return {
      name: node.metadata?.name || "",
      status,
      roles: roles.length > 0 ? roles : ["<none>"],
      version: node.status?.nodeInfo?.kubeletVersion || "",
      internalIp,
      createdAt: node.metadata?.creationTimestamp
        ? new Date(node.metadata.creationTimestamp)
        : new Date(),
    }
  })
}

/**
 * List all namespaces in the cluster
 */
export async function listNamespaces(
  client: KubernetesClient
): Promise<K8sNamespace[]> {
  const opts = getAuthOpts(client)
  const response = await client.listCoreV1Namespace({ query: {} }, opts)

  return (response.items || []).map((ns) => ({
    name: ns.metadata?.name || "",
    status: ns.status?.phase || "Unknown",
    createdAt: ns.metadata?.creationTimestamp
      ? new Date(ns.metadata.creationTimestamp)
      : new Date(),
  }))
}

/**
 * List pods in a namespace
 */
export async function listPods(
  client: KubernetesClient,
  namespace: string
): Promise<K8sPod[]> {
  const opts = getAuthOpts(client)
  const response = await client.listCoreV1NamespacedPod({ path: { namespace }, query: {} }, opts)

  return (response.items || []).map((pod) => {
    const containerStatuses = pod.status?.containerStatuses || []
    const readyCount = containerStatuses.filter((c) => c.ready).length
    const totalCount = containerStatuses.length

    const restarts = containerStatuses.reduce(
      (sum, c) => sum + (c.restartCount || 0),
      0
    )

    return {
      name: pod.metadata?.name || "",
      namespace: pod.metadata?.namespace || namespace,
      status: pod.status?.phase || "Unknown",
      ready: `${readyCount}/${totalCount}`,
      restarts,
      age: pod.metadata?.creationTimestamp
        ? new Date(pod.metadata.creationTimestamp)
        : new Date(),
      nodeName: pod.spec?.nodeName || "",
      containerCount: totalCount,
      metadata: {
        labels: (pod.metadata?.labels || {}) as Record<string, string>,
      },
    }
  })
}

/**
 * List deployments in a namespace
 */
export async function listDeployments(
  client: KubernetesClient,
  namespace: string
): Promise<K8sDeployment[]> {
  const opts = getAuthOpts(client)
  const response = await client.listAppsV1NamespacedDeployment(
    { path: { namespace }, query: {} },
    opts
  )

  return (response.items || []).map((deploy) => {
    const status = deploy.status || {}
    const replicas = status.replicas || 0
    const readyReplicas = status.readyReplicas || 0

    return {
      name: deploy.metadata?.name || "",
      namespace: deploy.metadata?.namespace || namespace,
      ready: `${readyReplicas}/${replicas}`,
      upToDate: status.updatedReplicas || 0,
      available: status.availableReplicas || 0,
      age: deploy.metadata?.creationTimestamp
        ? new Date(deploy.metadata.creationTimestamp)
        : new Date(),
    }
  })
}

/**
 * List services in a namespace
 */
export async function listServices(
  client: KubernetesClient,
  namespace: string
): Promise<K8sService[]> {
  const opts = getAuthOpts(client)
  const response = await client.listCoreV1NamespacedService({ path: { namespace }, query: {} }, opts)

  return (response.items || []).map((svc) => {
    const spec = svc.spec || {}
    const ports = (spec.ports || [])
      .map((p) => `${p.port}/${p.protocol || "TCP"}`)
      .join(", ")

    const externalIps = spec.externalIPs?.join(", ") || ""
    const loadBalancerIp =
      svc.status?.loadBalancer?.ingress?.[0]?.ip ||
      svc.status?.loadBalancer?.ingress?.[0]?.hostname ||
      ""

    return {
      name: svc.metadata?.name || "",
      namespace: svc.metadata?.namespace || namespace,
      type: spec.type || "ClusterIP",
      clusterIp: spec.clusterIP || "",
      externalIp: externalIps || loadBalancerIp || "<none>",
      ports: ports || "<none>",
      age: svc.metadata?.creationTimestamp
        ? new Date(svc.metadata.creationTimestamp)
        : new Date(),
    }
  })
}

/**
 * List PVCs (PersistentVolumeClaims) in a namespace
 */
export async function listPvcs(
  client: KubernetesClient,
  namespace: string
): Promise<K8sPvc[]> {
  const opts = getAuthOpts(client)
  const response = await client.listCoreV1NamespacedPersistentVolumeClaim(
    { path: { namespace }, query: {} },
    opts
  )

  return (response.items || []).map((pvc) => {
    const status = pvc.status?.phase || "Unknown"
    const volumeName = pvc.spec?.volumeName || "<unbound>"
    const capacity = String(pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || "")
    const accessModes = (pvc.spec?.accessModes || []).join(", ")
    const storageClass = pvc.spec?.storageClassName || "<none>"

    return {
      name: pvc.metadata?.name || "",
      namespace: pvc.metadata?.namespace || namespace,
      status,
      volume: volumeName,
      capacity,
      accessModes,
      storageClass,
      age: pvc.metadata?.creationTimestamp
        ? new Date(pvc.metadata.creationTimestamp)
        : new Date(),
    }
  })
}

/**
 * Test cluster connectivity by listing namespaces
 */
export async function testConnection(client: KubernetesClient): Promise<boolean> {
  try {
    await listNamespaces(client)
    return true
  } catch (error) {
    console.error("[kubernetes-service] Connection test failed:", error)
    return false
  }
}

// ============================================================================
// Metrics Server Integration
// ============================================================================

export interface NodeMetric {
  name: string
  cpuMillicores: number
  memoryMi: number
  timestamp: Date
}

export interface PodMetric {
  name: string
  namespace: string
  cpuMillicores: number
  memoryMi: number
  containers: Array<{
    name: string
    cpuMillicores: number
    memoryMi: number
  }>
  timestamp: Date
}

/**
 * Parse CPU from Kubernetes format (e.g., "150m" -> 150, "0.15" -> 150)
 */
function parseCpuMillicores(cpuStr: string | undefined): number {
  if (!cpuStr) return 0
  cpuStr = cpuStr.trim()

  if (cpuStr.endsWith("m")) {
    return parseInt(cpuStr.slice(0, -1), 10) || 0
  } else if (cpuStr.endsWith("n")) {
    // Nanocores: 1000000000n = 1000m
    return Math.round(parseInt(cpuStr.slice(0, -1), 10) / 1000000)
  } else {
    // Assumed to be in cores (e.g., "0.15")
    return Math.round(parseFloat(cpuStr) * 1000)
  }
}

/**
 * Parse memory from Kubernetes format (e.g., "512Mi" -> 512)
 */
function parseMemoryMi(memStr: string | undefined): number {
  if (!memStr) return 0
  memStr = memStr.trim()

  const units: { [key: string]: number } = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1024 * 1024,
    K: 1 / 1000 / 1.024,
    M: 1 / 1.048576,
    G: 1000 / 1.048576,
  }

  for (const [unit, multiplier] of Object.entries(units)) {
    if (memStr.endsWith(unit)) {
      const value = parseInt(memStr.slice(0, -unit.length), 10)
      return Math.round(value * multiplier)
    }
  }

  // Plain bytes
  return Math.round(parseInt(memStr, 10) / (1024 * 1024))
}

/**
 * Check if metrics-server is available in the cluster
 */
export async function checkMetricsAvailable(
  client: KubernetesClient
): Promise<boolean> {
  try {
    const opts = getAuthOpts(client)
    await (client as any).get(
      "/apis/metrics.k8s.io/v1beta1/nodes",
      {},
      undefined,
      { ...opts, timeout: 5000 }
    )
    return true
  } catch (error) {
    console.warn(
      "[kubernetes-service] Metrics-server not available:",
      error instanceof Error ? error.message : "Unknown error"
    )
    return false
  }
}

/**
 * List metrics for all nodes
 */
export async function listNodeMetrics(
  client: KubernetesClient
): Promise<NodeMetric[]> {
  const opts = getAuthOpts(client)

  try {
    const response = await (client as any).get(
      "/apis/metrics.k8s.io/v1beta1/nodes",
      {},
      undefined,
      opts
    )

    return ((response as any).items || [])
      .map((metric: any) => ({
        name: metric.metadata?.name || "",
        cpuMillicores: parseCpuMillicores(metric.usage?.cpu),
        memoryMi: parseMemoryMi(metric.usage?.memory),
        timestamp: new Date(metric.timestamp || new Date()),
      }))
      .sort(
        (a: NodeMetric, b: NodeMetric) =>
          b.cpuMillicores + b.memoryMi - (a.cpuMillicores + a.memoryMi)
      )
  } catch (error) {
    console.error("[kubernetes-service] Failed to fetch node metrics:", error)
    return []
  }
}

/**
 * List metrics for pods in a namespace
 */
export async function listPodMetrics(
  client: KubernetesClient,
  namespace: string
): Promise<PodMetric[]> {
  const opts = getAuthOpts(client)

  try {
    const response = await (client as any).get(
      `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`,
      {},
      undefined,
      opts
    )

    return ((response as any).items || [])
      .map((metric: any) => {
        const containers = (metric.containers || []).map((c: any) => ({
          name: c.name,
          cpuMillicores: parseCpuMillicores(c.usage?.cpu),
          memoryMi: parseMemoryMi(c.usage?.memory),
        }))

        const totalCpu = containers.reduce(
          (sum: number, c: any) => sum + c.cpuMillicores,
          0
        )
        const totalMemory = containers.reduce(
          (sum: number, c: any) => sum + c.memoryMi,
          0
        )

        return {
          name: metric.metadata?.name || "",
          namespace: metric.metadata?.namespace || namespace,
          cpuMillicores: totalCpu,
          memoryMi: totalMemory,
          containers,
          timestamp: new Date(metric.timestamp || new Date()),
        }
      })
      .sort(
        (a: PodMetric, b: PodMetric) =>
          b.cpuMillicores + b.memoryMi - (a.cpuMillicores + a.memoryMi)
      )
  } catch (error) {
    console.error("[kubernetes-service] Failed to fetch pod metrics:", error)
    return []
  }
}

// ============================================================================
// Log Streaming
// ============================================================================

export interface LogEntry {
  timestamp: string
  podName: string
  containerName: string
  message: string
}

/**
 * Stream logs from pods in a namespace
 * @param client - Kubernetes client
 * @param namespace - Namespace to stream logs from
 * @param podNames - Array of pod names to stream logs from
 * @param excludeIstioSidecar - Whether to exclude istio-proxy container logs
 * @param onLog - Callback for each log entry
 * @param onError - Callback for errors
 * @returns Cleanup function to stop streaming
 */
export function streamPodLogs(
  client: KubernetesClient,
  namespace: string,
  podNames: string[],
  excludeIstioSidecar: boolean,
  onLog: (log: LogEntry) => void,
  onError: (error: Error) => void
): () => void {
  const opts = getAuthOpts(client)
  const abortControllers: AbortController[] = []
  let isActive = true

  // Stream logs from each pod
  for (const podName of podNames) {
    streamPodLogsSingle(client, namespace, podName, excludeIstioSidecar, onLog, onError, opts, abortControllers, () => isActive)
  }

  // Return cleanup function
  return () => {
    isActive = false
    abortControllers.forEach(controller => controller.abort())
  }
}

async function streamPodLogsSingle(
  client: KubernetesClient,
  namespace: string,
  podName: string,
  excludeIstioSidecar: boolean,
  onLog: (log: LogEntry) => void,
  onError: (error: Error) => void,
  opts: ReturnType<typeof getAuthOpts>,
  abortControllers: AbortController[],
  isActive: () => boolean
) {
  try {
    // Get pod details to find containers
    const pod = await client.readCoreV1NamespacedPod(
      { path: { name: podName, namespace }, query: {} },
      opts
    )

    const containers = pod.spec?.containers || []

    for (const container of containers) {
      const containerName = container.name

      // Skip istio-proxy if excluded
      if (excludeIstioSidecar && containerName === "istio-proxy") {
        continue
      }

      // Stream logs for this container
      streamContainerLogs(
        client,
        namespace,
        podName,
        containerName,
        onLog,
        onError,
        opts,
        abortControllers,
        isActive
      )
    }
  } catch (error) {
    console.error(`[kubernetes-service] Failed to get pod ${podName}:`, error)
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

async function streamContainerLogs(
  client: KubernetesClient,
  namespace: string,
  podName: string,
  containerName: string,
  onLog: (log: LogEntry) => void,
  onError: (error: Error) => void,
  opts: ReturnType<typeof getAuthOpts>,
  abortControllers: AbortController[],
  isActive: () => boolean
) {
  const abortController = new AbortController()
  abortControllers.push(abortController)

  try {
    // Get the cluster endpoint from the client
    const endpoint = (client as any)._eksEndpoint as string
    if (!endpoint) {
      throw new Error("Cluster endpoint not available on client")
    }
    const url = new URL(endpoint)

    // Build the log streaming path
    const path = `/api/v1/namespaces/${namespace}/pods/${podName}/log?follow=true&container=${containerName}&timestamps=true&tailLines=100`

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path,
      method: "GET",
      headers: opts.headers,
      // Disable certificate validation (same as we do for the main client)
      rejectUnauthorized: false,
    }

    const req = https.request(requestOptions, (res) => {
      let buffer = ""

      res.on("data", (chunk: Buffer) => {
        if (!isActive()) {
          res.destroy()
          return
        }

        buffer += chunk.toString("utf8")
        const lines = buffer.split("\n")

        // Keep the last partial line in the buffer
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.trim()) {
            const logEntry = parseLogLine(line, podName, containerName)
            if (logEntry) {
              onLog(logEntry)
            }
          }
        }
      })

      res.on("error", (err: Error) => {
        if (!abortController.signal.aborted) {
          console.error(`[kubernetes-service] Stream error for ${podName}/${containerName}:`, err)
          onError(err)
        }
      })

      res.on("end", () => {
        // Stream ended, could reconnect if needed
        console.log(`[kubernetes-service] Stream ended for ${podName}/${containerName}`)
      })
    })

    req.on("error", (err: Error) => {
      if (!abortController.signal.aborted) {
        console.error(`[kubernetes-service] Request error for ${podName}/${containerName}:`, err)
        onError(err)
      }
    })

    // Handle abort signal
    abortController.signal.addEventListener("abort", () => {
      req.destroy()
    })

    req.end()
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error(`[kubernetes-service] Failed to stream logs for ${podName}/${containerName}:`, error)
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

/**
 * Parse a log line with timestamp
 * Format: "2024-01-26T10:30:45.123456789Z log message here"
 */
function parseLogLine(line: string, podName: string, containerName: string): LogEntry | null {
  // Match timestamp at the start of the line
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/)

  if (timestampMatch) {
    return {
      timestamp: timestampMatch[1],
      podName,
      containerName,
      message: timestampMatch[2],
    }
  }

  // If no timestamp, use current time
  return {
    timestamp: new Date().toISOString(),
    podName,
    containerName,
    message: line,
  }
}
