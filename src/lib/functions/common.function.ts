import { Message } from "@/types";

export function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path
    .replace(/\[/g, ".")
    .replace(/\]/g, "")
    .split(".")
    .reduce((o, k) => (o || {})[k], obj);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = (reader.result as string)?.split(",")[1] ?? "";
      resolve(base64data);
    };
    reader.onerror = reject;
  });
}

export function extractVariables(
  curl: string
): { key: string; value: string }[] {
  if (typeof curl !== "string") {
    return [];
  }

  const regex = /\{\{([A-Z_]+)\}\}/g;
  const matches = curl?.match(regex) || [];
  const variables = matches
    .map((match) => {
      if (typeof match === "string") {
        return match.slice(2, -2);
      }
      return "";
    })
    .filter((v) => v !== "");

  const uniqueVariables = [...new Set(variables)];
  const doNotInclude = ["SYSTEM_PROMPT", "TEXT", "IMAGE", "AUDIO"];

  const filteredVariables = uniqueVariables?.filter(
    (variable) => !doNotInclude?.includes(variable)
  );

  return filteredVariables.map((variable) => ({
    key: variable?.toLowerCase()?.replace(/_/g, "_") || "",
    value: variable,
  }));
}

function processUserMessageTemplate(
  template: any,
  userMessage: string,
  imagesBase64: string[] = []
): any {
  const escapeForJson = (value: string) =>
    JSON.stringify(value ?? "").slice(1, -1);

  const templateStr = JSON.stringify(template).replace(
    /\{\{TEXT\}\}/g,
    escapeForJson(userMessage)
  );
  const result = JSON.parse(templateStr);

  const imageReplacer = (node: any): any => {
    if (Array.isArray(node)) {
      const imageTemplateIndex = node.findIndex((item) =>
        JSON.stringify(item).includes("{{IMAGE}}")
      );

      if (imageTemplateIndex > -1) {
        const imageTemplate = node[imageTemplateIndex];
        const imageParts =
          imagesBase64.length > 0
            ? imagesBase64.map((img) => {
                const partStr = JSON.stringify(imageTemplate).replace(
                  /\{\{IMAGE\}\}/g,
                  img
                );
                return JSON.parse(partStr);
              })
            : [];

        const finalArray = [
          ...node.slice(0, imageTemplateIndex),
          ...imageParts,
          ...node.slice(imageTemplateIndex + 1),
        ];
        return finalArray.map(imageReplacer);
      }
      return node.map(imageReplacer);
    } else if (node && typeof node === "object") {
      const newNode: { [key: string]: any } = {};
      for (const key in node) {
        newNode[key] = imageReplacer(node[key]);
      }
      return newNode;
    }
    return node;
  };

  return imageReplacer(result);
}

export function buildDynamicMessages(
  messagesTemplate: any[],
  history: Message[],
  userMessage: string,
  imagesBase64: string[] = []
): any[] {
  const userMessageTemplateIndex = messagesTemplate.findIndex((m) =>
    JSON.stringify(m).includes("{{TEXT}}")
  );

  if (userMessageTemplateIndex === -1) {
    return [...history, { role: "user", content: userMessage }]; 
  }

  const prefixMessages = messagesTemplate.slice(0, userMessageTemplateIndex);
  const suffixMessages = messagesTemplate.slice(userMessageTemplateIndex + 1);
  const userMessageTemplate = messagesTemplate[userMessageTemplateIndex];

  const newUserMessage = processUserMessageTemplate(
    userMessageTemplate,
    userMessage,
    imagesBase64
  );

  return [...prefixMessages, ...history, newUserMessage, ...suffixMessages];
}

export function deepVariableReplacer(
  node: any,
  variables: Record<string, string>
): any {
  if (typeof node === "string") {
    let result = node;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return result;
  }
  if (Array.isArray(node)) {
    return node.map((item) => deepVariableReplacer(item, variables));
  }
  if (node && typeof node === "object") {
    const newNode: { [key: string]: any } = {};
    for (const key in node) {
      newNode[key] = deepVariableReplacer(node[key], variables);
    }
    return newNode;
  }
  return node;
}

export function getStreamingContent(
  chunk: any,
  defaultPath: string
): string | null {
  const possiblePaths = new Set([
    defaultPath.replace(".message.", ".delta."),
    "choices[0].delta.content", 
    "candidates[0].content.parts[0].text", 
    "delta.text", 
    "text", 
    defaultPath,
  ]);

  for (const path of possiblePaths) {
    if (!path) continue;

    const content = getByPath(chunk, path);

    if (typeof content === "string" && content) {
      return content;
    }
  }

  return null;
}