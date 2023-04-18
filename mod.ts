import { parse } from "https://deno.land/std@0.181.0/flags/mod.ts";
import { ChatCompletionRequest, Message, StreamResponse, getChatResponse_stream } from "./lib/ai.ts";
import { AUTO_UPDATE_PROBABILITY, Config, DEFAULT_CONFIG, getChat, getHistory, getOrCreateConfigFile, loadConfig, saveConfig, writeChat } from "./lib/data.ts";
import { printCtrlSequence, pullCharacter } from "./lib/lib.ts";
import { setCodeCmdParamsForChat, setExecutableCmdParamsForChat } from "./lib/prompts.ts";
import { exec as shExec } from "./lib/shell.ts";
import { install, isLatestVersion } from "./lib/update.ts";

const args = parse(Deno.args, {
  boolean: [
    // Instructions for this script
    'help',

    // Runs through persistent configuration
    'config',

    // Continuation (continue last conversation)
    'continue', 'cont', 'c',

    // Exec (run as a shell command)
    'exec', 'x',

    // Retry (re-generate the last assistant message)
    'retry', 'r',

    // Rewrite (reword the last user message)
    'rewrite', 'rw', 'w',

    // Pop (remove the last message in the conversation)
    'pop',

    // Print (print the last message in the conversation)
    'print', 'p',

    // Slice (remove the first message in the conversation)
    'slice', 's',

    // History (list chat history)
    'history', 'h',

    // Dump (dump the entire chat history)
    'dump', 'd',

    // Fast (use GPT-3.5-turbo)
    'fast', 'f',

    // Update (update ShellGPT)
    'update', 'u',

    // REPL (continuous conversation)
    'repl',

    // Code mode (output code instead of text)
    'code',
  ],
  string: [
    // Name (select a conversation from history to use)
    'name', 'n',

    // System (set a system prompt / context)
    'system', 'sys',

    // Temperature (creativity)
    'temperature', 'temp', 't',

    // Limit max tokens to output
    'max_tokens', 'max',

    // WPM (words per minute, speed of typing output)
    'wpm',

    // Model (manually use a different OpenAI model)
    'model', 'm',
  ],
})

// --- Parse Args ---
const DEFAULT_MODEL = 'gpt-4'
const DEFAULT_WPM = 800
const DEFAULT_FAST_WPM = 1200
const AVG_CHARS_PER_WORD = 4.8

const help = args.help
const name = args.name || args.n
const fast = args.f || args.fast
const updateConfig = args.config
const update = args.update || args.u
const model = fast ? 'gpt-3.5-turbo' as const : (args.model ?? args.m)
const temp = args.t || args.temp || args.temperature
const exec = args.x || args.exec
const retry = args.r || args.retry
const rewrite = args.w || args.rw || args.rewrite
const pop = args.pop
const print = args.p || args.print
const slice = args.s || args.slice
const dump = args.dump || args.d
const cont = slice || pop || retry || rewrite || print || dump || (Boolean(args.c || args.cont || args.continue))
const wpm = args.wpm ? Number(args.wpm) : fast ? DEFAULT_FAST_WPM : DEFAULT_WPM
const history = args.h || args.history
const system = args.sys || args.system
const maxTokens = args.max || args.max_tokens
const readStdin = args._.at(0) === '-' || args._.at(-1) === '-'
const repl = args.repl
const code = args.code
// --- END Parse Args ---

let config = await loadConfig()
const gptCommand = config?.command ?? DEFAULT_CONFIG.command
const configWasEmpty = Object.keys(config ?? {}).length === 0
const messageWasEmpty = args._.length === 0
const shouldAutoUpdate = config?.autoUpdate !== 'never' && Math.random() < AUTO_UPDATE_PROBABILITY

const messageContent = args._.join(' ')

const message: Message = {
  role: 'user',
  content: messageContent
}

const stock: ChatCompletionRequest = {
  model: model ?? config?.model ?? DEFAULT_MODEL,
  messages: []
}

const req: ChatCompletionRequest = (cont || name) ? ((await getChat(name)) ?? stock) : stock

const helpMessage = `
Usage: ${gptCommand} [OPTIONS] [MESSAGE]

Options:
  --help              Show this help message
  --config            Runs configuration
  --update            Updates ShellGPT
  

  -                   Read message from stdin
  -c, --continue      Continue the last conversation
  -x, --exec          Run the generated response as a shell command
  -r, --retry         Re-generate the last assistant message
  -w, --rewrite       Reword the last user message
  -s, --slice         Remove the first message in the conversation
  --pop               Remove the last message in the conversation
  -p, --print         Print the last message in the conversation
  -h, --history       List chat history
  -d, --dump          Dump the entire chat history
  -f, --fast          Use GPT-3.5-turbo model (faster)
  --repl              Start a continuous conversation
  --code              Output code instead of chat text

  -n, --name NAME     Select a conversation from history to use
  --sys, --system     Set a system prompt/context
  -t, --temp          Set the creativity temperature
  --wpm WPM           Set the words per minute
  --max MAX_TOKENS    Set the maximum number of tokens
  -m, --model MODEL   Manually use a different OpenAI model

Examples:
  ${gptCommand} "What is the capital of France?"
  ${gptCommand} -c "Tell me more about Paris."
  ${gptCommand} -x "Create a new file called 'test.txt' and write 'Hello World!' to it."
  cat test.txt | ${gptCommand} - "Invert the capitalization of this text."
`

