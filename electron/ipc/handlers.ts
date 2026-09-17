import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { workspaceRepo, projectRepo, remoteRepo, taskRepo } from '../db/repositories'
import { detectProject } from '../services/detector.service'
import { suggestCommands } from '../strategies/project-commands'
import { runtimeService } from '../services/runtime.service'
import { runnerService, getMainWindowSender } from '../services/runner.service'
import { serviceManager } from '../services/service-manager.service'

import { gitSummary, readRemotes, detectPlatformOf, toWebUrl, gitLog, gitInit, gitSetRemote, gitCommitAll, gitCommitFiles, gitPushUpstream, gitPullSafe, gitPushSimple, gitBranches, gitCheckout } from '../services/git.service'
import type { ProjectRemote, ServiceCandidate } from '../../src/types'
import { getDb } from '../db'

function syncProgress(projectId: string): void {
  const tasks = taskRepo.listByProject(projectId)
  const percent = tasks.length === 0 ? 100 : Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100)
  projectRepo.update(projectId, { progress_percent: percent })
}

function getCustomCommands(projectId: string): string[] {
  try {
    const row = getDb()
      .prepare('SELECT run_command FROM project_config WHERE project_id = ?')
      .get(projectId) as { run_command: string | null } | undefined
    if (row?.run_command) {
      const arr = JSON.parse(row.run_command)
      if (Array.isArray(arr)) return arr as string[]
    }
  } catch {
    // ignore
  }
  return []
}

