import { getDatabase } from "./config";
import { ChatConversation } from "@/types";
import { safeLocalStorage } from "@/lib";

const LEGACY_CHAT_HISTORY_KEY = "chat_history";

interface DbConversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  attached_files: string | null;
}

function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error("Failed to parse JSON:", error);
    return fallback;
  }
}

function validateConversation(conversation: ChatConversation): boolean {
  if (!conversation.id || typeof conversation.id !== "string") return false;
  if (!conversation.title || typeof conversation.title !== "string") return false;
  if (!Array.isArray(conversation.messages)) return false;
  return true;
}

function validateMessage(message: any): boolean {
  if (!message.id || typeof message.id !== "string") return false;
  if (!message.role || !["user", "assistant", "system"].includes(message.role)) return false;
  if (typeof message.content !== "string") return false;
  if (typeof message.timestamp !== "number" || message.timestamp < 0) return false;
  return true;
}

async function createConversation(conversation: ChatConversation): Promise<ChatConversation> {
  if (!validateConversation(conversation)) throw new Error("Invalid conversation data");
  const db = await getDatabase();

  try {
    await db.execute(
      "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [
        conversation.id,
        conversation.title,
        conversation.createdAt || Date.now(),
        conversation.updatedAt || Date.now(),
      ]
    );

    for (const message of conversation.messages) {
      if (!validateMessage(message)) continue;
      const attachedFilesJson = message.attachedFiles ? JSON.stringify(message.attachedFiles) : null;

      await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, timestamp, attached_files) VALUES (?, ?, ?, ?, ?, ?)",
        [
          message.id,
          conversation.id,
          message.role,
          message.content,
          message.timestamp,
          attachedFilesJson,
        ]
      );
    }
    return conversation;
  } catch (error) {
    await db.execute("DELETE FROM conversations WHERE id = ?", [conversation.id]).catch(() => {});
    throw error;
  }
}

export async function getAllConversations(): Promise<ChatConversation[]> {
  const db = await getDatabase();
  try {
    const conversations = await db.select<DbConversation[]>("SELECT * FROM conversations ORDER BY updated_at DESC");
    if (conversations.length === 0) return [];

    const conversationIds = conversations.map((c) => c.id);
    const placeholders = conversationIds.map(() => "?").join(",");
    const allMessages = await db.select<DbMessage[]>(
      `SELECT * FROM messages WHERE conversation_id IN (${placeholders}) ORDER BY conversation_id, timestamp ASC`,
      conversationIds
    );

    const messagesByConversation = new Map<string, DbMessage[]>();
    for (const msg of allMessages) {
      if (!messagesByConversation.has(msg.conversation_id)) messagesByConversation.set(msg.conversation_id, []);
      messagesByConversation.get(msg.conversation_id)!.push(msg);
    }

    return conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      messages:
        messagesByConversation.get(conv.id)?.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          attachedFiles: safeJsonParse(msg.attached_files, undefined),
        })) || [],
    }));
  } catch (error) {
    throw error;
  }
}

export async function getConversationById(id: string): Promise<ChatConversation | null> {
  if (!id || typeof id !== "string") return null;
  const db = await getDatabase();
  try {
    const conversations = await db.select<DbConversation[]>("SELECT * FROM conversations WHERE id = ?", [id]);
    if (conversations.length === 0) return null;

    const conv = conversations[0];
    const messages = await db.select<DbMessage[]>(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
      [id]
    );

    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        attachedFiles: safeJsonParse(msg.attached_files, undefined),
      })),
    };
  } catch (error) {
    return null;
  }
}

