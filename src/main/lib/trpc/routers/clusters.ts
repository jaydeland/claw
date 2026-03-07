/**
 * Clusters tRPC router for EKS cluster discovery and Kubernetes operations
 */
import { z } from "zod"
import { exec } from "child_process"
import { promisify } from "util"
import { eq } from "drizzle-orm"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { getDatabase, claudeCodeSettings } from "../../db"
import { EksService, type EksClusterSummary, type EksClusterInfo } from "../../aws/eks-service"
import {
  createK8sClient,
  listNodes,
  listNamespaces,
  listPods,
  listDeployments,
  listServices,
  listPvcs,
  testConnection,
  checkMetricsAvailable,
  listNodeMetrics,
  listPodMetrics,
  streamPodLogs,
  getAuthOpts,
  type K8sNode,
  type K8sNamespace,
  type K8sPod,
  type K8sDeployment,
  type K8sService,
  type K8sPvc,
  type NodeMetric,
  type PodMetric,
  type LogEntry,
} from "../../kubernetes/kubernetes-service"
import { decrypt, type AwsCredentials } from "../../aws/sso-service"

const execAsync = promisify(exec)

// Cache for EKS service instances (keyed by region)
const eksServiceCache = new Map<string, EksService>()

/**
 * Get stored AWS credentials from database (decrypted)
 */
function getStoredCredentials(): AwsCredentials | null {
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  // Need all three credential fields for EKS access
  if (!settings?.awsAccessKeyId || !settings?.awsSecretAccessKey || !settings?.awsSessionToken) {
    console.log("[clusters] AWS credentials not complete in database:", {
      hasAccessKey: !!settings?.awsAccessKeyId,
      hasSecretKey: !!settings?.awsSecretAccessKey,
      hasSessionToken: !!settings?.awsSessionToken,
    })
    return null
  }

  // Decrypt credentials before returning
  try {
    return {
      accessKeyId: decrypt(settings.awsAccessKeyId),
      secretAccessKey: decrypt(settings.awsSecretAccessKey),
      sessionToken: decrypt(settings.awsSessionToken),
      expiration: settings.awsCredentialsExpiresAt || new Date(),
    }
  } catch (error) {
    console.error("[clusters] Failed to decrypt AWS credentials:", error)
    return null
  }
}

/**
 * Get or create EKS service for a region
 * Supports both SSO mode (explicit credentials) and Profile mode (default credential chain)
 */
function getEksService(region: string): EksService | null {
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  const connectionMethod = settings?.bedrockConnectionMethod || "profile"

  // Profile mode - use default AWS credential chain
  if (connectionMethod === "profile") {
    const profileName = settings?.awsProfileName || undefined
    const cacheKey = `${region}-profile-${profileName || "default"}`
    let service = eksServiceCache.get(cacheKey)

    if (!service) {
      console.log(`[clusters] Using AWS profile mode: ${profileName || "default"}`)
      service = new EksService(region, undefined, profileName)
      eksServiceCache.set(cacheKey, service)
    }

    return service
  }

  // SSO mode - use explicit credentials
  const credentials = getStoredCredentials()
  if (!credentials) {
    console.log("[clusters] SSO credentials not available")
    return null
  }

  // Check if credentials are expired
  if (credentials.expiration < new Date()) {
    console.warn("[clusters] AWS credentials are expired")
    return null
  }

  const cacheKey = `${region}-${credentials.accessKeyId}`
  let service = eksServiceCache.get(cacheKey)

  if (!service) {
    console.log("[clusters] Using AWS SSO mode with explicit credentials")
    service = new EksService(region, credentials)
    eksServiceCache.set(cacheKey, service)
  }

  return service
}

/**
 * Get Git user email for namespace derivation
 */
async function getGitUserEmail(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git config --get user.email")
    return stdout.trim() || null
  } catch {
    return null
  }
}

