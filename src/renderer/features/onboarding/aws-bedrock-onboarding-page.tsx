"use client"

import { useSetAtom } from "jotai"
import { ChevronLeft, Copy, ExternalLink, Check, Loader2 } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"

import { Logo } from "../../components/ui/logo"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { billingMethodAtom, awsBedrockOnboardingCompletedAtom } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"

interface DeviceAuthState {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export function AwsBedrockOnboardingPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setAwsBedrockOnboardingCompleted = useSetAtom(awsBedrockOnboardingCompletedAtom)

  const [ssoStartUrl, setSsoStartUrl] = useState("https://d-9067694978.awsapps.com/start")
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthState | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Check AWS connection status
  const { data: awsStatus, refetch: refetchStatus } = trpc.awsSso.getStatus.useQuery(undefined, {
    refetchInterval: false,
  })

  // Device auth mutations
  const startDeviceAuthMutation = trpc.awsSso.startDeviceAuth.useMutation()
  const pollDeviceAuthMutation = trpc.awsSso.pollDeviceAuth.useMutation()
  const updateSettingsMutation = trpc.claudeSettings.updateSettings.useMutation()

  // Auto-complete onboarding when AWS is connected and has credentials
  useEffect(() => {
    if (awsStatus?.authenticated && awsStatus?.hasCredentials) {
      setAwsBedrockOnboardingCompleted(true)
    }
  }, [awsStatus, setAwsBedrockOnboardingCompleted])

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const handleBack = () => {
    setBillingMethod(null)
    stopPolling()
  }

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setDeviceAuth(null)
    setIsAuthenticating(false)
    setCodeCopied(false)
  }, [])

  const handleCopyCode = async () => {
    if (deviceAuth?.userCode) {
      try {
        await navigator.clipboard.writeText(deviceAuth.userCode)
        setCodeCopied(true)
        toast.success("Code copied to clipboard")
        setTimeout(() => setCodeCopied(false), 2000)
      } catch (err) {
        toast.error("Failed to copy code")
      }
    }
  }

  const handleOpenBrowser = () => {
    if (deviceAuth?.verificationUriComplete) {
      window.open(deviceAuth.verificationUriComplete, "_blank")
    }
  }

  const handleConnect = async () => {
    if (!ssoStartUrl.trim()) {
      toast.error("Please enter SSO start URL")
      return
    }

    setIsAuthenticating(true)

    try {
      // Set auth mode to AWS
      await updateSettingsMutation.mutateAsync({
        authMode: "aws",
      })

      // Start device authorization flow
      const result = await startDeviceAuthMutation.mutateAsync({
        ssoStartUrl: ssoStartUrl.trim(),
        ssoRegion: "us-east-1",
      })

      setDeviceAuth(result)
      setCodeCopied(true) // Code was auto-copied
      toast.success("Code copied to clipboard! Complete sign-in in browser.")

      // Start polling for completion
      const pollInterval = Math.max(result.interval, 5) * 1000 // At least 5 seconds
      const expiresAt = Date.now() + result.expiresIn * 1000

      pollingRef.current = setInterval(async () => {
        // Check if expired
        if (Date.now() > expiresAt) {
          stopPolling()
          toast.error("Device authorization expired. Please try again.")
          return
        }

        try {
          const pollResult = await pollDeviceAuthMutation.mutateAsync({
            deviceCode: result.deviceCode,
          })

          if (pollResult.status === "success") {
            stopPolling()
            toast.success("Successfully connected to AWS!")
            await refetchStatus()

            // Complete onboarding
            setTimeout(() => {
              setAwsBedrockOnboardingCompleted(true)
            }, 1000)
          } else if (pollResult.status === "expired") {
            stopPolling()
            toast.error("Authorization expired. Please try again.")
          } else if (pollResult.status === "denied") {
            stopPolling()
            toast.error("Authorization denied. Please try again.")
          }
          // "pending" status - keep polling
        } catch (error) {
          console.error("[aws-sso] Poll error:", error)
          // Don't stop on network errors, keep trying
        }
      }, pollInterval)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start authentication"
      toast.error(message)
      setIsAuthenticating(false)
    }
  }

  const handleCancelAuth = () => {
    stopPolling()
    toast.info("Authentication cancelled")
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10 z-50"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Back button */}
      <div
        className="fixed top-3 left-4 z-50"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Header */}
          <div className="text-center space-y-4">
            <Logo className="w-10 h-10 mx-auto" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Connect to AWS Bedrock
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sign in with AWS SSO to use Claude via Amazon Bedrock
              </p>
            </div>
          </div>

          {/* SSO Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">SSO Start URL</Label>
              <Input
                type="url"
                placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
                value={ssoStartUrl}
                onChange={(e) => setSsoStartUrl(e.target.value)}
                className="font-mono text-xs"
                disabled={isAuthenticating}
              />
              <p className="text-xs text-muted-foreground">
                This is your AWS SSO portal URL from IAM Identity Center
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isAuthenticating || !ssoStartUrl.trim()}
              className="w-full"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for browser sign-in...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect with AWS SSO
                </>
              )}
            </Button>

            {isAuthenticating && (
              <p className="text-xs text-center text-muted-foreground">
                A browser window has opened. Complete the sign-in there.
              </p>
            )}
          </div>

          {/* Connection Status */}
          {awsStatus?.configured && awsStatus?.authenticated && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="w-4 h-4" />
                Connected to AWS
              </div>
              {awsStatus.accountName && (
                <p className="text-xs text-muted-foreground mt-1">
                  {awsStatus.accountName} ({awsStatus.accountId})
                </p>
              )}
            </div>
          )}

          {/* Helper text */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Once connected, you'll be able to select a workspace to start using Claude.
            </p>
          </div>
        </div>
      </div>

      {/* Device Code Modal */}
      <Dialog open={!!deviceAuth} onOpenChange={(open) => !open && handleCancelAuth()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter code in browser</DialogTitle>
            <DialogDescription>
              A browser window has opened. Enter the code below or paste from clipboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* User Code Display */}
            <div className="flex items-center justify-center gap-3">
              <div className="font-mono text-3xl font-bold tracking-widest bg-muted px-6 py-4 rounded-lg">
                {deviceAuth?.userCode}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyCode}
                className="h-12 w-12"
              >
                {codeCopied ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </Button>
            </div>

            {/* Auto-copied indicator */}
            <p className="text-xs text-center text-muted-foreground">
              Code has been automatically copied to your clipboard
            </p>

            {/* Verification URL */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                If the browser didn't open, go to:
              </p>
              <a
                href={deviceAuth?.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline font-mono"
              >
                {deviceAuth?.verificationUri}
              </a>
            </div>

            {/* Status indicator */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Waiting for you to complete sign-in...</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleOpenBrowser}
                className="flex-1"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Browser
              </Button>
              <Button
                variant="ghost"
                onClick={handleCancelAuth}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
