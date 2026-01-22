"use client"

import { useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { useState, useEffect } from "react"

import { Logo } from "../../components/ui/logo"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { billingMethodAtom, awsBedrockOnboardingCompletedAtom } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import { IconSpinner } from "../../components/ui/icons"

export function AwsBedrockOnboardingPage() {
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const setAwsBedrockOnboardingCompleted = useSetAtom(awsBedrockOnboardingCompletedAtom)

  const [ssoStartUrl, setSsoStartUrl] = useState("https://d-9067694978.awsapps.com/start")
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Check AWS connection status
  const { data: awsStatus } = trpc.awsSso.getStatus.useQuery(undefined, {
    refetchInterval: 2000,
  })

  // Mutations
  const startDeviceAuthMutation = trpc.awsSso.startDeviceAuth.useMutation()
  const updateSettingsMutation = trpc.claudeSettings.updateSettings.useMutation()

  // Auto-complete onboarding when AWS is connected and has credentials
  useEffect(() => {
    if (awsStatus?.authenticated && awsStatus?.hasCredentials) {
      setAwsBedrockOnboardingCompleted(true)
    }
  }, [awsStatus, setAwsBedrockOnboardingCompleted])

  const handleBack = () => {
    setBillingMethod(null)
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

      // Start device authorization
      await startDeviceAuthMutation.mutateAsync({
        ssoStartUrl: ssoStartUrl.trim(),
        ssoRegion: "us-east-1",
      })

      toast.success("Device authorization started. Follow the instructions in the dialog.")
    } catch (error) {
      toast.error(`Failed to start authentication: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsAuthenticating(false)
    }
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
              {isAuthenticating && <IconSpinner className="mr-2 h-4 w-4" />}
              Connect with AWS SSO
            </Button>
          </div>

          {/* Connection Status */}
          {awsStatus?.configured && (
            <div className="text-center">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                ✓ Connected to AWS
              </p>
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
    </div>
  )
}
