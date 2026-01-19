"use client"

import React from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown, ChevronRight, Workflow, Network, Cpu } from "lucide-react"
import { useAtomValue, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  workflowsTreeExpandedNodesAtom,
  workflowsToggleNodeAtom,
  selectedWorkflowNodeAtom,
  type WorkflowNode,
} from "../atoms"

// Types imported from workflows router (will be exported in Task 3)
type DependencyGraph = {
  tools: string[]
  skills: string[]
  mcpServers: string[]
  agents: string[]
  commands: string[]
}

type AgentMetadata = {
  id: string
  name: string
  description: string
  tools: string[]
  model: string
  sourcePath: string
}

type AgentWithDependencies = AgentMetadata & {
  dependencies: DependencyGraph
}

type CommandMetadata = {
  id: string
  name: string
  description: string
  sourcePath: string
}

type SkillMetadata = {
  id: string
  name: string
  description: string
  sourcePath: string
}

type WorkflowGraph = {
  agents: AgentWithDependencies[]
  commands: CommandMetadata[]
  skills: SkillMetadata[]
}

interface TreeNodeProps {
  nodeKey: string
  isExpanded: boolean
  onToggle: (key: string) => void
  label: string
  description?: string
  icon?: React.ReactNode
  level: number
  isSelected?: boolean
  onClick?: () => void
  children?: React.ReactNode
  isEmpty?: boolean
}

