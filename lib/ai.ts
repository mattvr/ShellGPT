export type Role = "system" | "user" | "assistant";
type ResponseFormat = 'url' | 'b64_json';
type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
type ModelType = 'dall-e-2' | 'dall-e-3';
type ImageStyle = 'vivid' | 'natural';
type ImageQuality = 'standard' | 'hd';

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

export interface ChatCompetionStreamError {
  "error": {
    "message": string | null,
    "type": string | null
    "param": string | null
    "code": string | null
  }
}
export interface CreateImageRequest {
  prompt: string;
  model?: ModelType;
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
  model?: ModelType;
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
  model?: ModelType;
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


const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_URL = Deno.env.get("OPENAI_CHAT_URL") || "https://api.openai.com/v1/chat/completions";
const OPENAI_IMG_URL = Deno.env.get("OPENAI_IMG_URL") || "https://api.openai.com/v1/images/generations";

export const aiConfig = {
  debug: false,
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
  if (aiConfig.debug) {
    console.log("Request to OpenAI", req);
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
  req: ChatCompletionRequest
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
          if (result.done) {
            isDone = true;
            break;
          }
          buffer += decoder.decode(result.value);
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
          // remove the "data: " from the beginning of the message
          const data = chunk.substring(6);
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
            parsed = JSON.parse(data) as ChatCompletionStreamResponse;

            newContent += parsed.choices[0]?.delta?.content ?? "";

            if (parsed.choices[0].finish_reason) {
              isDone = true;
              break;
            }
          } catch (e: unknown) {
            // throw with added context
            const error = (parsed as unknown as ChatCompetionStreamError | null)
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
      }
      catch (e) {
        console.error("Error in stream", e);
        controller.error(e);
      }
      controller.close();
    }
  });

  return stream;
};


export const getImageResponse = async (
  req: CreateImageRequest
): Promise<string | null /* url */> => {
  if (aiConfig.debug) {
    console.log("Request to OpenAI", req);
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
    if (aiConfig.debug) {
      console.log("Response from OpenAI", data);
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