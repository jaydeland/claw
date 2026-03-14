"use client"

import { useMemo, useEffect, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Sparkles,
  Wand2,
  Check,
  Loader2,
  Code2,
  Eye,
  Trash2,
  Save,
  FolderOpen,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "../../agents/atoms"
import {
  openUIPromptAtom,
  openUIGeneratedComponentsAtom,
  openUIGenerationInProgressAtom,
  openUIGenerationErrorAtom,
  openUIGeneratedOutputAtom,
  openUISelectedComponentIdAtom,
  openUIRegisteredComponentsAtom,
  selectedOpenUIProjectIdAtom,
  openUIViewModeAtom,
  type GeneratedComponent,
} from "../atoms"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { TabViewLayout } from "../../shared/components/tab-view-layout"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { OpenUITreePane } from "../components/openui-tree-pane"

/**
 * OpenUI Builder - AI-powered UI component generation
 * Allows users to describe features in natural language and generates working React components
 * Integrated with Claw's project/chat workflow
 */
export function OpenUIContent() {
  const [prompt, setPrompt] = useAtom(openUIPromptAtom)
  const [generatedComponents, setGeneratedComponents] = useAtom(openUIGeneratedComponentsAtom)
  const [generationInProgress, setGenerationInProgress] = useAtom(openUIGenerationInProgressAtom)
  const [generationError, setGenerationError] = useAtom(openUIGenerationErrorAtom)
  const [generatedOutput, setGeneratedOutput] = useAtom(openUIGeneratedOutputAtom)
  const [selectedComponentId, setSelectedComponentId] = useAtom(openUISelectedComponentIdAtom)
  const [registeredComponents, setRegisteredComponents] = useAtom(openUIRegisteredComponentsAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedOpenUIProjectIdAtom)
  const [viewMode, setViewMode] = useAtom(openUIViewModeAtom)
  const [panelTab, setPanelTab] = useAtom(openUIPanelActiveTabAtom)
  const templates = useAtomValue(openUITemplatesAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const currentChatId = useAtomValue(selectedAgentChatIdAtom)

  // Use current project if none explicitly selected
  const effectiveProjectId = selectedProjectId || selectedProject?.id

  // Update selected project when current project changes
  useEffect(() => {
    if (selectedProject?.id && !selectedProjectId) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProject, selectedProjectId, setSelectedProjectId])

  // Fetch registered components (existing Claw UI components)
  const { data: componentsData } = trpc.openui.getRegisteredComponents.useQuery()

  // Update registered components when fetched
  useEffect(() => {
    if (componentsData) {
      setRegisteredComponents(componentsData)
    }
  }, [componentsData, setRegisteredComponents])

  // Fetch generated components for current project
  const { data: dbComponentsData } = trpc.openui.getProjectComponents.useQuery(
    { projectId: effectiveProjectId! },
    { enabled: !!effectiveProjectId }
  )

  // Update generated components when fetched
  useEffect(() => {
    if (dbComponentsData) {
      setGeneratedComponents(dbComponentsData as GeneratedComponent[])
    }
  }, [dbComponentsData, setGeneratedComponents])

  // Generate mutation
  const generateMutation = trpc.openui.generate.useMutation({
    onMutate: () => {
      setGenerationInProgress(true)
      setGenerationError(null)
    },
    onSuccess: (result) => {
      setGenerationInProgress(false)
      setGeneratedOutput(result.output || "")
      if (result.component) {
        // Add to list and select it
        setGeneratedComponents((prev) => {
          const exists = prev.find((c) => c.id === result.component?.id)
          if (exists) {
            return prev.map((c) =>
              c.id === result.component?.id ? (result.component as GeneratedComponent) : c
            )
          }
          return [...prev, result.component as GeneratedComponent]
        })
        setSelectedComponentId(result.component.id)
        setPanelTab("generated")
      }
    },
    onError: (error) => {
      setGenerationInProgress(false)
      setGenerationError(error.message)
    },
  })

  // Install mutation
  const installMutation = trpc.openui.installComponent.useMutation({
    onSuccess: () => {
      // Refresh component list
      trpc.useUtils().openui.getProjectComponents.invalidate()
    },
  })

  // Handler for "Generate" button
  const handleGenerate = () => {
    if (!prompt.trim() || !effectiveProjectId) return
    generateMutation.mutate({
      prompt: prompt.trim(),
      projectId: effectiveProjectId,
      chatId: currentChatId || undefined,
      componentLibrary: registeredComponents.map((c) => ({
        name: c.name,
        description: c.description,
      })),
    })
  }

  // Handler for template selection
  const handleSelectTemplate = (template: OpenUITemplate) => {
    setPrompt(template.prompt)
  }

  // Handler for installing component
  const handleInstall = (component: GeneratedComponent) => {
    installMutation.mutate({ componentId: component.id })
  }

  // Handler for deleting component
  const handleDelete = (componentId: string) => {
    trpc.openui.deleteComponent.useMutation().mutate({ componentId })
    setGeneratedComponents((prev) => prev.filter((c) => c.id !== componentId))
    if (selectedComponentId === componentId) {
      setSelectedComponentId(null)
    }
  }

  // Get selected component
  const selectedComponent = useMemo(() => {
    return generatedComponents.find((c) => c.id === selectedComponentId)
  }, [generatedComponents, selectedComponentId])

  // Header title component
  const headerTitle = (
    <>
      <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
      <span className="text-lg font-semibold">Extend Claw with AI</span>
    </>
  )

  // Header actions component
  const headerActions = (
    <>
      {/* View mode toggle */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "code" | "preview" | "split")}>
        <TabsList className="h-7">
          <TabsTrigger value="code" className="text-[10px] px-2">
            <Code2 className="h-3 w-3 mr-1" />
            Code
          </TabsTrigger>
          <TabsTrigger value="split" className="text-[10px] px-2">
            Split
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-[10px] px-2">
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <span className="text-muted-foreground text-xs mx-1">|</span>

      {/* Project selector */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs truncate max-w-[150px]">
          {selectedProject?.name || "No project selected"}
        </span>
      </div>
    </>
  )

  // Left panel content - Tree pane for workspace-like management
  const leftPanelContent = <OpenUITreePane />

  // Center panel content (prompt input + preview)
  const centerPanelContent = (
    <div className="h-full flex flex-col">
      {/* Prompt input area */}
      <div className="p-4 border-b border-border/50">
        <div className="flex gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the UI component you want to create..."
            className="min-h-[80px] resize-none"
            disabled={generationInProgress}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleGenerate()
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || generationInProgress || !effectiveProjectId}
              className="gap-1"
            >
              {generationInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
            {selectedComponent && !selectedComponent.isInstalled && (
              <Button
                variant="outline"
                onClick={() => handleInstall(selectedComponent)}
                disabled={installMutation.isPending}
                className="gap-1"
              >
                <Save className="h-4 w-4" />
                Install
              </Button>
            )}
          </div>
        </div>
        {generationError && (
          <p className="text-sm text-destructive mt-2">{generationError}</p>
        )}
        {!effectiveProjectId && (
          <p className="text-sm text-muted-foreground mt-2">
            Select a project to generate components
          </p>
        )}
      </div>

      {/* Preview/Output area */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedComponent ? (
          <GeneratedComponentPreview
            component={selectedComponent}
            viewMode={viewMode}
          />
        ) : generatedOutput ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <h3 className="text-sm font-semibold mb-2">Generation Output</h3>
            <ChatMarkdownRenderer content={generatedOutput} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Sparkles className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Describe a component to generate it</p>
            <p className="text-xs mt-1">Try: &quot;Create a dashboard with metric cards&quot;</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <TabViewLayout
      title={headerTitle}
      headerActions={headerActions}
      leftPanel={{
        id: "openui-sidebar",
        content: leftPanelContent,
        defaultWidth: 20,
        minWidth: 180,
        maxWidth: 300,
      }}
      centerPanel={{
        id: "openui-content",
        content: centerPanelContent,
        defaultWidth: 80,
      }}
    />
  )
}

/**
 * Generated component preview - renders the generated component
 */
function GeneratedComponentPreview({
  component,
  viewMode,
}: {
  component: GeneratedComponent
  viewMode: "code" | "preview" | "split"
}) {
  const showCode = viewMode === "code" || viewMode === "split"
  const showPreview = viewMode === "preview" || viewMode === "split"

  return (
    <div className={cn("space-y-4", viewMode === "split" && "grid grid-cols-2 gap-4")}>
      {showCode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{component.name}</h3>
            <div className="flex items-center gap-2">
              {component.isInstalled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500">
                  Installed
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(component.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          {component.description && (
            <p className="text-sm text-muted-foreground">{component.description}</p>
          )}
          <div className="rounded-md border bg-muted/50 p-4 overflow-auto">
            <pre className="text-xs">
              <code>{component.code}</code>
            </pre>
          </div>
          {component.atomsCode && (
            <div className="rounded-md border bg-muted/50 p-4 overflow-auto">
              <h4 className="text-xs font-semibold mb-2">State Atoms</h4>
              <pre className="text-xs">
                <code>{component.atomsCode}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {showPreview && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Preview</h3>
          <div className="rounded-md border bg-background p-4 min-h-[200px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Component preview will render here
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
