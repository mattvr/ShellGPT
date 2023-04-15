import { ChatCompletionRequest, getChatResponse_withRetries } from "./ai.ts";

export const genDescriptiveNameForChat = async (req: ChatCompletionRequest): Promise<string | null> => {
  // This function generates a descriptive name from a chat for your history
  // e.g. if you're talking about which car to buy, it will generate a name like "car-buying"

  const newReq = {
    ...req, messages: [
      ...req.messages.filter(m => m.role !== 'system'),
      {
        role: 'system' as const,
        content: `[IMPORTANT INSTRUCTION] Response ONLY with a short, descriptive, hyphenated name that describes the above conversation, in the format: my-chat-name`
      }
    ],
    model: 'gpt-3.5-turbo' // use turbo as its cheaper/faster
  }
  const chatName = await getChatResponse_withRetries(newReq)
  return chatName
}

export const setExecutableCmdParamsForChat = (req: ChatCompletionRequest): ChatCompletionRequest => {
  req.messages = req.messages.filter(m => m.role !== 'system') // other system messages tend to conflict
  req.messages.push({
    role: 'system',
    content: `[IMPORTANT INSTRUCTION] Reply ONLY with an executable shell command(s) for the given prompt and no other text. (OS: ${Deno.build.os}} Shell: ${Deno.env.get('SHELL') ?? 'unknown'})`
  })
  return req
}