async function updateConversation(conversation: ChatConversation): Promise<ChatConversation> {
  if (!validateConversation(conversation)) throw new Error("Invalid conversation data");
  const db = await getDatabase();

  try {
    const updateResult = await db.execute(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
      [conversation.title, conversation.updatedAt, conversation.id]
    );

    if (updateResult.rowsAffected === 0) throw new Error("Conversation not found");

    const existingRows = await db.select<{id: string}[]>(
      "SELECT id FROM messages WHERE conversation_id = ?", 
      [conversation.id]
    );
    const existingIds = new Set(existingRows.map(r => r.id));

    for (const message of conversation.messages) {
      if (!validateMessage(message)) continue;
      
      if (existingIds.has(message.id)) continue;

      const attachedFilesJson = message.attachedFiles ? JSON.stringify(message.attachedFiles) : null;

      await db.execute(
        `INSERT INTO messages (id, conversation_id, role, content, timestamp, attached_files) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          conversation.id,
          message.role,
          message.content,
          message.timestamp,
          attachedFilesJson,
        ]
      );
    }
    return conversation;
  } catch (error) {
    throw error;
  }
}

export async function saveConversation(conversation: ChatConversation): Promise<ChatConversation> {
  if (!validateConversation(conversation)) throw new Error("Invalid conversation data");
  try {
    const existing = await getConversationById(conversation.id);
    return existing ? await updateConversation(conversation) : await createConversation(conversation);
  } catch (error) {
    throw error;
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  if (!id || typeof id !== "string") return false;
  const db = await getDatabase();
  try {
    const result = await db.execute("DELETE FROM conversations WHERE id = ?", [id]);
    return result.rowsAffected > 0;
  } catch (error) {
    throw error;
  }
}

export async function deleteAllConversations(): Promise<void> {
  const db = await getDatabase();
  try {
    await db.execute("DELETE FROM messages");
    await db.execute("DELETE FROM conversations");
  } catch (error) {
    throw error;
  }
}

export function generateConversationTitle(userMessage: string): string {
  return userMessage.trim();
}

export async function migrateLocalStorageToSQLite(): Promise<{ success: boolean; migratedCount: number; error?: string }> {
  // Existing logic unchanged...
  const migrationKey = "chat_history_migrated_to_sqlite";

  try {
    if (safeLocalStorage.getItem(migrationKey) === "true") return { success: true, migratedCount: 0 };
    const existingData = safeLocalStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
    if (!existingData) {
      safeLocalStorage.setItem(migrationKey, "true");
      return { success: true, migratedCount: 0 };
    }

    let conversations: ChatConversation[] = [];
    try {
      const parsed = JSON.parse(existingData);
      conversations = Array.isArray(parsed) ? parsed : [];
    } catch (parseError) {
      safeLocalStorage.setItem(migrationKey, "true");
      return { success: false, migratedCount: 0, error: "Failed to parse localStorage data" };
    }

    if (conversations.length === 0) {
      safeLocalStorage.setItem(migrationKey, "true");
      return { success: true, migratedCount: 0 };
    }

    const db = await getDatabase();
    let migratedCount = 0;
    let errorCount = 0;

    for (const conversation of conversations) {
      try {
        if (!conversation?.id || !conversation?.title) {
          errorCount++;
          continue;
        }

        const existing = await getConversationById(conversation.id);
        if (existing) continue;

        await db.execute(
          "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [conversation.id, conversation.title, conversation.createdAt || Date.now(), conversation.updatedAt || Date.now()]
        );

        if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
          for (const message of conversation.messages) {
            if (!message?.id || !message?.role || typeof message?.content !== "string") continue;
            const attachedFilesJson = message.attachedFiles ? JSON.stringify(message.attachedFiles) : null;
            await db.execute(
              "INSERT INTO messages (id, conversation_id, role, content, timestamp, attached_files) VALUES (?, ?, ?, ?, ?, ?)",
              [message.id, conversation.id, message.role, message.content, message.timestamp || Date.now(), attachedFilesJson]
            );
          }
        }
        migratedCount++;
      } catch (convError) {
        errorCount++;
        await db.execute("DELETE FROM conversations WHERE id = ?", [conversation?.id]).catch(() => {});
      }
    }

    safeLocalStorage.setItem(migrationKey, "true");
    safeLocalStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);

    return {
      success: migratedCount > 0 || errorCount === 0,
      migratedCount,
      error: errorCount > 0 ? `${errorCount} conversations failed to migrate` : undefined,
    };
  } catch (error) {
    safeLocalStorage.setItem(migrationKey, "true");
    return { success: false, migratedCount: 0, error: error instanceof Error ? error.message : String(error) };
  }
}