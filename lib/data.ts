import { ChatCompletionRequest } from "./ai.ts";
import { genDescriptiveNameForChat } from "./prompts.ts";

export const VERSION = "0.3.9";
export const AUTO_UPDATE_PROBABILITY = 0.1;

export type Config = {
  lastUpdated: string;
  version: string | "unknown";
  command?: string;
  autoUpdate: "never" | "prompt" | "always";
  latestName?: string;
  hasDescriptiveName?: boolean;
  model?: string;
  systemPrompt?: string;
  openAiApiKey?: string;
  wpm?: number;
};

export const DEFAULT_CONFIG: Config = {
  lastUpdated: new Date().toISOString(),
  version: VERSION,
  autoUpdate: "prompt",
  command: "gpt",
  latestName: undefined,
  hasDescriptiveName: undefined,
  model: undefined,
  systemPrompt: undefined,
  openAiApiKey: undefined,
  wpm: undefined,
};

let cachedConfig: Config | null = null;

// set to $HOME
const getBasePath = () => {
  const homeEnvVar = Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
  const home = Deno.env.get(homeEnvVar);
  if (!home) {
    throw new Error(`Environment variable ${homeEnvVar} not found.`);
  }
  return `${home}/.gpt`;
};

const getOrCreatePath = async (
  path: string,
  isJsonFile = false,
): Promise<string> => {
  try {
    if (await Deno.stat(path)) {
      return path;
    }
  } catch (_) {
    // pass
  }

  if (isJsonFile) {
    const dir = path.split("/").slice(0, -1).join("/");
    await Deno.mkdir(
      dir,
      { recursive: true },
    );

    await Deno.writeTextFile(path, "{}");
    return path;
  } else {
    await Deno.mkdir(
      path,
      { recursive: true },
    );
    return path;
  }
};

const getOrCreateHistoryPath = async (): Promise<string> => {
  const path = `${getBasePath()}/history`;
  return await getOrCreatePath(path);
};

const getOrCreateHistorySnippetsFile = async (): Promise<string> => {
  const path = `${getBasePath()}/history-snippets.json`;
  return await getOrCreatePath(path, true);
};

export const getOrCreateConfigFile = async (): Promise<string> => {
  const path = `${getBasePath()}/config.json`;
  return await getOrCreatePath(path, true);
};

const getDatetimeString = () => {
  const now = new Date();
  const formattedDate = now.getFullYear() + "-" +
    (now.getMonth() + 1).toString().padStart(2, "0") + "-" +
    now.getDate().toString().padStart(2, "0") + "_" +
    now.getHours().toString().padStart(2, "0") + "-" +
    now.getMinutes().toString().padStart(2, "0") + "-" +
    now.getSeconds().toString().padStart(2, "0");
  return formattedDate;
};

const meta_getLatest = async (): Promise<
  { name: string; request: ChatCompletionRequest } | null
> => {
  try {
    const config = await loadConfig();
    if (!config?.latestName) {
      return null;
    }
    const latestFullPath =
      `${await getOrCreateHistoryPath()}/${config.latestName}.json`;

    const chatData = await Deno.readTextFile(latestFullPath);
    const chatJson = JSON.parse(chatData);
    return {
      name: config.latestName,
      request: chatJson,
    };
  } catch {
    return null;
  }
};

const meta_getChat = async (
  chatName: string,
): Promise<{ name: string; request: ChatCompletionRequest } | null> => {
  try {
    const fullPath = `${await getOrCreateHistoryPath()}/${chatName}.json`;

    const chatData = await Deno.readTextFile(fullPath);
    const chatJson = JSON.parse(chatData);
    return {
      name: fullPath,
      request: chatJson,
    };
  } catch {
    return null;
  }
};

