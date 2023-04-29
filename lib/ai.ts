import {
  ChatCompetionStreamError,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamResponse,
} from "./ai-types.ts";
import { loadConfig } from "./data.ts";

let OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export const aiConfig = {
  debug: false,
};

export const checkAPIKey = async () => {
  if (OPENAI_API_KEY) {
    return;
  }
  const config = await loadConfig();
  if (config?.openAiApiKey) {
    OPENAI_API_KEY = config.openAiApiKey;
    return;
  }

  console.error(
    "Please set the OPENAI_API_KEY environment variable in your current shell, or configure using `gpt --config`",
  );
  Deno.exit(1);
};

export const getChatResponse_withRetries = async (
  req: ChatCompletionRequest,
  retries = 3,
): Promise<string | null> => {
  let response = null;
  for (let i = 0; i < retries; i++) {
    response = await getChatResponse(req);
    if (response) {
      break;
    }
  }
  return response;
};

export const getChatResponse = async (
  req: ChatCompletionRequest,
): Promise<string | null> => {
  if (aiConfig.debug) {
    console.log("Request to OpenAI", req);
  }
  await checkAPIKey();

  const newReq = {
    ...req,
    messages: [...req.messages],
  };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...newReq, stream: false }),
  });
  try {
    const data = await response.json() as ChatCompletionResponse;
    if (aiConfig.debug) {
      console.log("Response from OpenAI", data);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.error("Invalid response from OpenAI", data);
      return null;
    }
    return content;
  } catch (e) {
    console.error("Failed to reply", e);
    return null;
  }
};

export type StreamResponse = {
  done: boolean;
  value: string | null;
  delta: string | null;
};

export const getChatResponse_stream = async (
  req: ChatCompletionRequest,
): Promise<AsyncIterableIterator<StreamResponse>> => {
  if (aiConfig.debug) {
    console.log("Request to OpenAI", req);
  }
  await checkAPIKey();

  req.stream = true;

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  const decoder = new TextDecoder("utf-8");
  const reader = response.body!.getReader();

  let fullMessage = "";

  const iterator = {
    async next(): Promise<IteratorResult<StreamResponse>> {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // DONE by stream close
          return {
            done: true,
            value: { done: true, value: fullMessage, delta: null },
          };
        }

        // TODO: handle multiple messages
        const rawData = decoder.decode(value);
        const chunks = rawData.split("\n\n");

        let newContent = "";
        // accumulate the chunks
        for (const chunk of chunks) {
          const data = chunk.replace("data: ", "");
          if (!data) {
            continue;
          }
          if (data === "[DONE]") {
            // DONE by final message
            return {
              done: true,
              value: { done: true, value: fullMessage, delta: null },
            };
          }

          let parsed = null;
          // remove the "data: " from the beginning of the message
          try {
            parsed = JSON.parse(data) as ChatCompletionStreamResponse;

            if (parsed.choices[0].finish_reason) {
              // DONE by incoming final message
              return {
                done: true,
                value: { done: true, value: fullMessage, delta: null },
              };
            }

            newContent += parsed.choices[0]?.delta?.content ?? "";
          } catch (e: unknown) {
            // throw with added context
            const error = (parsed as unknown as ChatCompetionStreamError | null)
              ?.error;
            if (error?.code === "model_not_found") {
              console.error(
                `%cFailed to find selected OpenAI model: ${req.model}.\n\nSelect a valid model by using \`gpt --config\`%c

You may need to apply for access to GPT-4 via https://openai.com/waitlist/gpt-4-api.\n\n%cUse "gpt-3.5-turbo"%c (or another model from https://platform.openai.com/docs/models/model-endpoint-compatibility) in the meantime.`,
                "font-weight: bold;",
                "font-weight: normal;",
                "font-weight: bold;",
                "font-weight: normal;",
              );
              Deno.exit(1);
            } else {
              console.error(data);
            }
            throw e;
          }
        }

        fullMessage = fullMessage + newContent;
        return {
          value: { done: false, value: fullMessage, delta: newContent || null },
          done: false,
        };
      } catch (e: unknown) {
        console.error("Failed to parse message", e);
        return {
          value: {
            done: true,
            value: fullMessage + "[error]",
            delta: "[error]",
          },
          done: true,
        };
      }
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return iterator;
};