export function registerIpcHandlers(): void {
  // ---- workspace ----
  ipcMain.handle('workspace:list', () => workspaceRepo.list())

  // ---- project ----
  ipcMain.handle('project:list', (_e, workspaceId?: string) =>
    projectRepo.list(workspaceId)
  )
  ipcMain.handle('project:get', (_e, id: string) => projectRepo.get(id))
  ipcMain.handle('project:runCommands', (_e, id: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    const suggestions = suggestCommands(project).map((c) => ({ ...c, custom: false }))
    const custom = getCustomCommands(id).map((c) => ({ name: c, cmd: c, bin: c, args: [] as string[], custom: true }))
    return [...custom, ...suggestions]
  })
  ipcMain.handle('project:detail', async (_e, id: string) => {
    let project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    // 自愈：数据库无 remote 但磁盘有 → 自动导入（避免被空读取清空后无法恢复）
    if (!project.remotes?.length) {
      const diskRemotes = await readRemotes(project.path)
      if (diskRemotes.length) {
        remoteRepo.replaceAll(id, diskRemotes)
        project = projectRepo.get(id)!
      }
    }
    const [git, history] = await Promise.all([
      gitSummary(project.path),
      getDb()
        .prepare('SELECT * FROM task_history WHERE project_id = ? ORDER BY started_at DESC LIMIT 20')
        .all(id)
    ])
    return { ...project, git, history }
  })
  ipcMain.handle('project:detect', (_e, path: string) => detectProject(path))
  ipcMain.handle('project:add', async (_e, data: {
    workspace_id: string
    name: string
    path: string
    type?: string
    framework?: string | null
    description?: string | null
    remotes?: Array<{ name: string; url: string; platform?: string; is_default?: number }>
  }) => {
    const inserted = projectRepo.insert({
      id: randomUUID(),
      workspace_id: data.workspace_id,
      name: data.name,
      path: data.path,
      type: data.type || 'unknown',
      framework: data.framework ?? null,
      description: data.description ?? null
    })
    let saved = inserted
    if (data.remotes?.length) {
      const clean = data.remotes.map((r) => ({
        name: r.name,
        url: r.url,
        platform: (r.platform || detectPlatformOf(r.url)) as ProjectRemote['platform'],
        is_default: r.is_default ?? 0
      }))
      remoteRepo.replaceAll(inserted.id, clean)
      try {
        await gitInit(inserted.path)
        for (const r of clean) {
          await gitSetRemote(inserted.path, r.name, r.url)
        }
      } catch {
        // git 不可用时不阻断添加，数据库中仍保留关联
      }
      saved = projectRepo.get(inserted.id) ?? inserted
    }
    return saved
  })
  ipcMain.handle('project:update', (_e, id: string, data: Record<string, unknown>) =>
    projectRepo.update(id, data)
  )
  ipcMain.handle('project:remove', (_e, id: string) => projectRepo.remove(id))
  ipcMain.handle('project:syncRemotes', async (_e, id: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    const remotes = await readRemotes(project.path)
    remoteRepo.replaceAll(id, remotes)
    return projectRepo.get(id)
  })
  ipcMain.handle('git:openRepo', (_e, url: string) => shell.openExternal(toWebUrl(url)))

  // ---- git 仓库操作 ----
  ipcMain.handle('git:init', (_e, id: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitInit(project.path)
  })
  ipcMain.handle('git:linkRemote', async (_e, id: string, payload: { name?: string; url: string }) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    const url = payload.url?.trim()
    if (!url) throw new Error('请填写仓库地址')
    const name = payload.name?.trim() || 'origin'
    await gitInit(project.path)
    await gitSetRemote(project.path, name, url)
    remoteRepo.replaceAll(id, await readRemotes(project.path))
    return projectRepo.get(id)
  })
  ipcMain.handle('git:commitAll', (_e, id: string, message: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitCommitAll(project.path, message)
  })
  ipcMain.handle('git:push', (_e, id: string, upstream?: boolean) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return upstream ? gitPushUpstream(project.path) : gitPushSimple(project.path)
  })
  ipcMain.handle('git:pull', (_e, id: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitPullSafe(project.path)
  })
  ipcMain.handle('git:branches', (_e, id: string) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitBranches(project.path)
  })
  ipcMain.handle('git:checkout', (_e, id: string, branch: string, create?: boolean) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitCheckout(project.path, branch, create)
  })
  ipcMain.handle('git:commit', (_e, id: string, message: string, paths?: string[]) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    if (!message?.trim()) throw new Error('请填写提交信息')
    return gitCommitFiles(project.path, paths && paths.length ? paths : null, message.trim())
  })
  ipcMain.handle('project:customCommands:get', (_e, id: string) => getCustomCommands(id))
  ipcMain.handle('project:customCommands:save', (_e, id: string, cmds: string[]) => {
    const db = getDb()
    const json = JSON.stringify(cmds.filter((c) => typeof c === 'string' && c.trim()))
    db.prepare(
      `INSERT INTO project_config (project_id, run_command) VALUES (@id, @cmds)
       ON CONFLICT(project_id) DO UPDATE SET run_command = excluded.run_command`
    ).run({ id, cmds: JSON.stringify(cmds) })
    return getCustomCommands(id)
  })
  // ---- 任务（驱动开发进度） ----
  ipcMain.handle('task:list', (_e, projectId: string) => taskRepo.listByProject(projectId))
  ipcMain.handle('task:add', (_e, projectId: string, title: string, tag: string) => {
    const project = projectRepo.get(projectId)
    if (!project) throw new Error('项目不存在')
    if (!title?.trim()) throw new Error('请填写任务标题')
    const task = taskRepo.add(projectId, title.trim(), tag || 'chore')
    syncProgress(projectId)
    return taskRepo.listByProject(projectId)
  })
  ipcMain.handle('task:toggle', (_e, taskId: string) => {
    const t = taskRepo.toggle(taskId)
    if (t) syncProgress(t.project_id)
    return t
  })
  ipcMain.handle('task:remove', (_e, taskId: string) => {
    const row = getDb().prepare('SELECT project_id FROM task WHERE id = ?').get(taskId) as { project_id: string } | undefined
    taskRepo.remove(taskId)
    if (row) syncProgress(row.project_id)
    return true
  })
  ipcMain.handle('git:log', (_e, id: string, count?: number) => {
    const project = projectRepo.get(id)
    if (!project) throw new Error('项目不存在')
    return gitLog(project.path, count)
  })

  // ---- runtime ----
  ipcMain.handle('runtime:list', () => runtimeService.list())
  ipcMain.handle('runtime:scan', () => runtimeService.scan())

  // ---- runner ----
  ipcMain.handle('runner:start', (_e, projectId: string) => {
    const sender = getMainWindowSender()
    if (!sender) throw new Error('没有可用窗口')
    return runnerService.start(projectId, sender)
  })
  ipcMain.handle('runner:stop', (_e, taskId: string) => runnerService.stop(taskId))
  ipcMain.handle('runner:listRunning', () => runnerService.listRunning())
  ipcMain.handle('runner:probeExternal', (_e, projectId: string) => {
    const project = projectRepo.get(projectId)
    if (!project) throw new Error('项目不存在')
    return runnerService.probeExternal(project.path)
  })
  ipcMain.handle('runner:startCustom', (_e, projectId: string, cmd: { bin: string; args: string[]; display?: string }) => {
    const sender = getMainWindowSender()
    if (!sender) throw new Error('没有可用窗口')
    return runnerService.startCustom(projectId, cmd, sender)
  })

  // ---- 本机服务管理 ----
  ipcMain.handle('service:list', () => serviceManager.list())
  ipcMain.handle('service:add', (_e, data: Parameters<typeof serviceManager.add>[0]) => serviceManager.add(data))
  ipcMain.handle('service:update', (_e, id: string, data: Record<string, unknown>) => serviceManager.update(id, data))
  ipcMain.handle('service:remove', (_e, id: string) => serviceManager.remove(id))
  ipcMain.handle('service:start', (_e, id: string) => serviceManager.start(id))
  ipcMain.handle('service:stop', (_e, id: string) => serviceManager.stop(id))
  ipcMain.handle('service:restart', (_e, id: string) => serviceManager.restart(id))
  ipcMain.handle('service:probe', (_e, id: string) => serviceManager.probe(id))
  ipcMain.handle('service:probeAll', () => serviceManager.probeAll())
  ipcMain.handle('service:readLog', (_e, id: string) => serviceManager.readLog(id))
  ipcMain.handle('service:clearLog', (_e, id: string) => serviceManager.clearLog(id))
  ipcMain.handle('service:listRunning', () => serviceManager.listRunning())
  ipcMain.handle('service:importScan', () => serviceManager.importScan())
  ipcMain.handle('service:import', (_e, candidates: ServiceCandidate[]) => serviceManager.importSelected(candidates))

  // ---- task ----
  ipcMain.handle('task:history', (_e, projectId: string, type?: string) => {
    const db = getDb()
    if (type) {
      return db
        .prepare('SELECT * FROM task_history WHERE project_id = ? AND type = ? ORDER BY started_at DESC LIMIT 50')
        .all(projectId, type)
    }
    return db
        .prepare('SELECT * FROM task_history WHERE project_id = ? ORDER BY started_at DESC LIMIT 50')
        .all(projectId)
  })
  ipcMain.handle('task:readLog', (_e, taskId: string) => runnerService.readLog(taskId))

  // ---- system ----
  ipcMain.handle('system:openPath', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('system:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('system:pickDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
