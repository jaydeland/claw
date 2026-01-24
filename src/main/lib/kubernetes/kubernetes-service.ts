/**
 * Kubernetes service wrapping kubernetesjs with EKS authentication
 * Provides high-level methods for cluster operations
 */
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

/**
 * Creates an authenticated Kubernetes client for an EKS cluster
 */
export function createK8sClient(
  cluster: EksClusterInfo,
  token: string
): KubernetesClient {
  // kubernetesjs expects just the endpoint URL
  // We need to handle the CA certificate separately via a custom fetch
  const client = new KubernetesClient({
    restEndpoint: cluster.endpoint,
  })

  // Store the token for use in requests
  // Note: We'll pass it via opts.headers on each request
  ;(client as any)._eksToken = token
  ;(client as any)._eksCa = cluster.certificateAuthority

  return client
}

/**
 * Get request options with EKS authentication
 */
function getAuthOpts(client: KubernetesClient) {
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
  const response = await client.listCoreV1Node({}, opts)

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
  const response = await client.listCoreV1Namespace({}, opts)

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
  const response = await client.listCoreV1NamespacedPod({ namespace }, opts)

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
    { namespace },
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
  const response = await client.listCoreV1NamespacedService({ namespace }, opts)

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
