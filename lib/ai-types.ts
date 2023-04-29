export type Role = "system" | "user" | "assistant";

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