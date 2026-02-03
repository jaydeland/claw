import { useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Plus, Trash2, ChevronDown } from "lucide-react"
import { AIPenIcon } from "../../ui/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../ui/select"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  selectedAgentChatIdAtom,
} from "../../../lib/atoms"
import { useAiQuery } from "../../../hooks/use-ai-query"
import { AiResultModal } from "../ai-result-modal"

function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsWorktreesTab() {
  const isNarrowScreen = useIsNarrowScreen()

  // Get projects list
  const { data: projects } = trpc.projects.list.useQuery()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )

  // Get config for selected project
  const { data: configData, refetch: refetchConfig } =
    trpc.worktreeConfig.get.useQuery(
      { projectId: selectedProjectId! },
      { enabled: !!selectedProjectId },
    )

  // Save mutation
  const saveMutation = trpc.worktreeConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Worktree config saved")
      refetchConfig()
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })

  // For "Fill with AI" - use background session
  const { queryAi, isLoading: isGenerating } = useAiQuery()
  const [showWorktreeAiModal, setShowWorktreeAiModal] = useState(false)
  const [aiGeneratedConfig, setAiGeneratedConfig] = useState("")

  const handleFillWithAi = async () => {
    if (!selectedProjectId) return

    const prompt = "Generate worktree setup commands for this project. Include commands for installing dependencies, copying environment files, and any other necessary setup. Return only the commands as a JSON array."
    const result = await queryAi(prompt, { model: "haiku" })

    if (result.success && result.text) {
      setAiGeneratedConfig(result.text)
      setShowWorktreeAiModal(true)
    }
  }

  // Local state
  const [saveTarget, setSaveTarget] = useState<"cursor" | "claw">("claw")
  const [commands, setCommands] = useState<string[]>([""])
  const [unixCommands, setUnixCommands] = useState<string[]>([])
  const [windowsCommands, setWindowsCommands] = useState<string[]>([])
  const [showPlatformSpecific, setShowPlatformSpecific] = useState(false)

  // Terminal startup commands state
  const [terminalCommands, setTerminalCommands] = useState<string[]>([""])
  const [terminalUnixCommands, setTerminalUnixCommands] = useState<string[]>([])
  const [terminalWindowsCommands, setTerminalWindowsCommands] = useState<string[]>([])
  const [showTerminalPlatformSpecific, setShowTerminalPlatformSpecific] = useState(false)

  // Auto-select first project
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  // Sync from server data
  useEffect(() => {
    if (configData) {
      if (configData.source === "cursor") {
        setSaveTarget("cursor")
      } else {
        setSaveTarget("claw")
      }

      if (configData.config) {
        // Generic setup commands
        const generic = configData.config["setup-worktree"]
        setCommands(
          Array.isArray(generic)
            ? [...generic, ""]
            : generic
              ? [generic, ""]
              : [""],
        )

        // Platform-specific setup commands
        const unix = configData.config["setup-worktree-unix"]
        const win = configData.config["setup-worktree-windows"]

        setUnixCommands(
          Array.isArray(unix) ? unix : unix ? [unix] : [],
        )
        setWindowsCommands(
          Array.isArray(win) ? win : win ? [win] : [],
        )

        // Show platform section if any platform-specific commands exist
        if (unix || win) {
          setShowPlatformSpecific(true)
        }

        // Terminal startup commands
        const terminalGeneric = configData.config["terminal-startup"]
        setTerminalCommands(
          Array.isArray(terminalGeneric)
            ? [...terminalGeneric, ""]
            : terminalGeneric
              ? [terminalGeneric, ""]
              : [""],
        )

        // Platform-specific terminal commands
        const terminalUnix = configData.config["terminal-startup-unix"]
        const terminalWin = configData.config["terminal-startup-windows"]

        setTerminalUnixCommands(
          Array.isArray(terminalUnix) ? terminalUnix : terminalUnix ? [terminalUnix] : [],
        )
        setTerminalWindowsCommands(
          Array.isArray(terminalWin) ? terminalWin : terminalWin ? [terminalWin] : [],
        )

        // Show terminal platform section if any platform-specific commands exist
        if (terminalUnix || terminalWin) {
          setShowTerminalPlatformSpecific(true)
        }
      } else {
        setCommands([""])
        setUnixCommands([])
        setWindowsCommands([])
        setTerminalCommands([""])
        setTerminalUnixCommands([])
        setTerminalWindowsCommands([])
      }
    }
  }, [configData])

  const handleSave = () => {
    if (!selectedProjectId) return

    const config: Record<string, string[]> = {}

    // Setup commands
    const filteredCommands = commands.filter((c) => c.trim())
    const filteredUnix = unixCommands.filter((c) => c.trim())
    const filteredWin = windowsCommands.filter((c) => c.trim())

    if (filteredCommands.length > 0) {
      config["setup-worktree"] = filteredCommands
    }
    if (filteredUnix.length > 0) {
      config["setup-worktree-unix"] = filteredUnix
    }
    if (filteredWin.length > 0) {
      config["setup-worktree-windows"] = filteredWin
    }

    // Terminal startup commands
    const filteredTerminalCommands = terminalCommands.filter((c) => c.trim())
    const filteredTerminalUnix = terminalUnixCommands.filter((c) => c.trim())
    const filteredTerminalWin = terminalWindowsCommands.filter((c) => c.trim())

    if (filteredTerminalCommands.length > 0) {
      config["terminal-startup"] = filteredTerminalCommands
    }
    if (filteredTerminalUnix.length > 0) {
      config["terminal-startup-unix"] = filteredTerminalUnix
    }
    if (filteredTerminalWin.length > 0) {
      config["terminal-startup-windows"] = filteredTerminalWin
    }

    saveMutation.mutate({
      projectId: selectedProjectId,
      config,
      target: saveTarget,
    })
  }

  const updateCommand = (
    index: number,
    value: string,
    list: string[],
    setter: (v: string[]) => void,
  ) => {
    const newList = [...list]
    newList[index] = value
    setter(newList)
  }

  const removeCommand = (
    index: number,
    list: string[],
    setter: (v: string[]) => void,
  ) => {
    if (list.length <= 1) return
    setter(list.filter((_, i) => i !== index))
  }

  const addCommand = (list: string[], setter: (v: string[]) => void) => {
    setter([...list, ""])
  }

  const selectedProject = projects?.find((p) => p.id === selectedProjectId)
  const cursorExists = configData?.available?.cursor?.exists ?? false

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Worktrees</h3>
          <p className="text-xs text-muted-foreground">
            Configure setup commands that run when a new worktree is created
          </p>
        </div>
      )}

      {/* Project Selection */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Project</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Select project</Label>
              <p className="text-xs text-muted-foreground">
                Choose which project to configure
              </p>
            </div>
            <div className="flex-shrink-0 w-64">
              <Select
                value={selectedProjectId ?? ""}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger className="w-full">
                  <span className="text-sm truncate">
                    {selectedProject?.name ?? "Select..."}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {selectedProjectId && (
        <>
          {/* Config Location */}
          <div className="space-y-2">
            <div className="pb-2">
              <h4 className="text-sm font-medium text-foreground">
                Config Location
              </h4>
              {configData?.path && (
                <p className="text-xs text-muted-foreground mt-1">
                  Using: {configData.path}
                </p>
              )}
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-6">
                <div className="flex-1">
                  <Label className="text-sm font-medium">Save to</Label>
                  <p className="text-xs text-muted-foreground">
                    Where to save the configuration file
                  </p>
                </div>
                <div className="flex-shrink-0 w-auto min-w-56 max-w-80">
                  <Select
                    value={saveTarget}
                    onValueChange={(v) => setSaveTarget(v as "cursor" | "claw")}
                  >
                    <SelectTrigger className="w-full">
                      <span className="text-sm font-mono truncate">
                        {saveTarget === "cursor"
                          ? ".cursor/worktrees.json"
                          : ".claw/worktree.json"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claw">
                        .claw/worktree.json
                      </SelectItem>
                      {cursorExists && (
                        <SelectItem value="cursor">
                          .cursor/worktrees.json
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Setup Commands - Main */}
          <div className="space-y-2">
            <div className="pb-2 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  Setup Commands
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Commands run in the worktree after creation
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleFillWithAi}
                disabled={!selectedProjectId || isGenerating}
              >
                <AIPenIcon className="h-3.5 w-3.5" />
                {isGenerating ? "Generating..." : "Fill with AI"}
              </Button>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">All Platforms</Label>
                  <span className="text-xs text-muted-foreground">
                    use <code className="font-mono bg-muted px-1 py-0.5 rounded">$ROOT_WORKTREE_PATH</code> for main repo path
                  </span>
                </div>
                <div className="space-y-2">
                  {commands.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={cmd}
                        onChange={(e) =>
                          updateCommand(i, e.target.value, commands, setCommands)
                        }
                        placeholder="bun install && cp $ROOT_WORKTREE_PATH/.env .env"
                        className="flex-1 font-mono text-sm"
                      />
                      {commands.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCommand(i, commands, setCommands)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => addCommand(commands, setCommands)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add command
                </Button>
              </div>

              {/* Platform-specific toggle */}
              <div className="border-t">
                <button
                  type="button"
                  className="w-full p-3 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setShowPlatformSpecific(!showPlatformSpecific)}
                >
                  <span>Platform-specific overrides</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showPlatformSpecific ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showPlatformSpecific && (
                  <div className="p-4 pt-0 space-y-4">
                    {/* Unix Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        macOS / Linux
                      </span>
                      {unixCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          Falls back to "All Platforms"
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {unixCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    unixCommands,
                                    setUnixCommands,
                                  )
                                }
                                placeholder="bun install"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(i, unixCommands, setUnixCommands)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() => addCommand(unixCommands, setUnixCommands)}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>

                    {/* Windows Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Windows
                      </span>
                      {windowsCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          Falls back to "All Platforms"
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {windowsCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    windowsCommands,
                                    setWindowsCommands,
                                  )
                                }
                                placeholder="npm ci"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(
                                    i,
                                    windowsCommands,
                                    setWindowsCommands,
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() =>
                          addCommand(windowsCommands, setWindowsCommands)
                        }
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Terminal Startup Commands */}
          <div className="space-y-2">
            <div className="pb-2">
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  Terminal Startup Commands
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Commands run when opening a terminal session in this project
                </p>
              </div>
            </div>

            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">All Platforms</Label>
                  <span className="text-xs text-muted-foreground">
                    runs in persistent shell after prompt is ready
                  </span>
                </div>
                <div className="space-y-2">
                  {terminalCommands.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={cmd}
                        onChange={(e) =>
                          updateCommand(i, e.target.value, terminalCommands, setTerminalCommands)
                        }
                        placeholder="flox activate, nvm use, source .env"
                        className="flex-1 font-mono text-sm"
                      />
                      {terminalCommands.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCommand(i, terminalCommands, setTerminalCommands)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => addCommand(terminalCommands, setTerminalCommands)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add command
                </Button>
              </div>

              {/* Platform-specific toggle */}
              <div className="border-t">
                <button
                  type="button"
                  className="w-full p-3 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setShowTerminalPlatformSpecific(!showTerminalPlatformSpecific)}
                >
                  <span>Platform-specific overrides</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showTerminalPlatformSpecific ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showTerminalPlatformSpecific && (
                  <div className="p-4 pt-0 space-y-4">
                    {/* Unix Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        macOS / Linux
                      </span>
                      {terminalUnixCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          Falls back to "All Platforms"
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {terminalUnixCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    terminalUnixCommands,
                                    setTerminalUnixCommands,
                                  )
                                }
                                placeholder="source ~/.nvm/nvm.sh && nvm use"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(i, terminalUnixCommands, setTerminalUnixCommands)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() => addCommand(terminalUnixCommands, setTerminalUnixCommands)}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>

                    {/* Windows Commands */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Windows
                      </span>
                      {terminalWindowsCommands.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 italic">
                          Falls back to "All Platforms"
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {terminalWindowsCommands.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={cmd}
                                onChange={(e) =>
                                  updateCommand(
                                    i,
                                    e.target.value,
                                    terminalWindowsCommands,
                                    setTerminalWindowsCommands,
                                  )
                                }
                                placeholder="nvm use"
                                className="flex-1 font-mono text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  removeCommand(
                                    i,
                                    terminalWindowsCommands,
                                    setTerminalWindowsCommands,
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-7 text-xs"
                        onClick={() =>
                          addCommand(terminalWindowsCommands, setTerminalWindowsCommands)
                        }
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="bg-muted p-3 flex justify-end gap-2 rounded-lg border border-border">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

            {/* AI Result Modal */}
            <AiResultModal
              open={showWorktreeAiModal}
              onOpenChange={setShowWorktreeAiModal}
              title="Generated Worktree Configuration"
              content={aiGeneratedConfig}
              acceptLabel="Use This Config"
              onAccept={(config) => {
                try {
                  const parsed = JSON.parse(config)
                  if (parsed["setup-worktree"]) {
                    const setupCommands = Array.isArray(parsed["setup-worktree"])
                      ? parsed["setup-worktree"]
                      : [parsed["setup-worktree"]]
                    setCommands([...setupCommands, ""])
                  }
                  if (parsed["setup-worktree-unix"]) {
                    const unixCmds = Array.isArray(parsed["setup-worktree-unix"])
                      ? parsed["setup-worktree-unix"]
                      : [parsed["setup-worktree-unix"]]
                    setUnixCommands(unixCmds)
                    setShowPlatformSpecific(true)
                  }
                  if (parsed["setup-worktree-windows"]) {
                    const winCmds = Array.isArray(parsed["setup-worktree-windows"])
                      ? parsed["setup-worktree-windows"]
                      : [parsed["setup-worktree-windows"]]
                    setWindowsCommands(winCmds)
                    setShowPlatformSpecific(true)
                  }
                  toast.success("Config loaded - review and save when ready")
                  setShowWorktreeAiModal(false)
                } catch (error) {
                  toast.error("Invalid JSON format")
                }
              }}
              showCopy={true}
            />
        </>
      )}
    </div>
  )
}