const TreeNode = React.memo(function TreeNode({
  nodeKey,
  isExpanded,
  onToggle,
  label,
  description,
  icon,
  level,
  isSelected = false,
  onClick,
  children,
  isEmpty = false,
}: TreeNodeProps) {
  const paddingLeft = 8 + level * 16

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 py-1 pr-2 cursor-pointer transition-colors rounded-sm",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={(e) => {
          e.stopPropagation()
          if (children) {
            onToggle(nodeKey)
          }
          onClick?.()
        }}
      >
        {children !== undefined && (
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0"
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div        )}
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <span className="truncate text-sm font-medium">{label}</span>
        {description && (
          <span className="truncate text-xs text-muted-foreground/70 hidden group-hover:inline-block">
            {" "}
            — {description}
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && children !== undefined && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="py-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

interface DependencyCategoryProps {
  title: string
  items: string[]
  nodeKey: string
  isExpanded: boolean
  onToggle: (key: string) => void
  level: number
  icon: React.ReactNode
  itemType: "tool" | "skill" | "mcpServer"
  onSelectNode: (node: WorkflowNode) => void
  selectedNode: WorkflowNode | null
}

const DependencyCategory = React.memo(function DependencyCategory({
  title,
  items,
  nodeKey,
  isExpanded,
  onToggle,
  level,
  icon,
  itemType,
  onSelectNode,
  selectedNode,
}: DependencyCategoryProps) {
  if (items.length === 0) return null

  return (
    <TreeNode
      nodeKey={nodeKey}
      isExpanded={isExpanded}
      onToggle={onToggle}
      label={title}
      level={level}
      icon={icon}
    >
      {items.map((item) => {
        const itemKey = `${nodeKey}:${item}`
        const isSelected =
          selectedNode?.type === itemType && selectedNode?.id === item

        return (
          <div
            key={itemKey}
            className={cn(
              "py-1 pr-2 cursor-pointer transition-colors rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50",
              isSelected && "bg-accent text-accent-foreground",
            )}
            style={{ paddingLeft: `${8 + (level + 1) * 16}px` }}
            onClick={(e) => {
              e.stopPropagation()
              onSelectNode({
                type: itemType,
                id: item,
                name: item,
                sourcePath: "",
              })
            }}
          >
            {item}
          </div>
        )
      })}
    </TreeNode>
  )
})

interface WorkflowTreeProps {
  data: WorkflowGraph | null | undefined
  isLoading?: boolean
}

export function WorkflowTree({ data, isLoading }: WorkflowTreeProps) {
  const expandedNodes = useAtomValue(workflowsTreeExpandedNodesAtom)
  const toggleNode = useSetAtom(workflowsToggleNodeAtom)
  const setSelectedNode = useSetAtom(selectedWorkflowNodeAtom)

  const isNodeExpanded = (key: string) => expandedNodes.has(key)

  const handleToggle = (key: string) => {
    toggleNode(key)
  }

  const handleSelectAgent = (agent: AgentWithDependencies) => {
    setSelectedNode({
      type: "agent",
      id: agent.id,
      name: agent.name,
      sourcePath: agent.sourcePath,
    })
  }

  const handleSelectCommand = (command: CommandMetadata) => {
    setSelectedNode({
      type: "command",
      id: command.id,
      name: command.name,
      sourcePath: command.sourcePath,
    })
  }

  const handleSelectSkill = (skill: SkillMetadata) => {
    setSelectedNode({
      type: "skill",
      id: skill.id,
      name: skill.name,
      sourcePath: skill.sourcePath,
    })
  }

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        Loading workflows...
      </div>
    )
  }

  if (!data || (data.agents.length === 0 && data.commands.length === 0 && data.skills.length === 0)) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No workflows found
      </div>
    )
  }

  return (
    <div className="py-1">
      {/* Agents Section */}
      {data.agents.length > 0 && (
        <TreeNode
          nodeKey="agents"
          isExpanded={isNodeExpanded("agents")}
          onToggle={handleToggle}
          label="Agents"
          level={0}
          icon={<Network className="h-3.5 w-3.5 text-muted-foreground" />}
        >
          {data.agents.map((agent) => {
            const agentNodeKey = `agent:${agent.id}`
            const isAgentExpanded = isNodeExpanded(agentNodeKey)
            const deps = agent.dependencies

            return (
              <div key={agent.id}>
                <TreeNode
                  nodeKey={agentNodeKey}
                  isExpanded={isAgentExpanded}
                  onToggle={handleToggle}
                  label={agent.name}
                  description={agent.description || agent.model}
                  level={1}
                  onClick={() => handleSelectAgent(agent)}
                >
                  {/* Tools Category */}
                  <DependencyCategory
                    title="Tools"
                    items={deps.tools}
                    nodeKey={`${agentNodeKey}:tools`}
                    isExpanded={isNodeExpanded(`${agentNodeKey}:tools`)}
                    onToggle={handleToggle}
                    level={2}
                    icon={<Cpu className="h-3 w-3.5 text-muted-foreground" />}
                    itemType="tool"
                    onSelectNode={setSelectedNode}
                    selectedNode={null} // Tools don't have source paths yet
                  />

                  {/* Skills Category */}
                  <DependencyCategory
                    title="Skills"
                    items={deps.skills}
                    nodeKey={`${agentNodeKey}:skills`}
                    isExpanded={isNodeExpanded(`${agentNodeKey}:skills`)}
                    onToggle={handleToggle}
                    level={2}
                    icon={<Workflow className="h-3 w-3.5 text-muted-foreground" />}
                    itemType="skill"
                    onSelectNode={setSelectedNode}
                    selectedNode={null}
                  />

                  {/* MCP Servers Category */}
                  <DependencyCategory
                    title="MCP Servers"
                    items={deps.mcpServers}
                    nodeKey={`${agentNodeKey}:mcpServers`}
                    isExpanded={isNodeExpanded(`${agentNodeKey}:mcpServers`)}
                    onToggle={handleToggle}
                    level={2}
                    icon={<Network className="h-3 w-3.5 text-muted-foreground" />}
                    itemType="mcpServer"
                    onSelectNode={setSelectedNode}
                    selectedNode={null}
                  />

                  {/* Agents Category (nested agents) */}
                  {deps.agents.length > 0 && (
                    <TreeNode
                      nodeKey={`${agentNodeKey}:agents`}
                      isExpanded={isNodeExpanded(`${agentNodeKey}:agents`)}
                      onToggle={handleToggle}
                      label="Agents"
                      level={2}
                      icon={<Network className="h-3 w-3.5 text-muted-foreground" />}
                    >
                      {deps.agents.map((invokedAgentId) => {
                        const invokedAgent = data.agents.find((a) => a.id === invokedAgentId)
                        if (!invokedAgent) return null

                        return (
                          <div
                            key={invokedAgentId}
                            className="py-1 pr-2 cursor-pointer transition-colors rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            style={{ paddingLeft: `${8 + 3 * 16}px` }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectAgent(invokedAgent)
                            }}
                          >
                            {invokedAgent.name}
                          </div>
                        )
                      })}
                    </TreeNode>
                  )}

                  {/* Commands Category */}
                  {deps.commands.length > 0 && (
                    <TreeNode
                      nodeKey={`${agentNodeKey}:commands`}
                      isExpanded={isNodeExpanded(`${agentNodeKey}:commands`)}
                      onToggle={handleToggle}
                      label="Commands"
                      level={2}
                      icon={<Workflow className="h-3 w-3.5 text-muted-foreground" />}
                    >
                      {deps.commands.map((commandId) => {
                        const command = data.commands.find((c) => c.id === commandId)
                        if (!command) return null

                        return (
                          <div
                            key={commandId}
                            className="py-1 pr-2 cursor-pointer transition-colors rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            style={{ paddingLeft: `${8 + 3 * 16}px` }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectCommand(command)
                            }}
                          >
                            {command.name}
                          </div>
                        )
                      })}
                    </TreeNode>
                  )}
                </TreeNode>
              </div>
            )
          })}
        </TreeNode>
      )}

      {/* Commands Section */}
      {data.commands.length > 0 && (
        <TreeNode
          nodeKey="commands"
          isExpanded={isNodeExpanded("commands")}
          onToggle={handleToggle}
          label="Commands"
          level={0}
          icon={<Workflow className="h-3.5 w-3.5 text-muted-foreground" />}
        >
          {data.commands.map((command) => (
            <div
              key={command.id}
              className="py-1 pr-2 cursor-pointer transition-colors rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
              style={{ paddingLeft: `${8 + 1 * 16}px` }}
              onClick={(e) => {
                e.stopPropagation()
                handleSelectCommand(command)
              }}
            >
              {command.name}
            </div>
          ))}
        </TreeNode>
      )}

      {/* Skills Section */}
      {data.skills.length > 0 && (
        <TreeNode
          nodeKey="skills"
          isExpanded={isNodeExpanded("skills")}
          onToggle={handleToggle}
          label="Skills"
          level={0}
          icon={<Cpu className="h-3.5 w-3.5 text-muted-foreground" />}
        >
          {data.skills.map((skill) => (
            <div
              key={skill.id}
              className="py-1 pr-2 cursor-pointer transition-colors rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50"
              style={{ paddingLeft: `${8 + 1 * 16}px` }}
              onClick={(e) => {
                e.stopPropagation()
                handleSelectSkill(skill)
              }}
            >
              {skill.name}
            </div>
          ))}
        </TreeNode>
      )}
    </div>
  )
}
