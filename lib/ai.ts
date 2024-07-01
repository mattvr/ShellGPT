export type Role = "system" | "user" | "assistant";
type ResponseFormat = 'url' | 'b64_json';
type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
type ImageModelType = 'dall-e-2' | 'dall-e-3';
type ImageStyle = 'vivid' | 'natural';
type ImageQuality = 'standard' | 'hd';
export type EmbedModelType = 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002'

export interface Message {
  role: Role;
  content: string;
}

export interface ChatCompletionRequest {
  model: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-1106-preview' | string
  messages: Message[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: "stop" | "length" | "content_filter" | "null";
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  choices: Choice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SpeechToTextRequest {
  file: File;
  model: 'whisper-1';
}

export interface Delta {
  role?: Role;
  content?: string;
}

export interface StreamChoice {
  delta: Delta;
  index: number;
  finish_reason: "stop" | "length" | "content_filter" | "null" | null;
}

export interface ChatCompletionStreamResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface AnthropicChatCompletionStreamResponse {
  type: "ping" | "message_start" | "content_block_start" | "content_block_delta" | "content_block_stop" | "message_delta" | "message_stop";
  index: number,
  delta: {
    stop_reason?: string,
  } | {
    type: "text"
    text: string;
  }
}

export interface ChatCompletionStreamError {
  "error": {
    "message": string | null,
    "type": string | null
    "param": string | null
    "code": string | null
  }
}
export interface CreateImageRequest {
  prompt: string;
  model?: ImageModelType;
  n?: number | null;
  quality?: ImageQuality;
  response_format?: ResponseFormat | null;
  size?: ImageSize | null;
  style?: ImageStyle | null;
  user?: string;
}

export interface ImageObject {
  url: string;
}

export interface CreateImageResponse {
  created: number;
  data: ImageObject[];
}

export interface CreateImageEditRequest {
  image: File; // Assuming this is a file object
  prompt: string;
  mask?: File;
  model?: ImageModelType;
  n?: number | null;
  size?: ImageSize | null;
  response_format?: ResponseFormat | null;
  user?: string;
}

interface CreateImageEditResponse {
  created: number;
  data: ImageObject[];
}

export interface CreateImageVariationRequest {
  image: File;
  model?: ImageModelType;
  n?: number | null;
  response_format?: ResponseFormat | null;
  size?: ImageSize | null;
  user?: string;
}

export interface CreateImageVariationResponse {
  created: number;
  data: ImageObject[];
}

export interface Image {
  b64_json?: string; // Optional as it depends on the response format
  url?: string;      // Optional as it depends on the response format
  revised_prompt?: string;
}

export interface EmbeddingRequest {
  model: EmbedModelType | string;
  input: string;
  dimensions?: number;
}

export interface EmbeddingResponse {
  data: EmbeddingObject[]
}

export interface EmbeddingObject {
  object: "embedding";
  embedding: number[];
  index: number
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_URL = Deno.env.get("OPENAI_CHAT_URL") || "https://api.openai.com/v1/chat/completions";
const OPENAI_IMG_URL = Deno.env.get("OPENAI_IMG_URL") || "https://api.openai.com/v1/images/generations";
const OPENAI_EMBEDDING_URL = Deno.env.get("OPENAI_EMBEDDING_URL") || "https://api.openai.com/v1/embeddings";
const OPENAI_ORGANIZATION = Deno.env.get("OPENAI_ORGANIZATION") || null;

export const aiConfig: {
  debug: 'verbose' | 'none';
} = {
  debug: 'none',
};

export const checkAPIKey = (key?: string) => {
  if (key || OPENAI_API_KEY) {
    return;
  }

  console.error(
    "Please set the OPENAI_API_KEY environment variable.",
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
  params?: {
    apiKey?: string,
    apiUrl?: string,
    headers?: Record<string, string>,
  }
): Promise<string | null> => {
  if (aiConfig.debug === 'verbose') {
    console.warn("[request]", req);
  }

  checkAPIKey(params?.apiKey);

  const newReq = {
    ...req,
    messages: [...req.messages],
  };

  const response = await fetch(params?.apiUrl ?? OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params?.apiKey ?? OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      ...(params?.headers ?? {})
    },
    body: JSON.stringify({ ...newReq, stream: false }),
  });
  try {
    const data = await response.json() as ChatCompletionResponse;
    if (aiConfig.debug === 'verbose') {
      console.warn("[response]", data);
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
  req: ChatCompletionRequest
): Promise<AsyncIterableIterator<StreamResponse>> => {
  if (aiConfig.debug === 'verbose') {
    console.warn("[request]", req);
  }
  await checkAPIKey();

  req.stream = true;

  const isAnthropic = OPENAI_CHAT_URL.toLowerCase().includes('anthropic.com')
  if (isAnthropic) {
    req.max_tokens = 2048; // required

    // remove 'system' messages and concat them to system top level key
    const sysMessages = req.messages.filter(m => m.role === 'system')
    if (sysMessages.length > 0) {
      (req as any).system = sysMessages.map(m => m.content).join('\n')
      req.messages = req.messages.filter(m => m.role !== 'system')
    }
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      ...(isAnthropic ? {
        "anthropic-beta": "messages-2023-12-15",
        "anthropic-version": "2023-06-01",
        "x-api-key": OPENAI_API_KEY!,
      } : {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        ...(OPENAI_ORGANIZATION ? { "OpenAI-Organization": OPENAI_ORGANIZATION } : {}),
      }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (response.status !== 200) {
    console.error("Failed to start stream", response.status, response.statusText);
    Deno.exit(1);
  }

  const decoder = new TextDecoder("utf-8");
  const reader = response.body!.getReader();

  let fullMessage = "";

  let buffer = ""
  const MAX_ITERS = 20

  const iterator = {
    async next(): Promise<IteratorResult<StreamResponse>> {
      try {
        let isDone = false;
        let iters = 0
        let frameEnd = buffer.indexOf("\n\n")
        while (frameEnd === -1 && iters++ < MAX_ITERS) {
          const result = await reader.read();
          if (result.value) {
            buffer += decoder.decode(result.value);
          }
          if (result.done) {
            isDone = true;
            if (aiConfig.debug === 'verbose') {
              console.warn('[done] iters:', iters);
            }
            break;
          }
        }

        const chunks = []
        frameEnd = buffer.indexOf("\n\n")
        while (frameEnd !== -1) {
          chunks.push(buffer.substring(0, frameEnd))
          buffer = buffer.substring(frameEnd + 2)
          frameEnd = buffer.indexOf("\n\n")
        }

        let newContent = "";

        // accumulate the chunks
        for (const chunk of chunks) {
          if (aiConfig.debug === 'verbose') {
            console.warn('[chunk]', chunk);
          }

          // remove the "[...]: " from the beginning of the message
          let chunkWithData = chunk;
          if (chunk.startsWith('event:')) {
            // Remove the first line
            chunkWithData = chunk.substring(chunk.indexOf("\n") + 1)
          }

          const data = chunkWithData.substring(6);
          if (!data) {
            continue;
          }
          if (data === "[DONE]") {
            // DONE by final message
            isDone = true;
            break;
          }

          let parsed = null;
          try {
            parsed = JSON.parse(data);

            if (parsed.error) {
              const error = (parsed as unknown as ChatCompletionStreamError).error
              throw new Error(error.message ?? "Unknown error")
            }


            if (isAnthropic) {
              const response = parsed as AnthropicChatCompletionStreamResponse;
              newContent += (response?.delta as any)?.text ?? ""

              if (response.type === "message_stop") {
                isDone = true;
                break;
              }
            }
            else {
              const response = parsed as ChatCompletionStreamResponse;
              newContent += response.choices[0]?.delta?.content ?? ""

              if (parsed.choices[0].finish_reason) {
                isDone = true;
                break;
              }
            }
          } catch (e: unknown) {
            // throw with added context
            const error = (parsed as unknown as ChatCompletionStreamError | null)
              ?.error;
            if (error?.code === "model_not_found") {
              console.error(
                `%cFailed to find selected OpenAI model: ${req.model}.\n\nSelect a valid model by using \`gpt --config\`%c

Check available model names from https://platform.openai.com/docs/models/model-endpoint-compatibility.`,
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

        // Pass thru the "done" state
        return {
          value: { done: isDone, value: fullMessage, delta: newContent || null },
          done: isDone,
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

export const getChatResponse_stream2 = async (
  req: ChatCompletionRequest
): Promise<ReadableStream<string>> => {
  const iterator = await getChatResponse_stream(req);

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const value of iterator) {
          controller.enqueue(value.value ?? "");
        }

        // Don't drop the last message
        const last = await iterator.next();
        if (last.done && last.value) {
          controller.enqueue(last.value.value ?? "");
        }
      }
      catch (e) {
        console.error("Error in stream", e);
      }
      controller.close();
    }
  });

  return stream;
};


export const getImageResponse = async (
  req: CreateImageRequest
): Promise<string | null /* url */> => {
  if (aiConfig.debug === 'verbose') {
    console.warn("[request]", req);
  }
  await checkAPIKey();

  const response = await fetch(OPENAI_IMG_URL, {
    "method": "POST",
    "headers": {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "body": JSON.stringify(req),
  })

  try {
    const data = await response.json() as CreateImageResponse;
    if (aiConfig.debug === 'verbose') {
      console.warn("[response]", data);
    }
    const url = data?.data?.[0]?.url;
    if (!url) {
      console.error("Invalid response from OpenAI", data);
      return null;
    }
    return url;
  } catch (e) {
    console.error("Failed to reply", e);
    return null;
  }
}

export const getEmbeddingResponse = async (
  req: EmbeddingRequest
): Promise<number[] | null> => {
  if (aiConfig.debug === 'verbose') {
    console.warn("[request]", req);
  }
  await checkAPIKey();

  const response = await fetch(OPENAI_EMBEDDING_URL, {
    "method": "POST",
    "headers": {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "body": JSON.stringify(req),
  })

  try {
    const data = await response.json() as EmbeddingResponse;
    if (aiConfig.debug === 'verbose') {
      console.warn("[response]", data);
    }
    return data.data[0].embedding
  } catch (e) {
    console.error("Failed to reply", e);
    return null;
  }
}