import { ChatCompletionRequest, getChatResponse_withRetries } from "./ai.ts"

export type Config = {
  latestName?: string,
  hasDescriptiveName?: boolean,
  model?: string,
  systemPrompt?: string,
}

// set to $HOME
const getBasePath = () => {
  const homeEnvVar = Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
  const home = Deno.env.get(homeEnvVar);
  if (!home) {
    throw new Error(`Environment variable ${homeEnvVar} not found.`);
  }
  return `${home}/.gpt`;
}

const getOrCreatePath = async (path: string, isJsonFile = false): Promise<string> => {
  try {
    if (await Deno.stat(path)) {
      return path;
    }
  }
  catch (_) {
    // pass
  }

  if (isJsonFile) {
    const dir = path.split('/').slice(0, -1).join('/')
    await Deno.mkdir(
      dir,
      { recursive: true },
    );

    await Deno.writeTextFile(path, '{}')
    return path;
  }
  else {
    await Deno.mkdir(
      path,
      { recursive: true },
    );
    return path;
  }
}

const getOrCreateHistoryPath = async (): Promise<string> => {
  const path = `${getBasePath()}/history`;
  return await getOrCreatePath(path);
}

export const getOrCreateConfigPath = async (): Promise<string> => {
  const path = `${getBasePath()}/config.json`
  return await getOrCreatePath(path, true);
}

const getDatetimeString = () => {
  const now = new Date();
  const formattedDate = now.getFullYear() + "-" +
    (now.getMonth() + 1).toString().padStart(2, "0") + "-" +
    now.getDate().toString().padStart(2, "0") + "_" +
    now.getHours().toString().padStart(2, "0") + "-" +
    now.getMinutes().toString().padStart(2, "0") + "-" +
    now.getSeconds().toString().padStart(2, "0");
  return formattedDate
}

const meta_getLatest = async (): Promise<{ name: string, request: ChatCompletionRequest } | null> => {
  try {
    const config = await loadConfig()
    if (!config?.latestName) {
      return null
    }
    const latestFullPath = `${await getOrCreateHistoryPath()}/${config.latestName}.json`

    const chatData = await Deno.readTextFile(latestFullPath)
    const chatJson = JSON.parse(chatData)
    return {
      name: config.latestName,
      request: chatJson
    }
  }
  catch {
    return null
  }
}

const meta_getChat = async (chatName: string): Promise<{ name: string, request: ChatCompletionRequest } | null> => {
  try {
    const fullPath = `${await getOrCreateHistoryPath()}/${chatName}.json`

    const chatData = await Deno.readTextFile(fullPath)
    const chatJson = JSON.parse(chatData)
    return {
      name: fullPath,
      request: chatJson
    }
  }
  catch {
    return null
  }
}

const meta_write = async (req: ChatCompletionRequest, isNew: boolean) => {
  try {
    const config = await loadConfig()
    let latestName = isNew ? getDatetimeString() : (config?.latestName ?? getDatetimeString())
    const latestFullPath = `${await getOrCreateHistoryPath()}/${latestName}.json`
    let finalFullPath = latestFullPath

    let hasDescriptiveName = !isNew && config?.hasDescriptiveName
    if (!hasDescriptiveName && req.messages.length >= 6) {
      const descName = await meta_genDescriptiveName(req)
      if (descName) {
        latestName = descName
        finalFullPath = `${await getOrCreateHistoryPath()}/${latestName}.json`
        hasDescriptiveName = true
      }
    }

    const chatJson: ChatCompletionRequest = { ...req }
    try {
      const chatData = await Deno.readTextFile(latestFullPath)

      // merge messages
      chatJson.messages = [
        ...JSON.parse(chatData),
        ...chatJson.messages
      ]

      // Delete since we're about to rewrite it
      await Deno.remove(latestFullPath)
    }
    catch (_) {
      // failed but its all good
    }

    await Promise.all([
      Deno.writeTextFile(await getOrCreateConfigPath(), JSON.stringify({
        ...config,
        latestName,
        hasDescriptiveName
      })),
      Deno.writeTextFile(finalFullPath, JSON.stringify(chatJson))
    ])

  }
  catch (e) {
    console.error(e)
    return null
  }
}

export const meta_genDescriptiveName = async (req: ChatCompletionRequest) => {
  const newReq = {
    ...req, messages: [
      ...req.messages,
      {
        role: 'system' as const,
        content: `INSTRUCTION: Please respond with ONLY a short, descriptive, hyphenated name that describes the above conversation.`
      }
    ]
  }
  const chatName = await getChatResponse_withRetries(newReq)
  return chatName
}

export const writeChat = async (req: ChatCompletionRequest, isNew = true) => {
  await meta_write(req, isNew)
}

export const getChat = async (name: string | undefined): Promise<ChatCompletionRequest | null> => {
  if (name) {
    return (await meta_getChat(name))?.request || null
  }
  return (await meta_getLatest())?.request || null
}

export const getHistory = async (): Promise<{
  name: string,
  time: Date
}[]> => {
  const path = await getOrCreateHistoryPath()
  const files = await Deno.readDir(path)

  // convert AsyncIterable to array of strings
  const fileInfos = []
  for await (const file of files) {
    if (!file.name.endsWith('.json')) continue
    if (file.name === 'meta.json') continue
    const stat = await Deno.stat(`${path}/${file.name}`)

    fileInfos.push({
      name: file.name.slice(0, -5),
      time: stat.mtime!
    })
  }

  fileInfos.sort((a, b) => b.time.getTime() - a.time.getTime())

  return fileInfos
}

export const loadConfig = async (): Promise<Config | null> => {
  const configPath = await getOrCreateConfigPath()
  try {
    const configData = await Deno.readTextFile(configPath)
    const configJson = JSON.parse(configData)
    return configJson
  }
  catch {
    console.warn(`Failed to load config at ${configPath}`)
    return null
  }
}

export const saveConfig = async (config: Config) => {
  const configPath = await getOrCreateConfigPath()
  await Deno.writeTextFile(configPath, JSON.stringify(config))
}