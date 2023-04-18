/**
 * TODO
 */
export async function askQuestion(question: string): Promise<string> {
  console.log(question);

  if (Deno.build.os === "windows") {
    const command = Deno.run({
      cmd: ["choice", "/C", "yn"],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await command.output();
    const answer = new TextDecoder().decode(output).trim();

    if (answer === "Y") {
      return "yes";
    } else {
      return "no";
    }
  } else {
    const command = Deno.run({
      cmd: ["read"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    // const input = new TextEncoder().encode("yes\nno\n");
    // await command.stdin.write(input);
    // command.stdin.close();

    const result = await command.status();
    // const output = await command.stdout.read(input);
    // const answer = new TextDecoder().decode(output).trim();

    return 'asdf';
  }
}

export const printCtrlSequence = async (sequence: 'blue' | 'bold' | 'reset' | 'blue-bold'): Promise<void> => {
  let text;
  switch (sequence) {
    case 'blue':
      text = '\x1b[34m';
      break;
    case 'bold':
      text = '\x1b[1m';
      break;
    case 'reset':
      text = '\x1b[0m';
      break;
    default:
      text = '';
  }

  await Deno.stdout.write(new TextEncoder().encode(text));
}

export const mergeStrings = (a: string, b: string): string => {
  return a + b
}

export const pullCharacter = (a: string): {
  char: string
  str: string
} => {
  if (a.length === 0) {
    return {
      char: '',
      str: ''
    }
  }

  // Grapheme split
  const stringArray = [...a];

  // Slice the array
  const slicedArray = stringArray.slice(1);

  // Join back into string
  return {
    char: stringArray[0],
    str: slicedArray.join('')
  }
}