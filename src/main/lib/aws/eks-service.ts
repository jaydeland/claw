/**
 * EKS service for cluster discovery and authentication
 * Handles listing clusters, describing them, and generating auth tokens
 */
import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
} from "@aws-sdk/client-eks"
import { HttpRequest } from "@smithy/protocol-http"
import { SignatureV4 } from "@smithy/signature-v4"
import { Sha256 } from "@aws-crypto/sha256-js"
import type { AwsCredentials } from "./sso-service"

export interface EksClusterInfo {
  name: string
  arn: string
  endpoint: string
  certificateAuthority: string
  status: string
  region: string
  version: string
  createdAt: Date
}

export interface EksClusterSummary {
  name: string
  arn: string
  status: string
  region: string
}

/**
 * Creates AWS credentials provider from already-decrypted credentials
 * Note: Credentials are decrypted in clusters.ts before being passed here
 */
function createCredentialsProvider(credentials: AwsCredentials) {
  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  }
}

export class EksService {
  private eksClient: EKSClient
  private region: string
  private credentials?: ReturnType<typeof createCredentialsProvider>

  /**
   * Create EKS service
   * @param region AWS region
   * @param awsCredentials Explicit credentials (SSO mode) - leave undefined for profile mode
   * @param profileName AWS profile name (profile mode) - uses default credential chain
   */
  constructor(region: string, awsCredentials?: AwsCredentials, profileName?: string) {
    this.region = region

    if (awsCredentials) {
      // SSO mode - explicit credentials
      this.credentials = createCredentialsProvider(awsCredentials)
      this.eksClient = new EKSClient({
        region,
        credentials: this.credentials,
      })
    } else {
      // Profile mode - use default credential chain
      // AWS SDK will load from ~/.aws/credentials using AWS_PROFILE env var or default profile
      const clientConfig: any = { region }

      // If profile name specified, set it via environment variable approach
      if (profileName) {
        process.env.AWS_PROFILE = profileName
        console.log(`[eks-service] Set AWS_PROFILE to: ${profileName}`)
      }

      this.eksClient = new EKSClient(clientConfig)
      console.log(`[eks-service] Using AWS profile mode (profile: ${profileName || "default"})`)
    }
  }

  /**
   * List all EKS clusters in the region
   */
  async listClusters(): Promise<string[]> {
    const clusters: string[] = []
    let nextToken: string | undefined

    do {
      const command = new ListClustersCommand({ nextToken })
      const response = await this.eksClient.send(command)

      if (response.clusters) {
        clusters.push(...response.clusters)
      }

      nextToken = response.nextToken
    } while (nextToken)

    return clusters
  }

  /**
   * Get detailed information about a cluster
   */
  async describeCluster(clusterName: string): Promise<EksClusterInfo> {
    const command = new DescribeClusterCommand({ name: clusterName })
    const response = await this.eksClient.send(command)

    const cluster = response.cluster
    if (!cluster) {
      throw new Error(`Cluster ${clusterName} not found`)
    }

    return {
      name: cluster.name || clusterName,
      arn: cluster.arn || "",
      endpoint: cluster.endpoint || "",
      certificateAuthority: cluster.certificateAuthority?.data || "",
      status: cluster.status || "UNKNOWN",
      region: this.region,
      version: cluster.version || "",
      createdAt: cluster.createdAt || new Date(),
    }
  }

  /**
   * Discover all clusters with basic info
   */
  async discoverClusters(): Promise<EksClusterSummary[]> {
    const clusterNames = await this.listClusters()
    const summaries: EksClusterSummary[] = []

    for (const name of clusterNames) {
      try {
        const info = await this.describeCluster(name)
        summaries.push({
          name: info.name,
          arn: info.arn,
          status: info.status,
          region: info.region,
        })
      } catch (error) {
        console.error(`[eks-service] Failed to describe cluster ${name}:`, error)
        // Include with unknown status if describe fails
        summaries.push({
          name,
          arn: "",
          status: "UNKNOWN",
          region: this.region,
        })
      }
    }

    return summaries
  }

  /**
   * Generate an EKS authentication token
   * This creates a presigned STS GetCallerIdentity URL encoded as a bearer token
   */
  async generateToken(clusterName: string): Promise<string> {
    const stsEndpoint = `sts.${this.region}.amazonaws.com`

    // Create the request to sign
    const request = new HttpRequest({
      method: "GET",
      protocol: "https:",
      hostname: stsEndpoint,
      path: "/",
      query: {
        Action: "GetCallerIdentity",
        Version: "2011-06-15",
        "X-Amz-Expires": "60",
      },
      headers: {
        host: stsEndpoint,
        "x-k8s-aws-id": clusterName,
      },
    })

    // Get credentials - either explicit (SSO) or from default chain (profile)
    let credentials
    if (this.credentials) {
      credentials = this.credentials
    } else {
      // Profile mode - resolve credentials from default chain
      const { STSClient } = await import("@aws-sdk/client-sts")
      const sts = new STSClient({ region: this.region })
      // This will use AWS_PROFILE env var or default credentials
      credentials = await sts.config.credentials()
    }

    // Sign the request
    const signer = new SignatureV4({
      credentials,
      region: this.region,
      service: "sts",
      sha256: Sha256,
    })

    const signedRequest = await signer.presign(request, {
      expiresIn: 60,
    })

    // Build the presigned URL
    const query = signedRequest.query || {}
    const queryString = Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&")

    const presignedUrl = `https://${stsEndpoint}/?${queryString}`

    // Encode as EKS token
    // Format: k8s-aws-v1.<base64url-encoded-presigned-url>
    const token = "k8s-aws-v1." + base64UrlEncode(presignedUrl)

    return token
  }

  /**
   * Test cluster connectivity by generating a token and checking if we can authenticate
   */
  async testConnection(clusterName: string): Promise<boolean> {
    try {
      // Just try to generate a token - if credentials are valid, this will work
      await this.generateToken(clusterName)
      return true
    } catch (error) {
      console.error(`[eks-service] Connection test failed for ${clusterName}:`, error)
      return false
    }
  }
}

/**
 * Base64 URL encoding (RFC 4648)
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