export const clustersRouter = router({
  /**
   * Check if clusters feature is available (AWS credentials present)
   * Note: AWS credentials can be configured independently of authMode
   * Users can have AWS SSO for Kubernetes even if using OAuth for Claude
   */
  isAvailable: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    // Check if credentials exist in database (even if expired)
    const hasCredentials = !!(
      settings?.awsAccessKeyId &&
      settings?.awsSecretAccessKey &&
      settings?.awsSessionToken
    )

    // Check expiration if credentials exist
    const isExpired = hasCredentials && settings?.awsCredentialsExpiresAt
      ? settings.awsCredentialsExpiresAt < new Date()
      : false

    return {
      available: hasCredentials,
      credentialsExpired: isExpired,
    }
  }),

  /**
   * Get the default region from settings
   */
  getRegion: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    return settings?.bedrockRegion || "us-east-1"
  }),

  /**
   * Discover all EKS clusters in the configured region
   */
  discover: publicProcedure.query(async (): Promise<EksClusterSummary[]> => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    const region = settings?.bedrockRegion || "us-east-1"
    const service = getEksService(region)

    if (!service) {
      console.warn("[clusters] No AWS credentials available")
      return []
    }

    try {
      return await service.discoverClusters()
    } catch (error) {
      // Credential errors mean AWS isn't configured — return empty silently
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes("credentials") || msg.includes("CredentialsProvider")) {
        return []
      }
      console.error("[clusters] Failed to discover clusters:", error)
      throw new Error(`Failed to discover clusters: ${msg}`)
    }
  }),

  /**
   * Get detailed information about a specific cluster
   */
  get: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<EksClusterInfo | null> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const service = getEksService(region)

      if (!service) {
        return null
      }

      try {
        return await service.describeCluster(input.clusterName)
      } catch (error) {
        console.error(`[clusters] Failed to get cluster ${input.clusterName}:`, error)
        return null
      }
    }),

  /**
   * Get cluster connection status
   */
  getStatus: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<{ connected: boolean; error?: string }> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        return { connected: false, error: "No AWS credentials available" }
      }

      try {
        // Get cluster info and generate token
        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)

        // Create K8s client and test connection
        const k8sClient = createK8sClient(cluster, token)
        const connected = await testConnection(k8sClient)

        return { connected }
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Connection failed",
        }
      }
    }),

  /**
   * List nodes in a cluster
   */
  getNodes: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<K8sNode[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listNodes(k8sClient)
    }),

  /**
   * List namespaces in a cluster
   */
  getNamespaces: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<K8sNamespace[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listNamespaces(k8sClient)
    }),

  /**
   * List pods in a namespace
   */
  getPods: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<K8sPod[]> => {
      try {
        const db = getDatabase()
        const settings = db
          .select()
          .from(claudeCodeSettings)
          .where(eq(claudeCodeSettings.id, "default"))
          .get()

        const region = settings?.bedrockRegion || "us-east-1"
        const eksService = getEksService(region)

        if (!eksService) {
          throw new Error("No AWS credentials available")
        }

        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)
        const k8sClient = createK8sClient(cluster, token)

        return await listPods(k8sClient, input.namespace)
      } catch (error) {
        console.error(`[clusters] Failed to list pods in namespace ${input.namespace}:`, error)
        throw new Error(`Failed to list pods: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }),

  /**
   * List deployments in a namespace
   */
  getDeployments: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<K8sDeployment[]> => {
      try {
        const db = getDatabase()
        const settings = db
          .select()
          .from(claudeCodeSettings)
          .where(eq(claudeCodeSettings.id, "default"))
          .get()

        const region = settings?.bedrockRegion || "us-east-1"
        const eksService = getEksService(region)

        if (!eksService) {
          throw new Error("No AWS credentials available")
        }

        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)
        const k8sClient = createK8sClient(cluster, token)

        return await listDeployments(k8sClient, input.namespace)
      } catch (error) {
        console.error(`[clusters] Failed to list deployments in namespace ${input.namespace}:`, error)
        throw new Error(`Failed to list deployments: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }),

  /**
   * List services in a namespace
   */
  getServices: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<K8sService[]> => {
      try {
        const db = getDatabase()
        const settings = db
          .select()
          .from(claudeCodeSettings)
          .where(eq(claudeCodeSettings.id, "default"))
          .get()

        const region = settings?.bedrockRegion || "us-east-1"
        const eksService = getEksService(region)

        if (!eksService) {
          throw new Error("No AWS credentials available")
        }

        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)
        const k8sClient = createK8sClient(cluster, token)

        return await listServices(k8sClient, input.namespace)
      } catch (error) {
        console.error(`[clusters] Failed to list services in namespace ${input.namespace}:`, error)
        throw new Error(`Failed to list services: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }),

  /**
   * List PVCs (PersistentVolumeClaims) in a namespace
   */
  getPvcs: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<K8sPvc[]> => {
      try {
        const db = getDatabase()
        const settings = db
          .select()
          .from(claudeCodeSettings)
          .where(eq(claudeCodeSettings.id, "default"))
          .get()

        const region = settings?.bedrockRegion || "us-east-1"
        const eksService = getEksService(region)

        if (!eksService) {
          throw new Error("No AWS credentials available")
        }

        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)
        const k8sClient = createK8sClient(cluster, token)

        return await listPvcs(k8sClient, input.namespace)
      } catch (error) {
        console.error(`[clusters] Failed to list PVCs in namespace ${input.namespace}:`, error)
        throw new Error(`Failed to list PVCs: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }),

  /**
   * Derive default namespace from email environment variables or git config
   * Pattern: john.doe@example.com → johndoe
   */
  getDefaultNamespace: publicProcedure.query(async (): Promise<string | null> => {
    // Priority: DEVELOPER_EMAIL > GITHUB_EMAIL > git config user.email
    const email =
      process.env.DEVELOPER_EMAIL ||
      process.env.GITHUB_EMAIL ||
      (await getGitUserEmail())

    if (!email) {
      return null
    }

    // Extract username before @, remove dots
    // john.doe@example.com → johndoe
    const namespace = email.split("@")[0].replace(/\./g, "")
    return namespace
  }),

  // ============================================================================
  // Metrics Server Procedures
  // ============================================================================

  /**
   * Check if metrics-server is available in the cluster
   */
  checkMetricsAvailable: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<{ available: boolean; error?: string }> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        return { available: false, error: "No AWS credentials available" }
      }

      try {
        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)
        const k8sClient = createK8sClient(cluster, token)

        const available = await checkMetricsAvailable(k8sClient)
        return { available }
      } catch (error) {
        return {
          available: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    }),

  /**
   * Get node metrics (CPU/Memory usage)
   */
  getNodeMetrics: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<NodeMetric[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listNodeMetrics(k8sClient)
    }),

  /**
   * Get pod metrics in a namespace (CPU/Memory usage)
   */
  getPodMetrics: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<PodMetric[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listPodMetrics(k8sClient, input.namespace)
    }),

  /**
   * Stream logs from pods in a namespace
   */
  streamLogs: publicProcedure
    .input(
      z.object({
        clusterName: z.string(),
        namespace: z.string(),
        services: z.array(z.string()),
        excludeIstioSidecar: z.boolean().default(true),
      })
    )
    .subscription(({ input }) => {
      return observable<LogEntry>((emit) => {
        let cleanup: (() => void) | null = null

        const startStreaming = async () => {
          try {
            const db = getDatabase()
            const settings = db
              .select()
              .from(claudeCodeSettings)
              .where(eq(claudeCodeSettings.id, "default"))
              .get()

            const region = settings?.bedrockRegion || "us-east-1"
            const eksService = getEksService(region)

            if (!eksService) {
              emit.error(new Error("No AWS credentials available"))
              return
            }

            // Get cluster and create K8s client
            const cluster = await eksService.describeCluster(input.clusterName)
            const token = await eksService.generateToken(input.clusterName)
            const k8sClient = createK8sClient(cluster, token)

            // Get all pods in the namespace
            const allPods = await listPods(k8sClient, input.namespace)

            // Get service details to match pods by labels
            const services = await listServices(k8sClient, input.namespace)
            const selectedServiceObjs = services.filter(svc =>
              input.services.includes(svc.name)
            )

            // Collect all pods that match any of the selected services
            const servicePods: typeof allPods = []
            const serviceLabels = new Map<string, Record<string, string>>()

            for (const serviceName of input.services) {
              // Try to get the service from the cluster to extract label selectors
              try {
                const svcResponse = await k8sClient.readCoreV1NamespacedService(
                  { path: { name: serviceName, namespace: input.namespace }, query: {} },
                  getAuthOpts(k8sClient)
                )

                const selector = svcResponse.spec?.selector || {}
                if (Object.keys(selector).length > 0) {
                  serviceLabels.set(serviceName, selector as Record<string, string>)
                }
              } catch (error) {
                console.warn(`[clusters] Could not get service ${serviceName}:`, error)
                // Fall back to name-based matching for this service
              }
            }

            // Filter pods by service label selectors
            for (const pod of allPods) {
              const podLabels = pod.metadata?.labels || {}
              let podMatched = false

              // Check if pod matches any service's label selector
              for (const [serviceName, selector] of serviceLabels) {
                const matches = Object.entries(selector).every(([key, value]) =>
                  podLabels[key] === value
                )

                if (matches) {
                  servicePods.push(pod)
                  podMatched = true
                  break
                }
              }

              // Fallback: also check name prefix for services without selectors
              if (!podMatched) {
                const matchesByName = input.services.some(svc =>
                  pod.name.startsWith(svc) || pod.name.startsWith(`${svc}-`)
                )
                if (matchesByName) {
                  servicePods.push(pod)
                }
              }
            }

            console.log(`[clusters] Found ${servicePods.length} pods matching services ${input.services.join(", ")} (out of ${allPods.length} total pods)`)

            if (servicePods.length === 0) {
              const errorMsg = `No pods found for services: ${input.services.join(", ")}. ` +
                `Make sure the services exist and have running pods in namespace "${input.namespace}". ` +
                `Available services: ${services.map(s => s.name).join(", ")}`
              console.warn("[clusters]", errorMsg)
              emit.error(new Error(errorMsg))
              return
            }

            const podNames = servicePods.map((p) => p.name)

            console.log(`[clusters] Starting log stream for ${podNames.length} pods: ${podNames.join(", ")}`)

            // Start streaming logs
            cleanup = streamPodLogs(
              k8sClient,
              input.namespace,
              podNames,
              input.excludeIstioSidecar,
              (log) => {
                emit.next(log)
              },
              (error) => {
                console.error("[clusters] Log stream error:", error)
                emit.error(error)
              }
            )
          } catch (error) {
            console.error("[clusters] Failed to start log streaming:", error)
            emit.error(
              error instanceof Error
                ? error
                : new Error("Failed to start log streaming")
            )
          }
        }

        // Start streaming
        startStreaming()

        // Cleanup function
        return () => {
          console.log("[clusters] Stopping log stream")
          if (cleanup) {
            cleanup()
          }
        }
      })
    }),
})
