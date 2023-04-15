// prompt.ts
// echo "test" | deno run prompt.ts

let message = ''
const decoder = new TextDecoder();

for await (const chunk of Deno.stdin.readable) {
  const textChunk = decoder.decode(chunk);
  message += textChunk
}

console.log('got', message)

window.prompt('hello?')