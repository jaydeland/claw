"use client"

import { useState, useEffect } from "react"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { AwsSsoSection } from "../../../features/agents/components/aws-sso-section"

export function AgentsAwsTab() {
  const [vpnCheckEnabled, setVpnCheckEnabled] = useState(false)
  const [vpnCheckUrl, setVpnCheckUrl] = useState("")
  const [connectionMethod, setConnectionMethod] = useState<"sso" | "profile">("sso")
  const [awsProfileName, setAwsProfileName] = useState("")

  const { data: claudeSettings, refetch: refetchSettings } = trpc.claudeSettings.getSettings.useQuery()

  const updateSettings = trpc.claudeSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("AWS settings saved")
      refetchSettings()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save AWS settings")
    },
  })

  useEffect(() => {
    if (claudeSettings) {
      setVpnCheckEnabled(claudeSettings.vpnCheckEnabled || false)
      setVpnCheckUrl(claudeSettings.vpnCheckUrl || "")
      setConnectionMethod(claudeSettings.bedrockConnectionMethod || "sso")
      setAwsProfileName(claudeSettings.awsProfileName || "")
    }
  }, [claudeSettings])

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">AWS Authentication</h3>
        <p className="text-sm text-muted-foreground">
          Connect to AWS via SSO or a named profile. These credentials are shared across all AWS features.
        </p>
      </div>

      <AwsSsoSection
        hideBedrock
        bedrockRegion=""
        onBedrockRegionChange={() => {}}
        onSave={() => {
          updateSettings.mutate({
            vpnCheckEnabled,
            vpnCheckUrl,
            bedrockConnectionMethod: connectionMethod,
            awsProfileName: connectionMethod === "profile" ? awsProfileName : undefined,
          })
        }}
        isSaving={updateSettings.isPending}
        vpnCheckEnabled={vpnCheckEnabled}
        onVpnCheckEnabledChange={setVpnCheckEnabled}
        vpnCheckUrl={vpnCheckUrl}
        onVpnCheckUrlChange={setVpnCheckUrl}
        connectionMethod={connectionMethod}
        onConnectionMethodChange={setConnectionMethod}
        awsProfileName={awsProfileName}
        onAwsProfileNameChange={setAwsProfileName}
        maxMcpOutputTokens={48000}
        onMaxMcpOutputTokensChange={() => {}}
        maxThinkingTokens={15000}
        onMaxThinkingTokensChange={() => {}}
      />
    </div>
  )
}
