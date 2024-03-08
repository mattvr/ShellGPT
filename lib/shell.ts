export function getExecPrefix(): string[] {
  const envShell = Deno.env.get('SHELL')
  const platform = Deno.build.os
  if (envShell?.endsWith('pwsh.exe') || envShell?.endsWith('powershell.exe')) {
    return [envShell, '-Command']
  }
  else if (envShell?.endsWith('cmd.exe')) {
    return [envShell, '/C']
  }
  else if (envShell) {
    return [envShell, '-c']
  }
  else if (platform === 'windows') {
    return ['cmd.exe', '/C']
  }
  else {
    return ['sh', '-c']
  }
}

export async function exec(command: string) {
  const commands = command.split('\n')

  for (const command of commands) {
    // Start a shell process and wait for it to finish
    const process = Deno.run({
      cmd: [...getExecPrefix(), command],
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