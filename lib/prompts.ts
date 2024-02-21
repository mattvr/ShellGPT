import { getChatResponse_withRetries, ChatCompletionRequest } from "./ai.ts";

export const genDescriptiveNameForChat = async (
  req: ChatCompletionRequest,
): Promise<string | null> => {
  // This function generates a descriptive name from a chat for your history
  // e.g. if you're talking about which car to buy, it will generate a name like "car-buying"

  const newReq = {
    ...req,
    messages: [
      ...req.messages.filter((m) => m.role !== "system"),
      {
        role: "system" as const,
        content:
          `[IMPORTANT INSTRUCTION] Response ONLY with a short, descriptive, hyphenated name that describes the above conversation, in the format: my-chat-name`,
      },
    ],
    model: "gpt-3.5-turbo", // use turbo as its cheaper/faster
  };
  const chatName = await getChatResponse_withRetries(newReq);
  return chatName;
};

export const setExecutableCmdParamsForChat = (
  req: ChatCompletionRequest,
): ChatCompletionRequest => {
  req.messages = req.messages.filter((m) => m.role !== "system"); // other system messages tend to conflict
  req.messages.push({
    role: "system",
    content:
      `[IMPORTANT INSTRUCTION] Reply ONLY with an executable shell command(s) for the given prompt and no other text. NEVER include Markdown (like \`\`\`sh) or any other text. (OS: ${Deno.build.os}} Shell: ${
        Deno.env.get("SHELL") ?? "unknown"
      })`,
  });
  return req;
};

export const setCodeCmdParamsForChat = (
  req: ChatCompletionRequest,
  lang?: string,
): ChatCompletionRequest => {
  req.messages = req.messages.filter((m) => m.role !== "system"); // other system messages tend to conflict
  req.messages.push({
    role: "system",
    content:
      `[IMPORTANT INSTRUCTION] Reply ONLY with code (and comments) ${lang ? `in the ${lang} language ` : ""}for the given prompt with NO surrounding markdown syntax, NO other text or chat.`,
  });
  return req;
};

export const setLanguageForChat = (
  req: ChatCompletionRequest,
  lang: string,
): ChatCompletionRequest => {
  req.messages.push({
    role: "system",
    content: `[IMPORTANT INSTRUCTION] Reply in the ${lang} language for the given prompt.`,
  });
  return req;
}

const dallEPrompt = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:"