"use client"

import React, { useState } from "react"
import { Check, AlertCircle, Loader2, QrCode, Trash2, Power, MessageCircle } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import {
  Alert,
  AlertDescription,
} from "../../ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card"
import { WhatsAppQueueStatus } from "./whatsapp-queue-status"
import { WhatsAppBridgeManager } from "./whatsapp-bridge-manager"

export function AgentsWhatsAppTab() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [connectionFailed, setConnectionFailed] = useState(false)

  const utils = trpc.useUtils()

  const { data: status, isLoading: isLoadingStatus } = trpc.whatsapp.getStatus.useQuery(undefined, {
    // Poll every 3 seconds to catch status changes from background processes
    refetchInterval: 3000,
    // Keep polling even when window is in background
    refetchIntervalInBackground: true,
  })
  const connectMutation = trpc.whatsapp.connect.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        setShowQR(false)
      }
      utils.whatsapp.getStatus.invalidate()
    },
    onError: () => {
      setShowQR(false)
    },
  })
  const disconnectMutation = trpc.whatsapp.disconnect.useMutation({
    onSuccess: () => {
      setShowQR(false)
      setQrCode(null)
      utils.whatsapp.getStatus.invalidate()
    },
  })
  const logoutMutation = trpc.whatsapp.logout.useMutation({
    onSuccess: () => {
      setShowQR(false)
      setQrCode(null)
      utils.whatsapp.getStatus.invalidate()
    },
  })

  // Subscribe to QR codes using the proper useSubscription hook
  trpc.whatsapp.onQRCode.useSubscription(undefined, {
    onData: (qr) => {
      if (qr) {
        setQrCode(qr)
        setShowQR(true)
        setConnectionFailed(false)
      } else {
        // null emitted on successful connect OR on permanent failure
        if (showQR && !qrCode) {
          // We were waiting for a QR that never came — connection failed
          setConnectionFailed(true)
        }
        setShowQR(false)
      }
    },
    onError: (err) => {
      console.error("QR subscription error:", err)
    },
  })

  // Subscribe to status changes for real-time UI updates
  trpc.whatsapp.onStatusChange.useSubscription(undefined, {
    onData: (status) => {
      console.log("[WhatsAppTab] Status change received:", status)
      utils.whatsapp.getStatus.invalidate()
    },
    onError: (err) => {
      console.error("Status subscription error:", err)
    },
  })

  const handleConnect = async () => {
    setShowQR(true)
    setQrCode(null)
    setConnectionFailed(false)
    await connectMutation.mutateAsync()
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate()
  }

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout? This will remove the WhatsApp session and you'll need to scan the QR code again.")) {
      logoutMutation.mutate()
    }
  }

  const isConnected = status?.isConnected

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">WhatsApp Integration</h2>
          <p className="text-sm text-muted-foreground">
            Connect Claw to WhatsApp via WhatsApp Web for real-time agent triggers
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>
            WhatsApp connection uses QR code authentication. No API tokens needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <Power className={cn(
                "h-4 w-4",
                isConnected ? "text-green-500" : "text-muted-foreground"
              )} />
              <span className="text-sm font-medium">Status</span>
            </div>
            {isLoadingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : isConnected ? (
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Connected
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Disconnected</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!isConnected ? (
              <Button
                onClick={handleConnect}
                disabled={connectMutation.isPending || showQR}
              >
                {connectMutation.isPending || (showQR && !qrCode) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                {showQR && !qrCode ? "Connecting..." : "Connect WhatsApp"}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Disconnect
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Logout
                </Button>
              </>
            )}
          </div>

          {/* Error Messages */}
          {connectMutation.error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {connectMutation.error.message}
              </AlertDescription>
            </Alert>
          )}
          {connectionFailed && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Failed to connect to WhatsApp. Please try again.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* QR Code Display */}
      {showQR && (
        <Card>
          <CardHeader>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>
              Open WhatsApp on your phone and scan this QR code to connect
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            {qrCode ? (
              <>
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeSVG value={qrCode} size={256} />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
                  </p>
                  <Button variant="outline" size="sm" onClick={() => { setShowQR(false); setQrCode(null) }}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Waiting for QR code...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            WhatsApp integration uses WhatsApp Web protocol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Click &quot;Connect WhatsApp&quot; to generate a QR code</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Open WhatsApp on your phone and scan the QR code</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Claw can now receive messages and trigger agents</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Use chat settings to bridge WhatsApp groups to Claw conversations</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
              <span>Session is saved - you won&apos;t need to scan again unless you logout</span>
            </li>
          </ul>

          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-sm text-yellow-700">
              <strong>Note:</strong> Your phone must remain connected to the internet for WhatsApp Web to work.
              If your phone goes offline, the connection will be lost.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Queue Status */}
      {isConnected && <WhatsAppQueueStatus />}
    </div>
  )
}
