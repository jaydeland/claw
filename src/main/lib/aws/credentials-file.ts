import fs from "node:fs"
import path from "node:path"
import { app } from "electron"

function getAwsDir(): string {
  return path.join(app.getPath("userData"), "aws")
}

export function getAwsCredentialsFilePath(): string {
  return path.join(getAwsDir(), "credentials")
}

export function getAwsConfigFilePath(): string {
  return path.join(getAwsDir(), "config")
}

/**
 * Write AWS credentials and config files to the app's userData directory.
 * These files are used by the AWS SDK credential chain in subprocesses
 * (Claude SDK, MCP servers, etc.) via AWS_SHARED_CREDENTIALS_FILE /
 * AWS_CONFIG_FILE environment variables.
 *
 * Files are written with mode 0o600 (owner read/write only).
 */
export function writeAwsCredentialsFiles(opts: {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region?: string
}): void {
  const dir = getAwsDir()
  fs.mkdirSync(dir, { recursive: true })

  const credLines = [
    "[default]",
    `aws_access_key_id = ${opts.accessKeyId}`,
    `aws_secret_access_key = ${opts.secretAccessKey}`,
  ]
  if (opts.sessionToken) {
    credLines.push(`aws_session_token = ${opts.sessionToken}`)
  }

  fs.writeFileSync(getAwsCredentialsFilePath(), credLines.join("\n") + "\n", {
    mode: 0o600,
  })

  if (opts.region) {
    const configLines = ["[default]", `region = ${opts.region}`]
    fs.writeFileSync(getAwsConfigFilePath(), configLines.join("\n") + "\n", {
      mode: 0o600,
    })
  }

  console.log("[aws-credentials-file] Wrote credentials to", getAwsCredentialsFilePath())
}

/**
 * Remove app-managed AWS credentials files (e.g. on logout).
 */
export function clearAwsCredentialsFiles(): void {
  try {
    fs.rmSync(getAwsCredentialsFilePath(), { force: true })
    fs.rmSync(getAwsConfigFilePath(), { force: true })
    console.log("[aws-credentials-file] Cleared credentials files")
  } catch (err) {
    console.warn("[aws-credentials-file] Failed to clear credentials files:", err)
  }
}
