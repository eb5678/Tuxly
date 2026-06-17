export const MESSAGE_ID_OFFSET = 1;
export const DOWNLOAD_SUCCESS_DISPLAY_MS = 1000;
export const CONVERSATION_ID_RANDOM_LENGTH = 9;

export function generateConversationId(
  source: "chat" | "sysaudio" = "chat"
): string {
  const timestamp = Date.now();
  const random = Math.random()
    .toString(36)
    .substring(2, 2 + CONVERSATION_ID_RANDOM_LENGTH);
  const prefix = source === "sysaudio" ? "sysaudio_conv" : "conv";
  return `${prefix}_${timestamp}_${random}`;
}

export function generateMessageId(
  role: "user" | "assistant" | "system",
  timestamp: number = Date.now()
): string {
  return `msg_${timestamp}_${role}`;
}

export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random()
    .toString(36)
    .substring(2, 2 + CONVERSATION_ID_RANDOM_LENGTH);
  return `req_${timestamp}_${random}`;
}