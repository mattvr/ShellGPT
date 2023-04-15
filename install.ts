import { DEFAULT_CONFIG, VERSION, loadConfig, saveConfig } from "./lib/data.ts";
import { REPO_INSTALL_URL, getLatestVersion, install, isLatestVersion } from "./lib/update.ts";

console.log(`%cShellGPT ${VERSION} installer`, 'font-size: 2em; font-weight: bold;')

let config = await loadConfig()
if (config) {
  console.log('Found existing config file at %c~/.gpt/config.json', 'font-weight: bold')
}

const latestVersion = await getLatestVersion()
if (!await isLatestVersion()) {
  console.log(`\nNewer version of ShellGPT is available: %c${VERSION}%c -> %c${latestVersion}`, 'color: #f00', 'color: #000', 'color: #0f0')

  console.log('\n%cPlease run the following command instead to update:', 'font-weight: bold; color: yellow')
  console.log(`%cdeno run -A ${REPO_INSTALL_URL}\n`, 'color: yellow')

  const skip = prompt(`Type 'skip' to continue with the installation of an outdated version.`)

  if (skip && skip.toLowerCase() === 'skip') {
    console.log('Skipping update...')
  }
  else {
    Deno.exit(0)
  }
}

if (!config) {
  console.log('Creating new config at %c~/.gpt/config.json', 'font-weight: bold')
  config = DEFAULT_CONFIG
  saveConfig(config)
}

// What command should be used to invoke gpt?
console.log(`\nWhat command should be used to invoke gpt?\n(default: %c${config.command ?? DEFAULT_CONFIG.command}%c, leave blank to use default)`, 'color: green', 'color: gray')
const command = prompt('>')
if (command) {
  config.command = command
}

// Should the installer automatically update to the latest version?
console.log(`\nWould you like ShellGPT to check for updates?\nOptions: 
%c(y)es - ask before installing [default]%c
(a)uto-update - install updates automatically without asking
(never) - never install or ask
%cleave blank to use default`,
  'color: green', 'color: unset', 'color: gray')
const autoUpdate = prompt('>')
if (autoUpdate && (autoUpdate.toLowerCase() === 'y' || autoUpdate.toLowerCase() === 'yes' || autoUpdate.toLowerCase() === 'n' || autoUpdate.toLowerCase() === 'no')) {
  config.autoUpdate = 'prompt'
}
else if (autoUpdate && (autoUpdate.toLowerCase() === 'a' || autoUpdate.toLowerCase() === 'always')) {
  config.autoUpdate = 'always'
}
else if (autoUpdate && (autoUpdate.toLowerCase() === 'never')) {
  config.autoUpdate = 'never'
}

await saveConfig(config)

const result = await install(config)

if (result.result === 'updated') {
  console.log(`\n%cInstallation complete!`, 'font-weight: bold; color: green')

  console.log(`\nRestart your shell and use via:\n%c$ ${config.command ?? DEFAULT_CONFIG.command} \"your command here\"`, 'font-weight: bold; color: green')

  console.log(`\nTo uninstall, run:\n%c$ deno uninstall %s`, 'color: yellow', config.command ?? DEFAULT_CONFIG.command)

  console.log(`\nConfigure and update via:\n$%c ${config.command ?? DEFAULT_CONFIG.command} --config`, 'font-weight: bold; color: blue')
}