// --- HANDLE ARGS ---
if (pop) {
  const lastMessage = req.messages.pop()
  if (lastMessage) {
    console.log(`(Removing last message from ${lastMessage!.role})`)
    await writeChat(req, false)
  }
  else {
    console.log('(Found no messages)')
  }
  Deno.exit()
}

if (slice) {
  if (req.messages.length > 1) {
    console.log(`(Removing first message)`)
    req.messages = req.messages.slice(1)
    await writeChat(req, false)
  }
  else {
    console.log("(Found no messages)")
  }
  Deno.exit()
}
if (update || shouldAutoUpdate) {
  const isLatest = await isLatestVersion()
  if (shouldAutoUpdate && isLatest) {
    // do nothing in this case
  }
  else {
    const newConfig = config ?? DEFAULT_CONFIG
    const updateInfo = await install(newConfig, true)
    saveConfig(newConfig)
    if (updateInfo.result === 'updated') {
      console.log('\n%c> Successfully updated!', 'font-weight: bold;')
      Deno.exit()
    }
    else if (updateInfo.result === 'error') {
      console.log('\n%c> Encountered error while updating.', 'font-weight: bold;')
      Deno.exit()
    }
    else {
      console.log('\n%c> No updates found.', 'font-weight: bold;')
      Deno.exit()
    }
  }
}
if (updateConfig || configWasEmpty) {
  if (configWasEmpty) {
    console.log('(No config found. Running initial setup...)\n')
  }
  const newConfig: Config = {
    ...(config ?? DEFAULT_CONFIG)
  }

  const updateInfo = await install(newConfig, true)

  if (updateInfo.result === 'updated') {
    console.log('\n%c> Successfully updated! Please re-run `gpt --config`', 'font-weight: bold;')
    Deno.exit()
  }

  const currentModel = config?.model || DEFAULT_MODEL

  console.log('\n%c> Which OpenAI ChatGPT model would you like to use?', 'font-weight: bold;')
  console.log()
  const model = window.prompt(`You can enter "gpt-4" or "gpt-3.5-turbo". (Leave empty for ${currentModel}):`)

  if (model) {
    newConfig.model = model ?? currentModel
  }

  console.log('\n%c> Would you like to set a custom system prompt to attach to each session?', 'font-weight: bold;')
  if (config?.systemPrompt) {
    console.log(`Current system prompt: ${config.systemPrompt}`)
    console.log()
    const newPrompt = window.prompt(`Enter new prompt (empty to keep, "clear" to remove)`)
    if (newPrompt === 'clear') {
      newConfig.systemPrompt = undefined
    }
    else if (newPrompt) {
      newConfig.systemPrompt = newPrompt
    }
    else {
      newConfig.systemPrompt = config.systemPrompt
    }
  }
  else {
    console.log()
    const newPrompt = window.prompt(`Press enter to skip, or type a new prompt:`)
    if (newPrompt) {
      newConfig.systemPrompt = newPrompt
    }
  }

  try {
    await saveConfig(newConfig)
    console.log(`%cUpdated config file: %c${await getOrCreateConfigFile()}`, 'color: green; font-weight: bold;', 'color: green;')

    if (updateConfig) {
      // Exit only if the user manually requested config update
      Deno.exit()
    } else {
      // Otherwise, continue with the rest of the script
      config = newConfig
      req.model = model ?? config.model ?? DEFAULT_MODEL
    }
  }
  catch (e) {
    console.error(`Failed to update config file at: ${await getOrCreateConfigFile()}`)
    console.error(e)
    Deno.exit(1)
  }
}

if (help) {
  console.log(helpMessage);
  Deno.exit()
}
if (readStdin) {
  message.content += '\n'

  const decoder = new TextDecoder();
  for await (const chunk of Deno.stdin.readable) {
    const textChunk = decoder.decode(chunk);
    message.content += textChunk
  }
}

if (print) {
  // print last message
  const lastMessage = req.messages.pop()
  if (lastMessage) {
    console.log(lastMessage.content)
  }
  else {
    console.log('(Found no messages)')
  }
  Deno.exit()
}

if (dump) {
  for (const message of req.messages) {
    if (message.role === 'user') {
      console.log('---\n')
      console.log(`${message.content}\n`)
      console.log('---\n')
    }
    else {
      console.log(`${message.content}\n`)
    }
  }
  Deno.exit()
}

