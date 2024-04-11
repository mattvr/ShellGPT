# ShellGPT

#### [[ <img src="https://user-images.githubusercontent.com/4052466/230916740-3ca70970-67fd-45f2-9a22-c0e51e4292fc.svg" /> Introducing ShellGPT ]](https://twitter.com/matt_fvr/status/1645419221634125828)

A command-line tool that allows you to interact with GPT-4 directly from your
terminal, including long form conversations via chat

https://github.com/mattvr/ShellGPT/assets/4052466/4a72a1b2-2d60-44ff-b491-8057146d71ae

## Basic Usage

To use ShellGPT, simply run the command with your input message:

```sh
gpt "What is the meaning of life, the universe, and everything?"
# ... often humorously said to be the number 42 ...
```

You can also run shell commands with `-x`:

```sh
gpt -x "Undo my last git commit"
# git reset HEAD~1
# Are you SURE you wish to run the above command? (y/N): y

gpt -x "Download the wikipedia page for Capybaras with all images"
# wget -r -l 1 -H -t 1 -nd -N -np -A jpg,jpeg,gif,png -erobots=off https://en.wikipedia.org/wiki/Capybara
```

And pipe input and output, transforming files and commands (pass `-` to accept
stdin):

```sh
cat mod.ts | gpt "Generate a helpful README file for this project" - > README.md

cat crash.log | gpt "Why is this crash occurring?" -

gpt "Output a CSV of 10 notable cities in Japan with their name in English & Japanese plus a fun fact enclosed in quotes" > japan.csv
```

Chat with gpt from the terminal

```sh
gpt --repl

> hello there
Hello! How can I assist you today?

>
```


## Installation

1. Install the
   [Deno runtime](https://deno.land/manual/getting_started/installation).

2. Run the following command to install ShellGPT:

```sh
deno run -rA https://deno.land/x/shellgpt/install.ts
```

3. Ensure `$HOME/.deno/bin` is in your PATH.

```sh
export PATH="$HOME/.deno/bin:$PATH"
```

You can now use `gpt [my request]` - or whatever you named the script during installation

That's it!

Note: If you add that export line to your `.bashrc` or `.zshrc` (or equivalent), remember restarting your shell to get the updated `PATH`

### Configuration

You must set the `OPENAI_API_KEY` environment variable in your current shell,
using a key obtained from https://platform.openai.com/account/api-keys:

```sh
export OPENAI_API_KEY=...
```

You can also set `OPENAI_CHAT_URL` if you'd like to target a different OpenAI-compatible API endpoint (e.g. Local Llama, Anthropic, etc.).

To configure the specific ChatGPT model, system prompt used, and more, you can type `gpt --config`

## Commands and Arguments

### Global Commands

These commands are used for general ShellGPT-wide operations.

| Argument  | Alias | Description                           |
| --------- | ----- | ------------------------------------- |
| --help    |       | Show help                             |
| --config  | --cfg | Configure the model and system prompt |
| --update  |       | Update ShellGPT to the latest version |
| --history | -h    | List all past conversations           |

### Chat Commands

These commands are for specific chats, either new or existing.

| Argument      | Alias      | Description                                          |
| ------------- | ---------- | ---------------------------------------------------- |
| -             |            | Read from stdin                                      |
| --continue    | --cont, -c | Continue the last conversation                       |
| --exec        | -x         | Run the output as a shell command                    |
| --code        |            | Returns code as the response                         |
| --name        | -n         | Name of chat from history to operate the command on  |
| --repl        |            | Enters a REPL mode with continuous chat              |
| --retry       | -r         | Regenerate the last assistant message                |
| --rewrite     | --rw, -w   | Rewrite the last user message & regenerate response  |
| --print       | -p         | Print the last message in the conversation           |
| --pop         |            | Remove the last message in the conversation          |
| --slice       | -s         | Remove the first message in the conversation         |
| --dump        | -d         | Dump the entire chat history                         |
| --fast        | -f         | Use the GPT-3.5-turbo model                          |
| --system      | --sys      | Set a system prompt or context                       |
| --temperature | --temp, -t | Control the model's creativity                       |
| --wpm         |            | Words per minute, control the speed of typing output |
| --max_tokens  | --max      | Maximum number of tokens to generate                 |
| --model       | -m         | Manually use a different OpenAI model                |
| --debug       |            | Print OpenAI API information                         |
| --lang        |            | Sets written or programming language of output       |
| --dims        |            | Sets the dimensions of the embedding (--embed only)  |

### Other Commands

These commands perform non-textual tasks.

| Argument      | Alias      | Description                                          |
| ------------- | ---------- | ---------------------------------------------------- |
| --img         | -i         | Respond with a generated image URL instead of text   |
| --embed       |            | Respond with a vector embedding of the input string  |

## Features

Shell-GPT has some useful and unique features:

- Execute shell commands with a confirmation step (just pass `-x`).
- Supports input/output piping for simple file creation and transformation (see
  [Basic Usage](#basic-usage)).
- Utility commands for convenient chat history viewing and editing.
- Smooth, streaming output, resembling human typing rather than delayed or
  choppy responses.
- Supports generating images, embeddings, and configurable languages.
- Built in Deno for better performance, granular permissions, and easier script
  modification.

## Examples

Continuing the conversation:

```sh
gpt "Give me 5 examples of auto-antonyms"
# Sanction, Bolt, Peruse, Trim, Overlook

gpt -c "Give 5 more"
# Cleave, Dust, Weather, Consult, Off
```

Regenerating the last assistant message:

```sh
gpt "Generate a tweet from the perspective of a cat"
# "Just spent 5 hours napping and now I can't decide if I should eat, stare out the window, or nap some more. #CatLife 🐾😽💤" ...

gpt -r
# Just knocked my hooman's coffee off the counter again... you'd think they'd learn by now nothing is safe at paw level 😹 #LivingLifeOnTheEdge #NineLives
```

Viewing and resuming past conversation history:

```sh
gpt --history
# shellgpt-demo-chat
# cat-tweets
# ...

gpt --name "cat-tweets" "Generate more, please"

gpt --dump # Dumps latest entry in the history
```

Viewing a specific history entry:

```sh
gpt --dump --name "2024-04-11_09-52-56"

---

tell me a joke

---

Why couldn't the bicycle stand up by itself? Because it was two-tired!

```

Setting a system prompt and custom temperature:

```sh
gpt --temp 0.85 --max 250 --sys "An AI personal trainer" "What exercises should I do for leg day?"
```

Increasing the speed of the output using GPT-3.5-turbo and custom WPM:

```sh
gpt --fast --wpm 1500 "How can I improve my programming skills?"
```

Output an image:

```sh
gpt --img "a corgi wearing cashmere pants hacking into myspace.com"
```

Output a vector embedding:
```sh
gpt --embed "The quick brown fox jumped over the lazy dog." --dims=1024 --model=text-embedding-3-large
```

Interactive coding session:

```sh
gpt --code --repl "Write a typescript function that prints the first 100 primes"
```

## Development

To develop `gpt`, first clone the repo, make sure you have the Deno runtime installed (see [Installation instructions](#installation)), and then you can run the code with:

```sh
deno run -A mod.ts
```

For example, if you want to run an interactive chat session, you can do:

```sh
deno run -A mod.ts --repl "Write outline for ShellGPT's README.md file"
```