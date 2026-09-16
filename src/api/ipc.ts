import type {
  Project,
  Workspace,
  Runtime,
  TaskHistory,
  DetectResult,
  GitSummary,
  GitCommit,
  GitBranch,
  RunSuggestion,
  LogChunk,
  ProjectType
} from '@/types'

export interface ProjectHubAPI {
  project: {
    list: (workspaceId?: string) => Promise<Project[]>
    get: (id: string) => Promise<Project | null>
    detail: (id: string) => Promise<Project & { git: GitSummary; history: TaskHistory[] }>
    add: (data: {
      workspace_id: string
      name: string
      path: string
      type?: ProjectType
      framework?: string | null
      description?: string | null
      remotes?: Array<{ name: string; url: string; platform?: string; is_default?: number }>
    }) => Promise<Project>
    update: (id: string, data: Partial<Project>) => Promise<Project>
    remove: (id: string) => Promise<void>
    syncRemotes: (id: string) => Promise<Project | null>
    detect: (path: string) => Promise<DetectResult>
    runCommands: (id: string) => Promise<RunSuggestion[]>
    customCommands: {
      get: (id: string) => Promise<string[]>
      save: (id: string, cmds: string[]) => Promise<string[]>
    }
  }
  git: {
    log: (projectId: string, count?: number) => Promise<GitCommit[]>
    init: (projectId: string) => Promise<void>
    linkRemote: (projectId: string, payload: { name?: string; url: string }) => Promise<Project | null>
    commitAll: (projectId: string, message: string) => Promise<string>
    push: (projectId: string, upstream?: boolean) => Promise<string>
    pull: (projectId: string) => Promise<string>
    branches: (projectId: string) => Promise<GitBranch[]>
    checkout: (projectId: string, branch: string, create?: boolean) => Promise<string>
    commit: (projectId: string, message: string, paths?: string[]) => Promise<string>
  }
  workspace: {
    list: () => Promise<Workspace[]>
  }
  runtime: {
    list: () => Promise<Runtime[]>
    scan: () => Promise<Runtime[]>
  }
  runner: {
    start: (projectId: string) => Promise<string>
    startCustom: (projectId: string, cmd: { bin: string; args: string[]; display?: string }) => Promise<string>
    stop: (taskId: string) => Promise<void>
    listRunning: () => Promise<TaskHistory[]>
    onLog: (callback: (chunk: LogChunk) => void) => () => void
    onStatus: (callback: (task: TaskHistory) => void) => () => void
  }
  task: {
    history: (projectId: string, type?: string) => Promise<TaskHistory[]>
    readLog: (taskId: string) => Promise<string>
  }
  system: {
    openPath: (path: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
    pickDirectory: () => Promise<string | null>
  }
}
