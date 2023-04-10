const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

if (!OPENAI_API_KEY) {
  console.error('Please set the OPENAI_API_KEY environment variable')
  Deno.exit(1)
}

const config = {
  debug: false
}

type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ChatCompletionRequest {
  model: 'gpt-3.5-turbo' | 'gpt-4' | string
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

interface Choice {
  index: number;
  message: Message;
  finish_reason: "stop" | "length" | "content_filter" | "null";
}

interface ChatCompletionResponse {
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

interface SpeechToTextRequest {
  file: File; // You'll need to replace the file path in your curl call with a File object
  model: 'whisper-1';
}

interface Delta {
  role?: Role;
  content?: string;
}

interface StreamChoice {
  delta: Delta;
  index: number;
  finish_reason: "stop" | "length" | "content_filter" | "null" | null;
}

interface ChatCompletionStreamResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
}

export const getChatResponse_withRetries = async (req: ChatCompletionRequest, retries = 3): Promise<string | null> => {
  let response = null
  for (let i = 0; i < retries; i++) {
    response = await getChatResponse(req)
    if (response) {
      break
    }
  }
  return response
}

export const getChatResponse = async (req: ChatCompletionRequest): Promise<string | null> => {
  if (config.debug) {
    console.log('Request to OpenAI', req)
  }

  const newReq = {
    ...req,
    messages: [...req.messages]
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...newReq, stream: false })
  })
  try {
    const data = await response.json() as ChatCompletionResponse
    if (config.debug) {
      console.log('Response from OpenAI', data)
    }
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      console.error('Invalid response from OpenAI', data)
      return null
    }
    return content
  } catch (e) {
    console.error('Failed to reply', e)
    return null
  }
}

type StreamResponse = {
  done: boolean;
  value: string | null;
  delta: string | null;
}

export const getChatResponse_stream = async (req: ChatCompletionRequest): Promise<AsyncIterableIterator<StreamResponse>> => {
  if (config.debug) {
    console.log('Request to OpenAI', req)
  }

  req.stream = true

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(req)
  })

  const decoder = new TextDecoder('utf-8')
  const reader = response.body!.getReader()

  let fullMessage = ''

  const iterator = {
    async next(): Promise<IteratorResult<StreamResponse>> {
      try {
        const { done, value } = await reader.read()
        if (done) {
          // DONE by stream close
          return { done: true, value: { done: true, value: fullMessage, delta: null } }
        }

        // TODO: handle multiple messages
        const rawData = decoder.decode(value)
        const chunks = rawData.split("\n\n");

        let newContent = ''
        // accumulate the chunks
        for (const chunk of chunks) {
          const data = chunk.replace('data: ', '')
          if (!data) {
            continue
          }
          if (data === '[DONE]') {
            // DONE by final message
            return { done: true, value: { done: true, value: fullMessage, delta: null } }
          }

          // remove the "data: " from the beginning of the message
          try {
            const parsed = JSON.parse(data) as ChatCompletionStreamResponse

            if (parsed.choices[0].finish_reason) {
              // DONE by incoming final message
              return { done: true, value: { done: true, value: fullMessage, delta: null } }
            }

            newContent += parsed.choices[0]?.delta?.content ?? ''
          }
          catch (e: unknown) {
            // throw with added context
            (e as Error).message = `Failed to parse message:\n"${data}"\n\n${e}`
            throw e
          }
        }

        fullMessage = (fullMessage + newContent)
        return { value: { done: false, value: fullMessage, delta: newContent || null }, done: false }
      }
      catch (e: unknown) {
        console.error('Failed to parse message', e)
        return { value: { done: true, value: fullMessage + '[error]', delta: '[error]' }, done: true }
      }
    },
    [Symbol.asyncIterator]() {
      return this
    }
  }

  return iterator
}