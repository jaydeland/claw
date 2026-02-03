import {
  loadSwarmAgents,
  SWARM_AGENT_NAMES,
  type ParsedAgent,
  type AgentModel,
} from "../trpc/routers/agent-utils"

/**
 * SwarmManager - Orchestrates loading and configuration of swarm agents
 *
 * Swarm mode uses a hierarchical topology:
 * - Orchestrator (team leader/Opus) analyzes tasks and delegates to workers
 * - Workers: coder (Sonnet), reviewer (Opus), tester (Sonnet)
 *
 * Workflow: Orchestrator → Coders → Reviewer (3-5 iterations) → Tester
 * The orchestrator uses the Task tool to spawn workers with specific instructions.
 */
export class SwarmManager {
  private agents: Record<string, ParsedAgent> = {}
  private initialized = false

  /**
   * Initialize swarm by loading all agent definitions
   * Must be called before using getAgentsForSDK() or getOrchestratorPrompt()
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[swarm] Already initialized, skipping")
      return
    }

    console.log("[swarm] Initializing SwarmManager...")
    this.agents = await loadSwarmAgents()

    // Validate required agents are loaded
    const missing = SWARM_AGENT_NAMES.filter((name) => !this.agents[name])
    if (missing.length > 0) {
      throw new Error(`[swarm] Missing required agents: ${missing.join(", ")}`)
    }

    this.initialized = true
    console.log("[swarm] Initialized with agents:", Object.keys(this.agents).join(", "))
  }

  /**
   * Get agents configuration for Claude SDK Options
   * Returns all swarm agents in SDK-compatible format
   */
  getAgentsForSDK(): Record<
    string,
    { description: string; prompt: string; tools?: string[]; model?: AgentModel }
  > {
    if (!this.initialized) {
      throw new Error("[swarm] SwarmManager not initialized. Call initialize() first.")
    }

    return Object.entries(this.agents).reduce(
      (acc, [name, agent]) => {
        acc[name] = {
          description: agent.description,
          prompt: agent.prompt,
          ...(agent.tools && { tools: agent.tools }),
          ...(agent.model && { model: agent.model }),
        }
        return acc
      },
      {} as Record<string, { description: string; prompt: string; tools?: string[]; model?: AgentModel }>
    )
  }

  /**
   * Get the orchestrator's system prompt with worker context
   * Provides the orchestrator with information about available workers
   */
  getOrchestratorPrompt(userTask: string): string {
    if (!this.initialized) {
      throw new Error("[swarm] SwarmManager not initialized. Call initialize() first.")
    }

    const orchestratorAgent = this.agents.orchestrator
    if (!orchestratorAgent) {
      throw new Error("[swarm] Orchestrator agent not loaded")
    }

    // Build worker descriptions for orchestrator context
    const workerInfo = Object.entries(this.agents)
      .filter(([name]) => name !== "orchestrator")
      .map(([name, agent]) => `- @${name}: ${agent.description}`)
      .join("\n")

    // Combine orchestrator's base prompt with worker context and user task
    return `${orchestratorAgent.prompt}

## Available Workers
${workerInfo}

## User's Task
${userTask}

Analyze this task, determine coder allocation, and execute the full workflow with mandatory review cycles (3-5 iterations). Use @agent-name syntax when referring to workers.`
  }

  /**
   * Backwards compatibility alias for getOrchestratorPrompt
   * @deprecated Use getOrchestratorPrompt instead
   */
  getCoordinatorPrompt(userTask: string): string {
    return this.getOrchestratorPrompt(userTask)
  }

  /**
   * Get a specific agent by name
   */
  getAgent(name: string): ParsedAgent | undefined {
    return this.agents[name]
  }

  /**
   * Check if swarm is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Reset the manager (for testing)
   */
  reset(): void {
    this.agents = {}
    this.initialized = false
    console.log("[swarm] SwarmManager reset")
  }
}

// Singleton instance
let swarmManagerInstance: SwarmManager | null = null

/**
 * Get or create the SwarmManager singleton
 * Automatically initializes on first call
 */
export async function getSwarmManager(): Promise<SwarmManager> {
  if (!swarmManagerInstance) {
    swarmManagerInstance = new SwarmManager()
    await swarmManagerInstance.initialize()
  }
  return swarmManagerInstance
}

/**
 * Reset the SwarmManager singleton (for testing)
 */
export function resetSwarmManager(): void {
  if (swarmManagerInstance) {
    swarmManagerInstance.reset()
    swarmManagerInstance = null
  }
}
