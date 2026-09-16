import { contextBridge, ipcRenderer } from 'electron'
import type { ProjectHubAPI } from '../src/api/ipc'
import type { LogChunk, TaskHistory } from '../src/types'

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const plainArgs = args.map((a) => JSON.parse(JSON.stringify(a)))
  return ipcRenderer.invoke(channel, ...plainArgs) as Promise<T>
}


const api: ProjectHubAPI = {
  project: {
    list: (workspaceId?: string) => invoke('project:list', workspaceId),
    get: (id: string) => invoke('project:get', id),
    detail: (id: string) => invoke('project:detail', id),
    add: (data) => invoke('project:add', data),
    update: (id, data) => invoke('project:update', id, data),
    remove: (id: string) => invoke('project:remove', id),
    syncRemotes: (id: string) => invoke('project:syncRemotes', id),
    detect: (path: string) => invoke('project:detect', path),
    runCommands: (id: string) => invoke('project:runCommands', id),
    customCommands: {
      get: (id: string) => invoke('project:customCommands:get', id),
      save: (id: string, cmds: string[]) => invoke('project:customCommands:save', id, cmds)
    }
  },
  git: {
    log: (id: string, count?: number) => invoke('git:log', id, count),
    init: (id: string) => invoke('git:init', id),
    linkRemote: (id: string, payload: { name?: string; url: string }) => invoke('git:linkRemote', id, payload),
    commitAll: (id: string, message: string) => invoke('git:commitAll', id, message),
    push: (id: string, upstream?: boolean) => invoke('git:push', id, upstream),
    pull: (id: string) => invoke('git:pull', id),
    branches: (id: string) => invoke('git:branches', id),
    checkout: (id: string, branch: string, create = false) => invoke('git:checkout', id, branch, create),
    commit: (id: string, message: string, paths?: string[]) => invoke('git:commit', id, message, paths)
  },
  workspace: {
    list: () => invoke('workspace:list')
  },
  runtime: {
    list: () => invoke('runtime:list'),
    scan: () => invoke('runtime:scan')
  },
  runner: {
    start: (projectId: string) => invoke('runner:start', projectId),
    startCustom: (projectId: string, cmd: { bin: string; args: string[]; display?: string }) =>
      invoke('runner:startCustom', projectId, cmd),
    stop: (taskId: string) => invoke('runner:stop', taskId),
    listRunning: () => invoke('runner:listRunning'),
    onLog: (callback) => {
      const handler = (_e: unknown, chunk: LogChunk) => callback(chunk)
      ipcRenderer.on('runner:log', handler)
      return () => ipcRenderer.removeListener('runner:log', handler)
    },
    onStatus: (callback) => {
      const handler = (_e: unknown, task: TaskHistory) => callback(task)
      ipcRenderer.on('runner:status', handler)
      return () => ipcRenderer.removeListener('runner:status', handler)
    }
  },
  task: {
    history: (projectId: string, type?: string) => invoke('task:history', projectId, type),
    readLog: (taskId: string) => invoke('task:readLog', taskId)
  },
  system: {
    openPath: (path: string) => invoke('system:openPath', path),
    openExternal: (url: string) => invoke('system:openExternal', url),
    pickDirectory: () => invoke('system:pickDirectory') as Promise<string | null>
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore allow direct attach in non-isolated context
  window.api = api
}

export default api
