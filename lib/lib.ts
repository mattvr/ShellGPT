export async function executeShellCommands(command: string) {
  const commands = command.split('\n')

  for (const command of commands) {
    const preamble = Deno.build.os === 'windows' ? ['cmd', '/c'] : ['sh', '-c']

    // Start a shell process and wait for it to finish
    const process = Deno.run({
      cmd: [...preamble, command],
      stdout: "inherit",
      stderr: "inherit",
    });

    const status = await process.status(); // Wait for the process to finish

    if (!status.success) {
      console.error(`Shell command failed: ${command}`);
      console.error(`Exit code: ${status.code}`);
    }

    process.close();
  }
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