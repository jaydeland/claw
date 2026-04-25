"use client"

import { useState, useEffect, useMemo } from "react"
import { useSetAtom } from "jotai"
import { toast } from "sonner"
import { GitBranch, ChevronDown, Check } from "lucide-react"
import {
  Dialog,
  CanvasDialogContent,
  CanvasDialogHeader,
  CanvasDialogBody,
  CanvasDialogFooter,
  DialogTitle,
} from "../../../../components/ui/dialog"
import { Button } from "../../../../components/ui/button"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../../../components/ui/command"
import { IconSpinner } from "../../../../components/ui/icons"
import { trpc } from "../../../../lib/trpc"
import { cn } from "../../../../lib/utils"
import { pendingPostMergeMessageAtom } from "../../../agents/atoms"

interface MergeBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  worktreePath: string
  currentBranch: string
  localBranches: string[]
  defaultBranch: string
  onMergeComplete: () => void
  onMergeWithAi?: (targetBranch: string) => void
  isMergingWithAi?: boolean
  onCloseDiffSidebar?: () => void
}

export function MergeBranchDialog({
  open,
  onOpenChange,
  worktreePath,
  currentBranch,
  localBranches,
  defaultBranch,
  onMergeComplete,
  onMergeWithAi,
  isMergingWithAi,
  onCloseDiffSidebar,
}: MergeBranchDialogProps) {
  const [targetBranch, setTargetBranch] = useState<string>("")
  const [targetBranchOpen, setTargetBranchOpen] = useState(false)
  const [targetBranchSearch, setTargetBranchSearch] = useState("")

  // Atom setter for auto-prompting Claude after merge
  const setPendingPostMergeMessage = useSetAtom(pendingPostMergeMessageAtom)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTargetBranch("")
      setTargetBranchOpen(false)
      setTargetBranchSearch("")
    }
  }, [open])

  // Filter branches: exclude current branch, limit to 50
  const filteredTargetBranches = useMemo(() => {
    let filtered = localBranches.filter(branch => branch !== currentBranch)

    if (targetBranchSearch.trim()) {
      const search = targetBranchSearch.toLowerCase()
      filtered = filtered.filter((b) => b.toLowerCase().includes(search))
    }

    return filtered.slice(0, 50)
  }, [localBranches, currentBranch, targetBranchSearch])

  const mergeMutation = trpc.changes.mergeIntoLocalBranch.useMutation({
    onSuccess: (data) => {
      const typeLabel =
        data.mergeType === "fast-forward"
          ? "Fast-forward"
          : data.mergeType === "already-up-to-date"
            ? "Already up-to-date"
            : "Merge commit"
      toast.success(`${typeLabel} merge into '${targetBranch}' succeeded`)
      onMergeComplete()

      // Close dialog immediately
      onOpenChange(false)

      // Auto-prompt Claude to complete the merge
      const promptMessage = `The merge from '${currentBranch}' into '${targetBranch}' was successful. Please review the changes and provide a summary of what was merged.`
      setPendingPostMergeMessage(promptMessage)
    },
    onError: (error) => {
      toast.error(`Merge failed: ${error.message}`)
    },
  })

  const handleMerge = () => {
    if (!targetBranch.trim()) {
      toast.error("Please select a target branch")
      return
    }

    mergeMutation.mutate({
      worktreePath,
      targetBranch,
      fastForwardOnly: false,
    })
  }

  const handleMergeWithAi = () => {
    if (!targetBranch.trim()) {
      toast.error("Please select a target branch")
      return
    }

    if (!onMergeWithAi) return

    // Close dialog immediately (AI will handle from here)
    onOpenChange(false)

    // Close diff sidebar to return to chat
    onCloseDiffSidebar?.()

    // Trigger AI merge
    onMergeWithAi(targetBranch)

    // Reset selection
    setTargetBranch("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent className="sm:max-w-[350px] overflow-visible">
        <CanvasDialogHeader>
          <DialogTitle>Merge Into Branch</DialogTitle>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-4">
          {/* Info text */}
          <div className="text-sm text-muted-foreground">
            Merge <span className="font-mono font-semibold text-foreground">{currentBranch}</span> into:
          </div>

          {/* Target Branch Selection with Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Branch</label>
            {/* Using Popover WITHOUT Portal so it renders inside Dialog's DOM tree */}
            <PopoverPrimitive.Root
              open={targetBranchOpen}
              onOpenChange={setTargetBranchOpen}
            >
              <PopoverPrimitive.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-background px-3 py-2 text-sm shadow-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                  disabled={mergeMutation.isPending}
                >
                  <span className="truncate">
                    {targetBranch || "Select a branch..."}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverPrimitive.Trigger>
              {/* NO Portal wrapper - content renders inside Dialog */}
              <PopoverPrimitive.Content
                className="z-50 w-full rounded-[10px] bg-popover p-0 text-sm text-popover-foreground shadow-lg border border-border outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                align="start"
                sideOffset={4}
                style={{ width: "var(--radix-popover-trigger-width)" }}
              >
                <Command>
                  <CommandInput
                    placeholder="Search branches..."
                    value={targetBranchSearch}
                    onValueChange={setTargetBranchSearch}
                  />
                  <CommandList className="max-h-[200px]">
                    {filteredTargetBranches.length === 0 ? (
                      <CommandEmpty>No branches found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredTargetBranches.map((branch) => {
                          return (
                            <CommandItem
                              key={branch}
                              value={branch}
                              onSelect={() => {
                                setTargetBranch(branch)
                                setTargetBranchOpen(false)
                              }}
                              className="gap-2 cursor-pointer"
                            >
                              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate flex-1">{branch}</span>
                              {targetBranch === branch && (
                                <Check className="h-4 w-4 shrink-0" />
                              )}
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Root>
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMergingWithAi}
            className="transition-transform duration-150 active:scale-[0.97] rounded-md"
          >
            Cancel
          </Button>
          {onMergeWithAi && (
            <Button
              type="button"
              onClick={handleMergeWithAi}
              disabled={!targetBranch.trim() || isMergingWithAi}
              className="transition-transform duration-150 active:scale-[0.97] rounded-md"
            >
              {isMergingWithAi ? (
                <>
                  <IconSpinner className="w-4 h-4 mr-2" />
                  Preparing...
                </>
              ) : (
                "Merge with AI"
              )}
            </Button>
          )}
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