if (system || (config?.systemPrompt && !cont)) {
  // Add system prompt if set for this message, or is a new conversation
  req.messages.push({
    role: 'system',
    content: system ?? config!.systemPrompt!
  })
}

let empty = false
if (!message.content && !retry && !pop && !history) {
  empty = true
  console.log('(No message passed)\n')
}

if (temp) {
  req.temperature = Number(temp)
}

if (maxTokens) {
  req.max_tokens = Number(maxTokens)
}

if (model) {
  // @ts-ignore Allow any string as model for now
  req.model = model
}

if (retry) {
  // remove last assistant message
  req.messages.pop()
}
if (rewrite) {
  // remove last assistant AND user messages
  req.messages.pop()
  req.messages.pop()
}
if (!retry && !empty) {
  req.messages.push(message)
}

if (exec) {
  setExecutableCmdParamsForChat(req)
} else if (code) {
  setCodeCmdParamsForChat(req)
}

if (history) {
  const files = await getHistory()
  for (const file of files) {
    const hasSnippet = file.snippet && file.snippet.length > 0
    if (hasSnippet) {
      console.log(`%c${file.name}\t\t%c${file.snippet}`, 'color: blue', 'color: gray')
    }
    else {
      console.log(`%c${file.name}`, 'color: blue')
    }
  }
  Deno.exit()
}
// --- END HANDLE ARGS ---

let streamResponse: AsyncIterableIterator<StreamResponse> | null = null

const doStreamResponse = async () => {
  try {
    streamResponse = await getChatResponse_stream(req);
  }
  catch (e) {
    console.error('Unhandled error', e)
    Deno.exit()
  }
}

// STATE
type DoneType = 'with_net' | 'with_write' | 'with_print' | 'none'
let done: DoneType = 'none'
let responseStr = ''
let intermediateStr = ''
let printStr = ''

if (repl && messageWasEmpty) {
  done = 'with_net'
}
else {
  await doStreamResponse()
}

// Done, write it out
const flush = async () => {
  streamResponse = null
  const text = new TextEncoder().encode('\n')
  await Deno.stdout.write(text)

  req.messages.push({
    content: responseStr,
    role: 'assistant'
  })

  await writeChat(req, cont ? false : (name || true))

  if (exec && !readStdin) {
    const promptValue = prompt(`\nAre you SURE you wish to run the above command? (y/N):`)
    if (['y', 'yes'].includes(promptValue?.toLowerCase() ?? '')) {
      // do it
      await shExec(responseStr)
    }
    else {
      console.log('(will not exec command)')
    }
  } else if (exec && readStdin) {
    console.log('(exec not currently supported when reading from stdin)')
  }

  if (repl) {
    responseStr = ''

    await printCtrlSequence('blue')
    await printCtrlSequence('bold')

    const promptValue = prompt(`\n>`)

    // print reset ctrl sequence
    await printCtrlSequence('reset')

    if (promptValue) {
      // do it
      req.messages.push({
        content: promptValue,
        role: 'user'
      })
      done = 'none'
      await doStreamResponse()
    }
  }
  else {
    Deno.exit()
  }
}

// Push strings
{
  (async () => {
    while (true) {
      if (done !== 'none' || !streamResponse) {
        // Spin wait
        await new Promise(resolve => setTimeout(resolve))
        continue
      }
      try {
        for await (const response of streamResponse as AsyncIterableIterator<StreamResponse>) {
          if (response.delta) {
            responseStr += response.delta
            intermediateStr += response.delta
          }
        }
      }
      catch (e) {
        console.error('Unhandled error', e)
        Deno.exit(1)
      }
      done = 'with_net';
    }
  })()
}

// Intermediate string
let startTime = -1
const targetCps = (AVG_CHARS_PER_WORD * wpm) / 60
{
  (async () => {
    while (true) {
      if (done === 'with_write' || (done as DoneType) === 'with_print') {
        // Spin wait
        await new Promise(resolve => setTimeout(resolve))
        continue
      }
      // Go through characters one-by-one and write
      while ((done as DoneType) !== 'with_net' || intermediateStr.length > 0) {
        if (startTime < 0) {
          startTime = Date.now()
        }
        const { char, str } = pullCharacter(intermediateStr)

        printStr += char
        intermediateStr = str
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true)
          }, 1000 / targetCps)
        })
      }
      done = 'with_write'
    }
  })();
}

// Pull strings
{
  const consumeFn = async () => {
    const latest = printStr
    printStr = ''
    if (!latest && done === 'with_write') {
      await flush()
    }
    if (latest) {
      const text = new TextEncoder().encode(latest)
      await Deno.stdout.write(text)
    }
    setTimeout(consumeFn)
  }
  setTimeout(consumeFn);
}
