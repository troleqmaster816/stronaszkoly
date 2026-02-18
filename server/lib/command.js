import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function detectPythonCommand() {
  const tryCmd = (cmd) => {
    const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
    return res && res.status === 0
  }
  if (tryCmd('python')) return 'python'
  if (tryCmd('python3')) return 'python3'
  if (process.platform === 'win32' && tryCmd('py')) return 'py'
  return null
}

export async function runCommand(cmd, args, options = {}) {
  const { timeoutMs = 0, killAfterMs = 5000, ...spawnOptions } = options
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...spawnOptions })
    let stdout = ''
    let stderr = ''
    let timeoutHandle = null
    let killHandle = null
    let timedOut = false

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        try { child.kill('SIGTERM') } catch {}
        killHandle = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
        }, killAfterMs)
      }, timeoutMs)
    }

    if (child.stdout) child.stdout.on('data', (d) => (stdout += d.toString()))
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => { stderr += String(err) })
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (killHandle) clearTimeout(killHandle)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

export function parseStructuredJobOutput(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
  for (const line of lines) {
    if (!line.startsWith('{') || !line.endsWith('}')) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'ok')) {
        return parsed
      }
    } catch {}
  }
  return null
}

function getRequirementsHash(requirementsPath) {
  try {
    if (!existsSync(requirementsPath)) return null
    const content = readFileSync(requirementsPath, 'utf8')
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

export async function ensurePythonDepsInstalled({ pythonCmd, requirementsPath, scriptsDir, pipMarkersDir, pipTimeoutMs }) {
  const hash = getRequirementsHash(requirementsPath)
  const markerName = hash ? `.pip_installed_${hash}.txt` : '.pip_installed.txt'
  const markerPath = join(pipMarkersDir, markerName)
  if (existsSync(markerPath)) return { skipped: true }
  if (!existsSync(requirementsPath)) return { skipped: true }
  const pipArgs = ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', requirementsPath]
  const pip = await runCommand(pythonCmd, pipArgs, { cwd: scriptsDir, env: process.env, timeoutMs: pipTimeoutMs })
  if (pip.timedOut) return { error: `pip timeout after ${pipTimeoutMs}ms` }
  if (pip.code !== 0) return { error: pip.stderr.slice(-4000) }
  try { mkdirSync(pipMarkersDir, { recursive: true }) } catch {}
  try { writeFileSync(markerPath, String(Date.now()), 'utf8') } catch {}
  return { skipped: false }
}
