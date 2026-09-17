import type {
  Project,
  Workspace,
  Runtime,
  TaskHistory,
  DetectResult,
  GitSummary,
  GitCommit,
  TaskItem,
  GitBranch,
  RunSuggestion,
  LogChunk,
  ProjectType,
  TaskStat,
  ServiceItem,
  ServiceCandidate,
  ServiceLogChunk,
  ServiceStatusInfo,
  ServiceAnomaly
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
    },
    tasks: {
      list: (id: string) => Promise<TaskItem[]>
      add: (id: string, title: string, tag: string, group?: string | null) => Promise<TaskItem[]>
      toggle: (taskId: string) => Promise<TaskItem | null>
      update: (taskId: string, data: { title?: string; tag?: string; group_name?: string | null }) => Promise<TaskItem | null>
      reorder: (projectId: string, orderedIds: string[]) => Promise<TaskItem[]>
      remove: (taskId: string) => Promise<boolean>
    },
    getAutoRestart: (id: string) => Promise<boolean>
    setAutoRestart: (id: string, enabled: boolean) => Promise<boolean>
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
    probeExternal: (projectId: string) => Promise<{ running: boolean; processes: Array<{ pid: number; command: string }> }>
    stop: (taskId: string) => Promise<void>
    listRunning: () => Promise<TaskHistory[]>
    stats: () => Promise<TaskStat[]>
    onLog: (callback: (chunk: LogChunk) => void) => () => void
    onStatus: (callback: (task: TaskHistory) => void) => () => void
  }
  task: {
    history: (projectId: string, type?: string) => Promise<TaskHistory[]>
    readLog: (taskId: string) => Promise<string>
  }
  service: {
    list: () => Promise<ServiceItem[]>
    add: (data: {
      name: string
      group_name?: string | null
      command: string
      cwd?: string | null
      port?: number | null
      autostart?: boolean
      description?: string | null
    }) => Promise<ServiceItem>
    update: (id: string, data: Partial<ServiceItem>) => Promise<ServiceItem>
    remove: (id: string) => Promise<void>
    start: (id: string) => Promise<string>
    stop: (id: string) => Promise<void>
    restart: (id: string) => Promise<string>
    probe: (id: string) => Promise<ServiceStatusInfo>
    probeAll: () => Promise<Array<ServiceItem & { status: ServiceStatusInfo }>>
    readLog: (id: string) => Promise<string>
    clearLog: (id: string) => Promise<void>
    importScan: () => Promise<ServiceCandidate[]>
    import: (candidates: ServiceCandidate[]) => Promise<number>
    onLog: (callback: (chunk: ServiceLogChunk) => void) => () => void
    onStatus: (callback: (info: ServiceStatusInfo) => void) => () => void
    onAnomaly: (callback: (anomaly: ServiceAnomaly) => void) => () => void
  }
  system: {
    openPath: (path: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
    pickDirectory: () => Promise<string | null>
  }
}