const meta_write = async (
  req: ChatCompletionRequest,
  isNewOrName: boolean | string,
) => {
  try {
    const config = await loadConfig();
    let latestName = isNewOrName === true
      ? getDatetimeString()
      : typeof isNewOrName === "string"
      ? isNewOrName
      : (config?.latestName ?? getDatetimeString());

    const latestFullPath =
      `${await getOrCreateHistoryPath()}/${latestName}.json`;
    let finalFullPath = latestFullPath;

    let hasDescriptiveName = !isNewOrName || config?.hasDescriptiveName;
    if (!hasDescriptiveName && req.messages.length >= 5) {
      // Write out a descriptive name for continued chats of a certain length
      const descName = await genDescriptiveNameForChat(req);
      if (descName) {
        latestName = descName;
        finalFullPath = `${await getOrCreateHistoryPath()}/${latestName}.json`;
        hasDescriptiveName = true;
      }
    }

    const chatJson: ChatCompletionRequest = { ...req };
    try {
      const chatData = await Deno.readTextFile(latestFullPath);

      // merge messages
      chatJson.messages = [
        ...JSON.parse(chatData),
        ...chatJson.messages,
      ];

      // Delete since we're about to rewrite it
      await Deno.remove(latestFullPath);
    } catch (_) {
      // failed but its all good
    }

    await Promise.all([
      saveConfig({
        ...config,
        latestName,
        hasDescriptiveName,
      }),
      Deno.writeTextFile(finalFullPath, JSON.stringify(chatJson)),
    ]);
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const writeChat = async (
  req: ChatCompletionRequest,
  isNewOrName: boolean | string = true,
) => {
  await meta_write(req, isNewOrName);
};

export const getChat = async (
  name: string | undefined,
): Promise<ChatCompletionRequest | null> => {
  if (name) {
    return (await meta_getChat(name))?.request || null;
  }
  return (await meta_getLatest())?.request || null;
};

/**
 * Get the history of chats
 * @example [{ name: '2021-01-01_12-00-00', time: Date }, { name: '2021-01-01_12-00-00', time: Date }]
 */
export const getHistory = async (): Promise<{
  name: string;
  snippet?: string;
  time: Date;
}[]> => {
  const path = await getOrCreateHistoryPath();
  const files = await Deno.readDir(path);

  const historySnippetsPath = await getOrCreateHistorySnippetsFile();
  let historySnippets: { [key: string]: string } = {};
  try {
    const historySnippetsData = await Deno.readTextFile(historySnippetsPath);
    historySnippets = JSON.parse(historySnippetsData);
  } catch {
    // ignore
  }

  // convert AsyncIterable to array of strings
  const fileInfos: {
    name: string;
    snippet?: string;
    time: Date;
  }[] = [];
  for await (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    if (file.name === "meta.json") continue;
    const stat = await Deno.stat(`${path}/${file.name}`);

    fileInfos.push({
      name: file.name.slice(0, -5),
      time: stat.mtime!,
    });
  }

  fileInfos.sort((a, b) => b.time.getTime() - a.time.getTime());

  // add historySnippets
  let generatedSnippets = false;
  const SNIPPET_MAX_LENGTH = 50;
  for (let i = 0; i < fileInfos.length; i++) {
    const fileInfo = fileInfos[i];

    if (historySnippets[fileInfo.name]) {
      fileInfo.snippet = historySnippets[fileInfo.name];
      continue;
    }

    // Generate snippets for the first 10 chats
    const chat = await meta_getChat(fileInfo.name);
    if (chat) {
      const fullText = chat.request.messages
        .filter((m) => m.role !== "system")
        .map((m) => m.content)
        .slice(0, 5)
        .join(" ")
        .replaceAll("\n", " ");

      const snippet = fullText.length > SNIPPET_MAX_LENGTH
        ? `${fullText.slice(0, SNIPPET_MAX_LENGTH)}...`
        : fullText;
      fileInfo.snippet = snippet;
      historySnippets[fileInfo.name] = snippet;
      generatedSnippets = true;
    }
  }

  if (generatedSnippets) {
    await Deno.writeTextFile(
      historySnippetsPath,
      JSON.stringify(historySnippets),
    );
  }

  return fileInfos;
};

export const loadConfig = async (): Promise<Config | null> => {
  if (cachedConfig) {
    return cachedConfig;
  }
  const configPath = await getOrCreateConfigFile();
  try {
    const configData = await Deno.readTextFile(configPath);
    const configJson = JSON.parse(configData);
    cachedConfig = configJson;
    return configJson;
  } catch {
    console.warn(`Failed to load config at ${configPath}`);
    return null;
  }
};

export const saveConfig = async (config: Partial<Config>) => {
  const configPath = await getOrCreateConfigFile();

  await Deno.writeTextFile(
    configPath,
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      version: VERSION,
      autoUpdate: "prompt",
      ...config,
    }),
  );
};
