import { Config, VERSION } from "./data.ts";
import { getExecPrefix } from "./shell.ts";

const API_LAND_URL = 'https://apiland.deno.dev/v2/modules/shellgpt'
const REPO_URL = 'https://deno.land/x/shellgpt'
const REPO_MOD_URL = 'https://deno.land/x/shellgpt/mod.ts'
export const REPO_INSTALL_URL = 'https://deno.land/x/shellgpt/install.ts'

let latestVersion = 'unknown'

export const getLatestVersion = async () => {
  if (latestVersion !== 'unknown') {
    return latestVersion
  }
  try {
  const response = await fetch(API_LAND_URL)
  const data = await response.json()
  latestVersion = data.latest_version
  return latestVersion
  }
  catch (e) {
    return 'unknown'
  }
}

export const isLatestVersion = async () => {
  const latestVersion = await getLatestVersion()
  const currentVersion = VERSION

  if (latestVersion === 'unknown') {
    // Failed to fetch
    return true
  }

  // do semver comparison
  const [latestMajor, latestMinor, latestPatch] = latestVersion.split('.').map(v => parseInt(v))
  const [currentMajor, currentMinor, currentPatch] = currentVersion.split('.').map(v => parseInt(v))

  if (latestMajor > currentMajor) {
    return false
  }
  else if (latestMajor === currentMajor) {
    if (latestMinor > currentMinor) {
      return false
    }
    else if (latestMinor === currentMinor) {
      if (latestPatch > currentPatch) {
        return false
      }
    }
  }

  return true
}

/**
 * Install & auto-update ShellGPT
 * @param config Config to use (DOES NOT SAVE UPDATES TO FILE)
 */
export const install = async (config: Config, isUpdate = false): Promise<{
  result: 'updated' | 'error' | 'ignored',
  autoUpdate: 'prompt' | 'never' | 'always',
  latestVersion: string,
  currentVersion: string,
}> => {
  const currentVersion = VERSION
  if (config.autoUpdate === 'never') {
    return {
      result: 'ignored',
      autoUpdate: config.autoUpdate,
      latestVersion: 'unknown',
      currentVersion,
    }
  }

  if (isUpdate) {
    const latestVersion = await getLatestVersion()

    if (await isLatestVersion()) {
      console.log(`This is the latest version of ShellGPT. (%c${currentVersion}%c)`, 'color: #0f0', 'color: #000')
      return {
        result: 'ignored',
        autoUpdate: config.autoUpdate,
        latestVersion,
        currentVersion,
      }
    }

    console.log(`Newer version of ShellGPT is available: %c${currentVersion}%c -> %c${latestVersion}`, 'color: #f00', 'color: #000', 'color: #0f0')
  }

  // get invocation of gpt
  const alias = config.command ?? 'gpt'

  let installCommand: string;
  if (isUpdate) {
    installCommand = `deno install -frA -n ${alias} ${REPO_URL}@${latestVersion}/mod.ts`
  } else {
    const modPath = Deno.mainModule.replace('install.ts', 'mod.ts')
    installCommand = `deno install -frA -n ${alias} ${modPath}`
  }

  console.log(`\n$ %c${installCommand}`, 'color: blue')

  if (config.autoUpdate !== 'always' || !isUpdate) {
    if (isUpdate) {
      const result = prompt('Would you like to install the latest version of ShellGPT?\n(Y)es / (n)o / (never) / (a)lways]:')

      if (result && (result.toLowerCase() === 'n' || result.toLowerCase() === 'no')) {
        return {
          result: 'ignored',
          autoUpdate: config.autoUpdate,
          latestVersion,
          currentVersion,
        }
      }
      if (result && (result.toLowerCase() === 'a' || result.toLowerCase() === 'always')) {
        config.autoUpdate = 'always'
      }
      if (result && (result.toLowerCase() === 'never')) {
        config.autoUpdate = 'never'

        return {
          result: 'ignored',
          autoUpdate: config.autoUpdate,
          latestVersion,
          currentVersion,
        }
      }
    }
    else {
      console.log(`Would you like to run the above command to install ShellGPT?\n%c(y)es [default]\n%c(n)o\n%cleave blank to use default`, 'color: green', 'color: unset', 'color: gray')
      const result = prompt('>')

      if (result && (result.toLowerCase() === 'n' || result.toLowerCase() === 'no')) {
        return {
          result: 'ignored',
          autoUpdate: config.autoUpdate,
          latestVersion,
          currentVersion,
        }
      }
    }
  }

  const command = Deno.run({
    cmd: [...getExecPrefix(), installCommand],
    stdout: 'inherit',
    stderr: 'inherit'
  })

  const status = await command.status()
  if (!status.success) {
    console.error(`Shell command failed: ${installCommand}`)
    console.error(`Exit code: ${status.code}`)
    command.close()

    return {
      result: 'error',
      autoUpdate: config.autoUpdate,
      latestVersion,
      currentVersion,
    }
  }

  command.close()

  return {
    result: 'updated',
    autoUpdate: config.autoUpdate,
    latestVersion,
    currentVersion,
  }
}