import { getDatabase } from "./config";
import type {
  SystemPrompt,
  SystemPromptInput,
  UpdateSystemPromptInput,
} from "@/types";

export async function createSystemPrompt(
  input: SystemPromptInput
): Promise<SystemPrompt> {
  const db = await getDatabase();
  const name = input.name.trim();
  const prompt = input.prompt.trim();

  if (!name || !prompt) throw new Error("Fields cannot be empty");

  const result = await db.execute(
    "INSERT INTO system_prompts (name, prompt) VALUES (?, ?)",
    [name, prompt]
  );
  const inserted = await db.select<SystemPrompt[]>(
    "SELECT * FROM system_prompts WHERE id = ?",
    [result.lastInsertId]
  );
  return inserted[0];
}

export async function getAllSystemPrompts(): Promise<SystemPrompt[]> {
  const db = await getDatabase();
  return await db.select<SystemPrompt[]>(
    "SELECT * FROM system_prompts ORDER BY created_at DESC"
  );
}

export async function updateSystemPrompt(
  id: number,
  input: UpdateSystemPromptInput
): Promise<SystemPrompt> {
  const db = await getDatabase();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name.trim());
  }
  if (input.prompt !== undefined) {
    updates.push("prompt = ?");
    values.push(input.prompt.trim());
  }
  values.push(id);

  await db.execute(
    `UPDATE system_prompts SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
  const result = await db.select<SystemPrompt[]>(
    "SELECT * FROM system_prompts WHERE id = ?",
    [id]
  );
  return result[0];
}

export async function deleteSystemPrompt(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM system_prompts WHERE id = ?", [id]);
}