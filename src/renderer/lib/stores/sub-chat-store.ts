// DEPRECATED: This file re-exports from the primary store location
// Use `from "../agents/stores/sub-chat-store"` instead
// This file exists for backward compatibility with existing imports

export {
  useAgentSubChatStore,
  OPEN_SUB_CHATS_CHANGE_EVENT,
  type SubChatMeta,
} from "../../features/agents/stores/sub-chat-store"
