"use client"

import React, { useState } from "react"
import { useAtomValue } from "jotai"
import { ShieldCheck, Webhook, TerminalSquare, LayoutDashboard, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, FolderOpen, Lock, Network, Cpu, Server } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { selectedSettingsCategoryAtom } from "../../agents/atoms"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { ClaudeCodeIcon } from "../../../components/ui/canvas-icons"
import { AgentsCustomAgentsTab } from "../../../components/dialogs/settings-tabs/agents-custom-agents-tab"
import { AgentsSkillsTab } from "../../../components/dialogs/settings-tabs/agents-skills-tab"
import { AgentsMcpTab } from "../../../components/dialogs/settings-tabs/agents-mcp-tab"

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewSection({ settings, configPath }: { settings: any; configPath: string }) {
  const hasHooks = settings?.hooks && Object.keys(settings.hooks).length > 0
  const allowCount = settings?.permissions?.allow?.length ?? 0
  const denyCount = settings?.permissions?.deny?.length ?? 0
  const hasStatusLine = !!settings?.statusLine

  const stats = [
    { label: "Config path", value: configPath, icon: FolderOpen, mono: true },
    { label: "Allowed tools", value: String(allowCount), icon: ShieldCheck },
    { label: "Denied tools", value: String(denyCount), icon: Lock },
    { label: "Hook events", value: hasHooks ? String(Object.keys(settings.hooks).length) : "0", icon: Webhook },
    { label: "Status line", value: hasStatusLine ? settings.statusLine.type : "None", icon: TerminalSquare },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <ClaudeCodeIcon className="h-8 w-8 text-primary flex-shrink-0" />
        <div>
          <h2 className="text-base font-semibold">Claude Code Settings</h2>
          <p className="text-xs text-muted-foreground">~/.claude/settings.json</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {stats.map(({ label, value, icon: Icon, mono }) => (
          <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{label}</span>
            </div>
            <span className={cn("text-xs font-medium truncate max-w-[180px]", mono && "font-mono text-[11px]")}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Permissions ─────────────────────────────────────────────────────────────

function PermissionsSection({ settings, onSave, isSaving }: { settings: any; onSave: (patch: any) => void; isSaving: boolean }) {
  const allow: string[] = settings?.permissions?.allow ?? []
  const deny: string[] = settings?.permissions?.deny ?? []
  const [newAllow, setNewAllow] = useState("")
  const [newDeny, setNewDeny] = useState("")

  const addAllow = () => {
    const v = newAllow.trim()
    if (!v || allow.includes(v)) return
    onSave({ permissions: { ...settings?.permissions, allow: [...allow, v] } })
    setNewAllow("")
  }

  const removeAllow = (item: string) => {
    onSave({ permissions: { ...settings?.permissions, allow: allow.filter((x) => x !== item) } })
  }

  const addDeny = () => {
    const v = newDeny.trim()
    if (!v || deny.includes(v)) return
    onSave({ permissions: { ...settings?.permissions, deny: [...deny, v] } })
    setNewDeny("")
  }

  const removeDeny = (item: string) => {
    onSave({ permissions: { ...settings?.permissions, deny: deny.filter((x) => x !== item) } })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-green-500" /> Allowed Tools
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Tools Claude is always permitted to use. Supports glob patterns like <code className="text-[11px] font-mono bg-muted px-1 rounded">Bash(npm run *)</code>.
        </p>
        <div className="flex gap-2 mb-2">
          <Input
            value={newAllow}
            onChange={(e) => setNewAllow(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAllow()}
            placeholder="e.g. Bash(git *)"
            className="h-7 text-xs"
          />
          <Button size="sm" variant="outline" onClick={addAllow} disabled={isSaving} className="h-7 px-2">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          {allow.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">No allowed tools configured</p>
          ) : (
            allow.map((item) => (
              <div key={item} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-green-500/8 border border-green-500/20 group">
                <span className="text-xs font-mono">{item}</span>
                <button onClick={() => removeAllow(item)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-red-500" /> Denied Tools
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Tools Claude is never permitted to use.
        </p>
        <div className="flex gap-2 mb-2">
          <Input
            value={newDeny}
            onChange={(e) => setNewDeny(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDeny()}
            placeholder="e.g. WebSearch"
            className="h-7 text-xs"
          />
          <Button size="sm" variant="outline" onClick={addDeny} disabled={isSaving} className="h-7 px-2">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          {deny.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">No denied tools configured</p>
          ) : (
            deny.map((item) => (
              <div key={item} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-red-500/8 border border-red-500/20 group">
                <span className="text-xs font-mono">{item}</span>
                <button onClick={() => removeDeny(item)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "Stop", "Notification", "SubagentStop"] as const

function HooksSection({ settings, onSave, isSaving }: { settings: any; onSave: (patch: any) => void; isSaving: boolean }) {
  const hooks: Record<string, any[]> = settings?.hooks ?? {}
  const [selectedEvent, setSelectedEvent] = useState<string>(HOOK_EVENTS[0])
  const [newCommand, setNewCommand] = useState("")

  const currentHooks = hooks[selectedEvent] ?? []

  const addHook = () => {
    const cmd = newCommand.trim()
    if (!cmd) return
    const updated = {
      ...hooks,
      [selectedEvent]: [
        ...(hooks[selectedEvent] ?? []),
        { hooks: [{ type: "command", command: cmd }] },
      ],
    }
    onSave({ hooks: updated })
    setNewCommand("")
  }

  const removeHook = (idx: number) => {
    const updated = {
      ...hooks,
      [selectedEvent]: currentHooks.filter((_: any, i: number) => i !== idx),
    }
    onSave({ hooks: updated })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Webhook className="h-4 w-4 text-purple-500" /> Lifecycle Hooks
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Shell commands that run on Claude Code lifecycle events.
        </p>
      </div>

      {/* Event tabs */}
      <div className="flex flex-wrap gap-1">
        {HOOK_EVENTS.map((event) => {
          const count = (hooks[event] ?? []).length
          return (
            <button
              key={event}
              type="button"
              onClick={() => setSelectedEvent(event)}
              className={cn(
                "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                selectedEvent === event
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/8"
              )}
            >
              {event}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/20 text-primary px-1 rounded-full">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Add hook */}
      <div className="flex gap-2">
        <Input
          value={newCommand}
          onChange={(e) => setNewCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addHook()}
          placeholder="Shell command..."
          className="h-7 text-xs font-mono"
        />
        <Button size="sm" variant="outline" onClick={addHook} disabled={isSaving} className="h-7 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Hook list */}
      <div className="flex flex-col gap-1">
        {currentHooks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">No hooks for {selectedEvent}</p>
        ) : (
          currentHooks.map((hookGroup: any, idx: number) => {
            const cmd = hookGroup?.hooks?.[0]?.command ?? JSON.stringify(hookGroup)
            return (
              <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 group">
                <span className="text-xs font-mono truncate">{cmd}</span>
                <button onClick={() => removeHook(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Status Line ─────────────────────────────────────────────────────────────

function StatusLineSection({ settings, onSave, isSaving }: { settings: any; onSave: (patch: any) => void; isSaving: boolean }) {
  const statusLine = settings?.statusLine
  const [type, setType] = useState(statusLine?.type ?? "")
  const [command, setCommand] = useState(statusLine?.command ?? "")

  const save = () => {
    if (!type) {
      onSave({ statusLine: undefined })
    } else {
      onSave({ statusLine: { type, ...(command ? { command } : {}) } })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <TerminalSquare className="h-4 w-4 text-blue-500" /> Status Line
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Configure the status line shown in the Claude Code terminal.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
          <Input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. command"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Command</label>
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Shell command to run"
            className="h-7 text-xs font-mono"
          />
        </div>
        <Button size="sm" onClick={save} disabled={isSaving} className="self-start h-7">
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Save
        </Button>
      </div>

      {statusLine && (
        <div className="px-2.5 py-2 rounded-md bg-muted/40 border border-border/40">
          <p className="text-[11px] text-muted-foreground mb-1">Current</p>
          <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(statusLine, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function CcSettingsContent() {
  const category = useAtomValue(selectedSettingsCategoryAtom)
  const utils = trpc.useUtils()

  const { data: settingsData, isLoading, error } = trpc.claudeConfig.readSettings.useQuery()
  const { data: pathData } = trpc.claudeConfig.getConfigPath.useQuery()

  const writeMutation = trpc.claudeConfig.writeSettings.useMutation({
    onSuccess: () => utils.claudeConfig.readSettings.invalidate(),
  })

  const settings = settingsData?.settings

  const handleSave = (patch: Record<string, any>) => {
    writeMutation.mutate({ settings: { ...settings, ...patch } })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load settings</p>
        <p className="text-xs text-muted-foreground/70">{error.message}</p>
      </div>
    )
  }

  const configPath = pathData?.path ?? "~/.claude"

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          {category === "overview" && <LayoutDashboard className="h-4 w-4 text-primary" />}
          {category === "permissions" && <ShieldCheck className="h-4 w-4 text-primary" />}
          {category === "hooks" && <Webhook className="h-4 w-4 text-primary" />}
          {category === "status-line" && <TerminalSquare className="h-4 w-4 text-primary" />}
          {(category === "agents-overview" || category === "agents-permissions") && <Network className="h-4 w-4 text-primary" />}
          {(category === "skills-overview" || category === "skills-hooks") && <Cpu className="h-4 w-4 text-primary" />}
          {(category === "mcps-overview" || category === "mcps-permissions") && <Server className="h-4 w-4 text-primary" />}
          <span className="text-sm font-semibold capitalize">
            {category === "status-line" ? "Status Line" :
             category === "agents-overview" ? "Agents" :
             category === "agents-permissions" ? "Agent Permissions" :
             category === "skills-overview" ? "Skills" :
             category === "skills-hooks" ? "Skill Hooks" :
             category === "mcps-overview" ? "MCP Servers" :
             category === "mcps-permissions" ? "MCP Permissions" :
             category}
          </span>
        </div>

        {writeMutation.isSuccess && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {writeMutation.isPending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {category === "overview" && (
            <OverviewSection settings={settings} configPath={configPath} />
          )}
          {category === "permissions" && (
            <PermissionsSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          )}
          {category === "hooks" && (
            <HooksSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          )}
          {category === "status-line" && (
            <StatusLineSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          )}
        </div>

        {/* Full-bleed sections for Agents / Skills / MCPs */}
        {category === "agents-overview" && <AgentsCustomAgentsTab />}
        {category === "agents-permissions" && (
          <div className="p-4">
            <PermissionsSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          </div>
        )}
        {category === "skills-overview" && <AgentsSkillsTab />}
        {category === "skills-hooks" && (
          <div className="p-4">
            <HooksSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          </div>
        )}
        {category === "mcps-overview" && <AgentsMcpTab />}
        {category === "mcps-permissions" && (
          <div className="p-4">
            <PermissionsSection
              settings={settings}
              onSave={handleSave}
              isSaving={writeMutation.isPending}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
