/**
 * Devyard configuration detection and loading
 * Detects if VIDYARD_PATH/devyard exists and provides AWS/Kubernetes configuration
 */
import fs from "node:fs"
import path from "node:path"

export interface DevyardConfig {
  enabled: boolean
  devyardPath?: string
  env?: Record<string, string>
  claudeConfigDir?: string
  claudePluginDir?: string
}

/**
 * Detect if Devyard is available and return its configuration.
 * Checks for $VIDYARD_PATH/devyard directory existence.
 */
export function detectDevyardConfig(): DevyardConfig {
  // Check for VIDYARD_PATH environment variable
  const vidyardPath = process.env.VIDYARD_PATH

  if (!vidyardPath) {
    console.log("[devyard] VIDYARD_PATH not set, skipping Devyard config")
    return { enabled: false }
  }

  const devyardPath = path.join(vidyardPath, "devyard")

  // Check if devyard directory exists
  if (!fs.existsSync(devyardPath)) {
    console.log(`[devyard] Directory not found at ${devyardPath}, skipping`)
    return { enabled: false }
  }

  console.log(`[devyard] Found Devyard at ${devyardPath}`)

  // Claude config directories
  const claudeConfigDir = path.join(devyardPath, "claude")
  const claudePluginDir = path.join(devyardPath, "claude", "plugin")

  // Build environment variables with Devyard paths
  const env: Record<string, string> = {
    // Kubernetes configuration
    KUBECONFIG: path.join(devyardPath, ".kube.config"),

    // AWS profiles
    AWS_PROFILE_OPERATIONS: "SSO-Operations-075505783641",
    AWS_PROFILE_STAGING: "SSO-Staging-075505783641",

    // AWS region
    AWS_REGION: "us-east-1",

    // AWS staging cluster
    AWS_STAGING_CLUSTER: "arn:aws:eks:us-east-1:075505783641:cluster/staging-cluster",

    // AWS credentials and config files
    AWS_SHARED_CREDENTIALS_FILE: path.join(devyardPath, ".aws-creds"),
    AWS_CONFIG_FILE: path.join(devyardPath, ".aws-profile"),

    // Claude configuration directories
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    CLAUDE_PLUGIN_DIR: claudePluginDir,
  }

  // Verify critical files exist
  const kubeconfig = env.KUBECONFIG
  const awsConfig = env.AWS_CONFIG_FILE
  const awsCreds = env.AWS_SHARED_CREDENTIALS_FILE

  const missingFiles: string[] = []

  if (!fs.existsSync(kubeconfig)) {
    missingFiles.push(`KUBECONFIG (${kubeconfig})`)
  }

  if (!fs.existsSync(awsConfig)) {
    missingFiles.push(`AWS_CONFIG_FILE (${awsConfig})`)
  }

  if (!fs.existsSync(awsCreds)) {
    missingFiles.push(`AWS_SHARED_CREDENTIALS_FILE (${awsCreds})`)
  }

  if (missingFiles.length > 0) {
    console.warn(
      `[devyard] Missing configuration files: ${missingFiles.join(", ")}`
    )
    console.warn("[devyard] Devyard config may not work correctly")
  }

  console.log("[devyard] Loaded Devyard configuration:")
  console.log(`[devyard]   KUBECONFIG: ${env.KUBECONFIG}`)
  console.log(`[devyard]   AWS_REGION: ${env.AWS_REGION}`)
  console.log(`[devyard]   AWS_CONFIG_FILE: ${env.AWS_CONFIG_FILE}`)
  console.log(`[devyard]   AWS_SHARED_CREDENTIALS_FILE: ${env.AWS_SHARED_CREDENTIALS_FILE}`)
  console.log(`[devyard]   CLAUDE_CONFIG_DIR: ${env.CLAUDE_CONFIG_DIR}`)
  console.log(`[devyard]   CLAUDE_PLUGIN_DIR: ${env.CLAUDE_PLUGIN_DIR}`)

  return {
    enabled: true,
    devyardPath,
    env,
    claudeConfigDir,
    claudePluginDir,
  }
}

/**
 * Get cached Devyard configuration.
 * Configuration is detected once and cached for the app lifetime.
 */
let cachedConfig: DevyardConfig | null = null

export function getDevyardConfig(): DevyardConfig {
  if (cachedConfig === null) {
    cachedConfig = detectDevyardConfig()
  }
  return cachedConfig
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearDevyardConfigCache(): void {
  cachedConfig = null
}
