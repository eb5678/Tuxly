import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import { Message, TYPE_PROVIDER } from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import curl2Json from "@bany/curl-to-json";

// Eliminate repeated overhead of AST CURL parsing
const parsedCurlMap = new Map<string, any>();

function getPreParsedCurl(curlStr: string) {
  if (!parsedCurlMap.has(curlStr)) {
     const parsed = curl2Json(curlStr);
     if (parsedCurlMap.size > 25) parsedCurlMap.clear(); // Keep dict clean
     parsedCurlMap.set(curlStr, parsed);
  }
  return parsedCurlMap.get(curlStr);
}

function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const prompts: string[] = [];
  if (baseSystemPrompt) prompts.push(baseSystemPrompt);
  return prompts.join("\n\n");
}

export async function* fetchAIResponse(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: { provider: string; variables: Record<string, string>; };
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  try {
    const { provider, selectedProvider, systemPrompt, history = [], userMessage, imagesBase64 = [], signal } = params;

    if (signal?.aborted) return;

    const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);
    if (!provider) throw new Error(`Provider not provided`);
    if (!selectedProvider) throw new Error(`Selected provider not provided`);

    let curlJson;
    try {
      curlJson = getPreParsedCurl(provider.curl);
    } catch (error) {
      throw new Error(`Failed to parse curl: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const extractedVariables = extractVariables(provider.curl);
    const requiredVars = extractedVariables.filter(({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE");
    
    for (const { key } of requiredVars) {
      if (!selectedProvider.variables?.[key] || selectedProvider.variables[key].trim() === "") {
        throw new Error(`Missing required variable: ${key}. Please configure it in settings.`);
      }
    }

    if (!userMessage) throw new Error("User message is required");
    if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
      throw new Error(`Provider ${provider?.id ?? "unknown"} does not support image input`);
    }

    let bodyObj: any = curlJson.data ? JSON.parse(JSON.stringify(curlJson.data)) : {};
    const messagesKey = Object.keys(bodyObj).find((key) => ["messages", "contents", "conversation", "history"].includes(key));

    if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
      const finalMessages = buildDynamicMessages(bodyObj[messagesKey], history, userMessage, imagesBase64);
      bodyObj[messagesKey] = finalMessages;
    }

    const allVariables = {
      ...Object.fromEntries(Object.entries(selectedProvider.variables).map(([key, value]) => [key.toUpperCase(), value])),
      SYSTEM_PROMPT: enhancedSystemPrompt || "",
    };

    bodyObj = deepVariableReplacer(bodyObj, allVariables);
    let url = deepVariableReplacer(curlJson.url || "", allVariables);
    const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
    headers["Content-Type"] = "application/json";

    if (provider?.streaming && typeof bodyObj === "object" && bodyObj !== null) {
      const streamKey = Object.keys(bodyObj).find((k) => k.toLowerCase() === "stream");
      if (streamKey) bodyObj[streamKey] = true;
      else bodyObj.stream = true;
    }

    const fetchFunction = tauriFetch;
    let response;
    try {
      response = await fetchFunction(url, {
        method: curlJson.method || "POST",
        headers,
        body: curlJson.method === "GET" ? undefined : JSON.stringify(bodyObj),
        signal,
      });
    } catch (fetchError) {
      if (signal?.aborted || (fetchError instanceof Error && fetchError.name === "AbortError")) return;
      yield `Network error during API request: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`;
      return;
    }

    if (!response.ok) {
      let errorText = "";
      try { errorText = await response.text(); } catch {}
      yield `API request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
      return;
    }

    if (!provider?.streaming) {
      let json;
      try { json = await response.json(); } catch (parseError) {
        yield `Failed to parse non-streaming response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`;
        return;
      }
      yield getByPath(json, provider?.responseContentPath || "") || "";
      return;
    }

    if (!response.body) {
      yield "Streaming not supported or response body missing";
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      let readResult;
      try {
        readResult = await reader.read();
      } catch (readError) {
        if (signal?.aborted || (readError instanceof Error && readError.name === "AbortError")) return;
        yield `Error reading stream: ${readError instanceof Error ? readError.message : "Unknown error"}`;
        return;
      }
      
      const { done, value } = readResult;
      if (done) break;
      if (signal?.aborted) { reader.cancel(); return; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const trimmed = line.substring(5).trim();
          if (!trimmed || trimmed === "[DONE]") continue;
          try {
            const parsed = JSON.parse(trimmed);
            const delta = getStreamingContent(parsed, provider?.responseContentPath || "");
            if (delta) yield delta;
          } catch (e) {
            // Ignored, partial bytes
          }
        }
      }
    }
  } catch (error) {
     throw new Error(`Error in fetchAIResponse: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}