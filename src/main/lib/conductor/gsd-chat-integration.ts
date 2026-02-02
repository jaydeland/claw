import { getDatabase } from "../db"
import { projects, chats, subChats } from "../db/schema"
import { eq, and, desc } from "drizzle-orm"
import { createId } from "../db/utils"
import type { Chat, SubChat } from "../db/schema"

/**
 * Get or create a chat for a project with title "GSD: {projectName}"
 *
 * This creates a dedicated chat for running GSD commands related to the project.
 *
 * @param projectId - ID of the project
 * @returns The GSD chat for the project
 */
export async function getOrCreateGsdChat(projectId: string): Promise<Chat> {
  const db = getDatabase()
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()

  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const chatTitle = `GSD: ${project.name}`

  // Look for existing GSD chat
  let chat = db
    .select()
    .from(chats)
    .where(and(eq(chats.projectId, projectId), eq(chats.name, chatTitle)))
    .get()

  if (!chat) {
    // Create new GSD chat
    chat = db
      .insert(chats)
      .values({
        id: createId(),
        name: chatTitle,
        projectId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .get()

    console.log(`[GSD Chat Integration] Created GSD chat for project ${project.name}:`, chat.id)
  }

  return chat
}

/**
 * Get or create active sub-chat for GSD commands
 *
 * Looks for the most recent agent-mode sub-chat. If none exists, creates one.
 *
 * @param chatId - ID of the parent chat
 * @returns The active sub-chat for GSD execution
 */
export async function getOrCreateGsdSubChat(
  chatId: string
): Promise<SubChat> {
  const db = getDatabase()

  // Look for existing active sub-chat in agent mode
  let subChat = db
    .select()
    .from(subChats)
    .where(and(eq(subChats.chatId, chatId), eq(subChats.mode, "agent")))
    .orderBy(desc(subChats.createdAt))
    .limit(1)
    .get()

  if (!subChat) {
    // Create new sub-chat
    subChat = db
      .insert(subChats)
      .values({
        id: createId(),
        chatId,
        name: "GSD Execution",
        mode: "agent",
        messages: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .get()

    console.log(`[GSD Chat Integration] Created GSD sub-chat:`, subChat.id)
  }

  return subChat
}

/**
 * Add a message to a sub-chat
 *
 * Appends a new message to the sub-chat's message history.
 *
 * @param subChatId - ID of the sub-chat
 * @param role - Message role (user or assistant)
 * @param content - Message content
 */
export async function addMessageToSubChat(
  subChatId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const db = getDatabase()
  const subChat = db.select().from(subChats).where(eq(subChats.id, subChatId)).get()

  if (!subChat) {
    throw new Error(`Sub-chat not found: ${subChatId}`)
  }

  const messages = JSON.parse(subChat.messages || "[]")
  messages.push({
    role,
    content,
    timestamp: Date.now(),
  })

  db.update(subChats)
    .set({
      messages: JSON.stringify(messages),
      updatedAt: new Date(),
    })
    .where(eq(subChats.id, subChatId))
    .run()

  console.log(`[GSD Chat Integration] Added ${role} message to sub-chat ${subChatId}`)
}

/**
 * Create a GSD command message in the appropriate chat
 *
 * This is the main entry point for auto-creating GSD commands when
 * Conductor job statuses change.
 *
 * @param projectId - ID of the project
 * @param command - GSD command to execute (e.g., "/gsd:execute-phase 3")
 * @returns Chat and sub-chat IDs for navigation
 */
export async function createGsdCommandMessage(
  projectId: string,
  command: string
): Promise<{ chatId: string; subChatId: string }> {
  const chat = await getOrCreateGsdChat(projectId)
  const subChat = await getOrCreateGsdSubChat(chat.id)

  await addMessageToSubChat(subChat.id, "user", command)

  return {
    chatId: chat.id,
    subChatId: subChat.id,
  }
}
