---
name: aws
description: "Skill for the Aws area of claw. 31 symbols across 7 files."
---

# Aws

31 symbols | 7 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how createK8sClient, streamPodLogs, startStreaming work
- Modifying aws-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/main/lib/aws/sso-service.ts` | encrypt, AwsSsoService, getRegion, registerClient, getRoleCredentials (+6) |
| `src/main/lib/aws/eks-service.ts` | listClusters, describeCluster, discoverClusters, generateToken, testConnection (+3) |
| `src/main/lib/aws/credentials-file.ts` | getAwsDir, getAwsCredentialsFilePath, getAwsConfigFilePath, writeAwsCredentialsFiles, clearAwsCredentialsFiles |
| `src/main/lib/kubernetes/kubernetes-service.ts` | createK8sClient, streamPodLogs, streamPodLogsSingle |
| `src/main/lib/claude/env.ts` | ensureValidAwsCredentials, getAwsCredentials |
| `src/main/lib/trpc/routers/clusters.ts` | startStreaming |
| `src/main/lib/trpc/routers/aws-sso.ts` | getSsoService |

## Entry Points

Start here when exploring this area:

- **`createK8sClient`** (Function) — `src/main/lib/kubernetes/kubernetes-service.ts:70`
- **`streamPodLogs`** (Function) — `src/main/lib/kubernetes/kubernetes-service.ts:514`
- **`startStreaming`** (Function) — `src/main/lib/trpc/routers/clusters.ts:599`
- **`ensureValidAwsCredentials`** (Function) — `src/main/lib/claude/env.ts:134`
- **`getAwsCredentials`** (Function) — `src/main/lib/claude/env.ts:57`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AwsSsoService` | Class | `src/main/lib/aws/sso-service.ts` | 79 |
| `createK8sClient` | Function | `src/main/lib/kubernetes/kubernetes-service.ts` | 70 |
| `streamPodLogs` | Function | `src/main/lib/kubernetes/kubernetes-service.ts` | 514 |
| `startStreaming` | Function | `src/main/lib/trpc/routers/clusters.ts` | 599 |
| `ensureValidAwsCredentials` | Function | `src/main/lib/claude/env.ts` | 134 |
| `getAwsCredentials` | Function | `src/main/lib/claude/env.ts` | 57 |
| `getAwsCredentialsFilePath` | Function | `src/main/lib/aws/credentials-file.ts` | 8 |
| `getAwsConfigFilePath` | Function | `src/main/lib/aws/credentials-file.ts` | 12 |
| `writeAwsCredentialsFiles` | Function | `src/main/lib/aws/credentials-file.ts` | 24 |
| `clearAwsCredentialsFiles` | Function | `src/main/lib/aws/credentials-file.ts` | 59 |
| `listClusters` | Method | `src/main/lib/aws/eks-service.ts` | 84 |
| `describeCluster` | Method | `src/main/lib/aws/eks-service.ts` | 105 |
| `discoverClusters` | Method | `src/main/lib/aws/eks-service.ts` | 129 |
| `generateToken` | Method | `src/main/lib/aws/eks-service.ts` | 161 |
| `testConnection` | Method | `src/main/lib/aws/eks-service.ts` | 223 |
| `getRegion` | Method | `src/main/lib/aws/sso-service.ts` | 93 |
| `registerClient` | Method | `src/main/lib/aws/sso-service.ts` | 100 |
| `getRoleCredentials` | Method | `src/main/lib/aws/sso-service.ts` | 255 |
| `refreshToken` | Method | `src/main/lib/aws/sso-service.ts` | 284 |
| `startDeviceAuthorization` | Method | `src/main/lib/aws/sso-service.ts` | 123 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `StartStreaming → Flush` | cross_community | 6 |
| `StartStreaming → GetDatabasePath` | cross_community | 5 |
| `StartStreaming → GetMigrationsPath` | cross_community | 5 |
| `StartStreaming → EnsureDefaultHomeWorkspace` | cross_community | 5 |
| `RefreshTask → Decrypt` | cross_community | 5 |
| `RefreshTask → GetAwsDir` | cross_community | 5 |
| `WarmupMcpCache → Decrypt` | cross_community | 4 |
| `WarmupMcpCache → Encrypt` | cross_community | 4 |
| `ExecuteBackgroundTask → Decrypt` | cross_community | 4 |
| `ExecuteBackgroundTask → GetAwsDir` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Kubernetes | 4 calls |
| Routers | 4 calls |
| Scripts | 1 calls |
| Analysis | 1 calls |
| Ui | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createK8sClient"})` — see callers and callees
2. `gitnexus_query({query: "aws"})` — find related execution flows
3. Read key files listed above for implementation details
