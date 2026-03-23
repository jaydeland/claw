"use client"

import { useState } from "react"
import { Link2, Link2Off, Plus, Trash2, MessageCircle, RefreshCw, Info, Plug } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog"
import { Switch } from "../../ui/switch"
import { cn } from "../../../lib/utils"
import { toast } from "sonner"

interface WhatsAppBridgeManagerProps {
  chatId: string
  subChatId: string
}

export function WhatsAppBridgeManager({ chatId, subChatId }: WhatsAppBridgeManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [existingJid, setExistingJid] = useState("")
  const [isConnectingExisting, setIsConnectingExisting] = useState(false)

  const utils = trpc.useUtils()

  // Fetch the chat details to get the name
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: chatId },
    { enabled: !!chatId }
  )

  // Fetch existing bridges
  const { data: bridgesData, isLoading: isLoadingBridges } = trpc.whatsapp.getBridges.useQuery(
    { chatId },
    { enabled: !!chatId }
  )

  // Mutations
  const createGroup = trpc.whatsapp.createGroup.useMutation({
    onSuccess: (data) => {
      if (data.success && data.groupId) {
        // After group is created, create the bridge
        createBridge.mutate({
          chatId,
          subChatId,
          whatsappJid: data.groupId,
          whatsappGroupName: chatData?.name || "Claw Bridge",
        })
      } else {
        setIsCreating(false)
        toast.error(data.error || "Failed to create WhatsApp group")
      }
    },
    onError: (error) => {
      setIsCreating(false)
      toast.error(error.message || "Failed to create WhatsApp group")
    },
  })

  const createBridge = trpc.whatsapp.createBridge.useMutation({
    onSuccess: (data) => {
      setIsCreating(false)
      if (data.success) {
        toast.success("WhatsApp bridge created successfully")
        utils.whatsapp.getBridges.invalidate({ chatId })
        setIsDialogOpen(false)
      } else {
        toast.error(data.error || "Failed to create bridge")
      }
    },
    onError: (error) => {
      setIsCreating(false)
      toast.error(error.message || "Failed to create bridge")
    },
  })

  const deleteBridge = trpc.whatsapp.deleteBridge.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Bridge removed")
        utils.whatsapp.getBridges.invalidate({ chatId })
      } else {
        toast.error(data.error || "Failed to remove bridge")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove bridge")
    },
  })

  const toggleBridge = trpc.whatsapp.toggleBridge.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.whatsapp.getBridges.invalidate({ chatId })
      } else {
        toast.error(data.error || "Failed to toggle bridge")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to toggle bridge")
    },
  })

  const connectToExisting = trpc.whatsapp.connectToExistingGroup.useMutation({
    onSuccess: (data) => {
      setIsConnectingExisting(false)
      if (data.success) {
        toast.success(`Connected to ${data.name}`)
        utils.whatsapp.getBridges.invalidate({ chatId })
        setIsDialogOpen(false)
        setExistingJid("")
      } else {
        toast.error(data.error || "Failed to connect to group")
      }
    },
    onError: (error) => {
      setIsConnectingExisting(false)
      toast.error(error.message || "Failed to connect to group")
    },
  })

  const handleCreateBridge = () => {
    if (!chatData?.name) {
      toast.error("Chat name not available")
      return
    }

    setIsCreating(true)

    // Auto-create a WhatsApp group with the chat name
    const groupName = chatData.name || "Claw Bridge"
    createGroup.mutate({
      name: groupName,
      description: `Bridge group for Claw chat: ${groupName}`,
    })
  }

  const handleConnectToExisting = () => {
    if (!existingJid.trim()) {
      toast.error("Please enter a WhatsApp group JID")
      return
    }

    setIsConnectingExisting(true)
    connectToExisting.mutate({
      chatId,
      whatsappJid: existingJid.trim(),
    })
  }

  const handleDeleteBridge = (bridgeId: string) => {
    if (confirm("Are you sure you want to remove this bridge?")) {
      deleteBridge.mutate({ bridgeId })
    }
  }

  const bridges = bridgesData?.success && bridgesData.bridges ? bridgesData.bridges : []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">WhatsApp Bridges</span>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Bridge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create WhatsApp Bridge</DialogTitle>
              <DialogDescription>
                Connect this chat to a WhatsApp group.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              {/* Option 1: Create New Group */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Option 1: Create New Group</h4>
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-muted-foreground">
                      <p>A WhatsApp group named "{chatData?.name || 'Claw Bridge'}" will be created</p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleCreateBridge}
                  disabled={isCreating || !chatData?.name}
                  className="w-full"
                >
                  {isCreating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  {isCreating ? "Creating group..." : "Create WhatsApp Group"}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Option 2: Connect to Existing Group */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Option 2: Connect to Existing Group</h4>
                <div className="space-y-2">
                  <Input
                    placeholder="Enter WhatsApp group JID (e.g., 120363426008488970@g.us)"
                    value={existingJid}
                    onChange={(e) => setExistingJid(e.target.value)}
                    disabled={isConnectingExisting}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can find the JID in the logs when a message is received from the group.
                  </p>
                </div>
                <Button
                  onClick={handleConnectToExisting}
                  disabled={isConnectingExisting || !existingJid.trim()}
                  variant="outline"
                  className="w-full"
                >
                  {isConnectingExisting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4 mr-2" />
                  )}
                  {isConnectingExisting ? "Connecting..." : "Connect to Existing Group"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bridges List */}
      <div className="space-y-2">
        {isLoadingBridges ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bridges.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
            No WhatsApp bridges configured.
            <br />
            <span className="text-xs">Click &quot;Add Bridge&quot; to create a WhatsApp group.</span>
          </div>
        ) : (
          bridges.map((bridge) => (
            <div
              key={bridge.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-md border",
                bridge.isActive ? "bg-background" : "bg-muted/50 opacity-60"
              )}
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium">
                    {bridge.whatsappGroupName || "WhatsApp Bridge"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {bridge.whatsappJid}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={bridge.isActive}
                  onCheckedChange={(checked) =>
                    toggleBridge.mutate({ bridgeId: bridge.id, isActive: checked })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleDeleteBridge(bridge.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info */}
      {bridges && bridges.length > 0 && (
        <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
          <p className="font-medium mb-1">How it works:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Messages from bridged WhatsApp groups will appear in this chat</li>
            <li>Messages you send here will be forwarded to the WhatsApp group</li>
            <li>Toggle the switch to enable/disable bridging without removing it</li>
          </ul>
        </div>
      )}
    </div>
  )
}
