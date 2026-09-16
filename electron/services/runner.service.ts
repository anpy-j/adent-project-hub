import { spawn, execFile } from 'child_process'
import type { ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'fs'
import type { TaskHistory, LogChunk } from '../../src/types'
import { projectRepo } from '../db/repositories'
import { resolveRunCommand } from '../strategies/project-commands'
import { getDb } from '../db'

interface RunningTask {
  process: ChildProcess
  task: TaskHistory
  logPath: string
}

class RunnerService {
  private running = new Map<string, RunningTask>()

  async start(projectId: string, sender: (channel: string, payload: unknown) => void): Promise<string> {
    const project = projectRepo.get(projectId)
    if (!project) throw new Error(`项目不存在: ${projectId}`)
    const cmd = resolveRunCommand(project)
    return this.spawnTask(projectId, cmd, 'run', sender)
  }

  async startCustom(
    projectId: string,
    input: { bin: string; args: string[]; display?: string },
    sender: (channel: string, payload: unknown) => void
  ): Promise<string> {
    const project = projectRepo.get(projectId)
    if (!project) throw new Error(`项目不存在: ${projectId}`)
    const display = input.display || [input.bin, ...input.args].join(' ')
    return this.spawnTask(
      projectId,
      { bin: input.bin, args: input.args, env: { ...process.env }, cwd: project.path, display },
      'run',
      sender
    )
  }

  private async spawnTask(
    projectId: string,
    cmd: { bin: string; args: string[]; env: Record<string, string | undefined>; cwd: string; display: string },
    type: TaskHistory['type'],
    sender: (channel: string, payload: unknown) => void
  ): Promise<string> {
    const taskId = randomUUID()
    const logPath = this.ensureLogPath(taskId)

    const task: TaskHistory = {
      id: taskId,
      project_id: projectId,
      type,
      status: 'running',
      command: cmd.display,
      log_path: logPath,
      pid: null,
      exit_code: null,
      started_at: new Date().toISOString(),
      ended_at: null
    }

    const child = spawn(cmd.bin, cmd.args, {
      cwd: cmd.cwd,
      env: cmd.env,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })

    task.pid = child.pid ?? null
    this.persistTask(task)

    const entry: RunningTask = { process: child, task, logPath }
    this.running.set(taskId, entry)

    projectRepo.update(projectId, { last_run_at: task.started_at })

    const emit = (stream: 'stdout' | 'stderr', data: string) => {
      const chunk: LogChunk = { taskId, stream, data, timestamp: Date.now() }
      sender('runner:log', chunk)
      appendFileSync(logPath, data)
    }

    child.stdout?.on('data', (d: Buffer) => emit('stdout', d.toString()))
    child.stderr?.on('data', (d: Buffer) => emit('stderr', d.toString()))

    child.on('exit', (code, signal) => {
      let status: TaskHistory['status'] = 'failed'
      if (code === 0) status = 'success'
      else if (signal === 'SIGTERM' || signal === 'SIGKILL') status = 'stopped'
      const finalTask: TaskHistory = {
        ...task,
        status,
        exit_code: code,
        ended_at: new Date().toISOString()
      }
      this.updateTaskStatus(finalTask)
      sender('runner:status', finalTask)
      this.running.delete(taskId)
    })

    child.on('error', (err) => {
      emit('stderr', `[进程错误] ${err.message}\n`)
    })

    sender('runner:status', task)
    return taskId
  }

  async stop(taskId: string): Promise<void> {
    const entry = this.running.get(taskId)
    if (!entry) return
    const pid = entry.process.pid
    const killGroup = (signal: NodeJS.Signals): void => {
      try {
        if (process.platform !== 'win32' && pid) {
          process.kill(-pid, signal) // 负 PID = 杀整个进程组（shell + 子进程）
        } else {
          entry.process.kill(signal)
        }
      } catch {
        try {
          entry.process.kill(signal)
        } catch {
          // ignore
        }
      }
    }
    killGroup('SIGTERM')
    // 3 秒后仍在运行则强杀
    setTimeout(() => {
      if (this.running.has(taskId)) killGroup('SIGKILL')
    }, 3000)
  }

  probeExternal(projectPath: string): Promise<{ running: boolean; processes: Array<{ pid: number; command: string }> }> {
    return new Promise((resolve) => {
      const prefix = projectPath.endsWith('/') ? projectPath : projectPath + '/'
      execFile(
        'lsof',
        ['-w', '-n', '-d', 'cwd', '-F', 'pn'],
        { maxBuffer: 8 * 1024 * 1024, timeout: 20000 },
        (err, stdout) => {
          if (err) return resolve({ running: false, processes: [] })
          const pids = new Set<number>()
          let cur: number | null = null
          for (const line of String(stdout || '').split('\n')) {
            if (line.startsWith('p')) cur = Number(line.slice(1))
            else if (line.startsWith('n') && cur && line.slice(1) === projectPath) pids.add(cur)
          }
          if (!pids.size) return resolve({ running: false, processes: [] })
          execFile('ps', ['-o', 'pid=,command=', '-p', [...pids].join(',')], (e2, out2) => {
            const procs = String(out2 || '')
              .split('\n')
              .filter((l) => l.trim())
              .map((l) => {
                const [pidStr, ...rest] = l.trim().split(/\s+/)
                return { pid: Number(pidStr), command: rest.join(' ') }
              })
              .filter((p) => p.pid && !p.command.includes('lsof'))
            resolve({ running: procs.length > 0, processes: procs })
          })
        }
      )
    })
  }

  listRunning(): TaskHistory[] {
    return Array.from(this.running.values()).map((e) => e.task)
  }

  readLog(taskId: string): string {
    const entry = this.running.get(taskId)
    const logPath = entry?.logPath
    if (logPath && existsSync(logPath)) {
      return readFileSync(logPath, 'utf-8')
    }
    return ''
  }

  cleanupAll(): void {
    for (const [id, entry] of this.running) {
      try {
        if (process.platform !== 'win32' && entry.process.pid) {
          process.kill(-entry.process.pid, 'SIGKILL')
        } else {
          entry.process.kill('SIGKILL')
        }
      } catch {
        // ignore
      }
      this.running.delete(id)
    }
  }

  private ensureLogPath(taskId: string): string {
    const dir = join(app.getPath('userData'), 'logs', 'tasks')
    mkdirSync(dir, { recursive: true })
    return join(dir, `${taskId}.log`)
  }

  private persistTask(task: TaskHistory): void {
    getDb()
      .prepare(
        `INSERT INTO task_history (id, project_id, type, status, command, log_path, pid, started_at)
         VALUES (@id, @project_id, @type, @status, @command, @log_path, @pid, @started_at)`
      )
      .run(task)
  }

  private updateTaskStatus(task: Partial<TaskHistory> & { id: string }): void {
    getDb()
      .prepare(
        `UPDATE task_history SET status = ?, exit_code = ?, ended_at = ? WHERE id = ?`
      )
      .run(task.status, task.exit_code, task.ended_at, task.id)
  }
}

export const runnerService = new RunnerService()

export function getMainWindowSender(): ((channel: string, payload: unknown) => void) | null {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return null
  const win = wins[0]
  return (channel: string, payload: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
