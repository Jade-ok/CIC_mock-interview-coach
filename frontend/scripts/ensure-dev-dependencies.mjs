import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('..', import.meta.url))
const viteBinary = fileURLToPath(new URL('../node_modules/.bin/vite', import.meta.url))
const esbuildBinary = fileURLToPath(new URL('../node_modules/.bin/esbuild', import.meta.url))

if (existsSync(viteBinary) && existsSync(esbuildBinary)) {
  process.exit(0)
}

console.log('Frontend dependencies are incomplete; running npm ci before Vite starts...')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const install = spawnSync(npmCommand, ['ci'], {
  cwd: frontendRoot,
  stdio: 'inherit',
})

if (install.error) {
  console.error(`Unable to run npm ci: ${install.error.message}`)
  process.exit(1)
}

if (install.status !== 0) {
  console.error('npm ci did not finish successfully. Resolve the error above, then run npm run dev again.')
  process.exit(install.status ?? 1)
}

if (!existsSync(viteBinary) || !existsSync(esbuildBinary)) {
  console.error('npm ci completed without installing the required Vite dependencies.')
  process.exit(1)
}
