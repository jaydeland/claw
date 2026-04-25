"use client"

import { useState, useEffect } from "react"
import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { IconSpinner } from "../../../../components/ui/icons"
import { toast } from "sonner"
import { Upload, Edit } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "../../../../lib/utils"

// Desktop user interface
interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

// Custom hook for desktop user profile
const useDesktopUserProfile = () => {
  const [user, setUser] = useState<DesktopUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser()
        setUser(userData)
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  return { user, setUser, isLoading }
}

// Stub for image upload (not implemented in desktop yet)
const useImageUpload = () => ({
  previewUrl: null as string | null,
  fileInputRef: { current: null as HTMLInputElement | null },
  handleThumbnailClick: () => {},
  handleFileChange: async (_event?: unknown) => null as string | null,
})

export function AgentsProfileTab() {
  const { user, setUser, isLoading: isUserLoading } = useDesktopUserProfile()
  const [fullName, setFullName] = useState("")
  const [profileImage, setProfileImage] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const { previewUrl, fileInputRef, handleThumbnailClick, handleFileChange } = useImageUpload()

  // Initialize state when user data is loaded
  useEffect(() => {
    if (!isUserLoading && user) {
      setFullName(user.name || "")
      setProfileImage(user.imageUrl || "")
    }
  }, [isUserLoading, user])

  // Update profileImage when previewUrl changes
  useEffect(() => {
    if (previewUrl) {
      setProfileImage(previewUrl)
    }
  }, [previewUrl])

  const handleSave = async () => {
    setIsSaving(true)

    try {
      if (window.desktopApi?.updateUser) {
        const updatedUser = await window.desktopApi.updateUser({ name: fullName })
        if (updatedUser) {
          setUser(updatedUser)
          toast.success("Profile updated successfully")
        }
      } else {
        throw new Error("Desktop API not available")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const base64String = await handleFileChange(event)
    if (base64String) {
      setProfileImage(base64String)
    }
  }

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  const currentImageUrl = previewUrl || profileImage || user?.imageUrl

  return (
    <div className="p-6 space-y-6">
      {/* Profile Settings Card */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-3 mb-4">
          <h3 className="text-sm font-medium text-foreground">Account</h3>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Profile Picture Field */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Profile Picture</Label>
                <p className="text-sm text-muted-foreground">How you&apos;re shown around the app</p>
              </div>
              <div className="flex-shrink-0 relative group">
                {/* Glow effect - blurred image behind */}
                {currentImageUrl && (
                  <div
                    className="absolute inset-0 scale-[1.02] blur-sm opacity-40 transition-opacity duration-200 group-hover:opacity-0 rounded-full"
                    style={{
                      backgroundImage: `url(${currentImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                  className={cn(
                    "w-12 h-12 bg-muted rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity aspect-square relative overflow-hidden",
                    !currentImageUrl && "border-2 border-dashed border-border"
                  )}
                  onClick={handleThumbnailClick}
                >
                  {currentImageUrl ? (
                    <>
                      <img
                        src={currentImageUrl}
                        alt={fullName || "User"}
                        className="w-full h-full rounded-full object-cover aspect-square"
                      />
                      {/* Edit overlay */}
                      <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Edit className="w-4 h-4 text-foreground" />
                      </div>
                    </>
                  ) : (
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  )}
                </motion.div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Full Name Field */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Display Name</Label>
                <p className="text-sm text-muted-foreground">This is your display name</p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full"
                  placeholder="Enter your name"
                />
              </div>
            </div>

            {/* Email Field - Read Only */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">Your account email address</p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  value={user?.email || ""}
                  disabled
                  className="w-full bg-muted/50"
                  placeholder="user@example.com"
                />
              </div>
            </div>
          </div>

          {/* Save Button Footer */}
          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-3 border-t">
            <Button onClick={handleSave} disabled={isSaving} size="sm" className="text-xs">
              <div className="flex items-center justify-center gap-2">
                {isSaving && <IconSpinner className="h-3.5 w-3.5 text-current" />}
                Save
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Active Sessions Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-3 mb-4">
          <h3 className="text-sm font-medium text-foreground">Session Information</h3>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">User ID</span>
              <span className="text-sm font-mono text-foreground">{user?.id || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Username</span>
              <span className="text-sm text-foreground">{user?.username || "Not set"}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          AI provider connections are managed in the{" "}
          <span className="text-foreground font-medium">AI Providers</span> tab.
        </p>
      </div>
    </div>
  )
}
