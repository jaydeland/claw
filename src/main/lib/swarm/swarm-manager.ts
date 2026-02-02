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
 * - Coordinator (queen) analyzes tasks and delegates to workers
 * - Workers: coder, reviewer, tester
 *
 * The coordinator uses the Task tool to spawn workers with specific instructions.
 */
export class SwarmManager {
  private agents: Record<string, ParsedAgent> = {}
  private initialized = false

  /**
   * Initialize swarm by loading all agent definitions
   * Must be called before using getAgentsForSDK() or getCoordinatorPrompt()
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
   * Get the coordinator's system prompt with worker context
   * Provides the coordinator with information about available workers
   */
  getCoordinatorPrompt(userTask: string): string {
    if (!this.initialized) {
      throw new Error("[swarm] SwarmManager not initialized. Call initialize() first.")
    }

    const coordinatorAgent = this.agents.coordinator
    if (!coordinatorAgent) {
      throw new Error("[swarm] Coordinator agent not loaded")
    }

    // Build worker descriptions for coordinator context
    const workerInfo = Object.entries(this.agents)
      .filter(([name]) => name !== "coordinator")
      .map(([name, agent]) => `- @${name}: ${agent.description}`)
      .join("\n")

    // Combine coordinator's base prompt with worker context and user task
    return `${coordinatorAgent.prompt}

## Available Workers
${workerInfo}

## User's Task
${userTask}

Analyze this task and delegate to appropriate workers using the Task tool. Use @agent-name syntax when referring to workers.`
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
