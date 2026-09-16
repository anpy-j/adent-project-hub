# 架构设计

## 一、技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面框架 | Electron | 跨平台成熟，命令执行/文件/SSH 操作方便，适合系统工具类 |
| 前端框架 | Vue 3 + TypeScript | 生态成熟，类型安全 |
| 构建 | Vite + electron-vite | 启动快，HMR 体验好 |
| UI 库 | Element Plus | 组件全，桌面端适配好 |
| 持久化 | better-sqlite3 | 同步 API，性能好，无需额外服务 |
| 进程管理 | child_process (Node 内置) | 运行项目/打包命令 |
| SSH | ssh2 | Node 生态最成熟的 SSH 客户端 |
| Docker | dockerode | Docker API 客户端 |
| 凭证存储 | keytar | 走系统 keychain（macOS Keychain / Windows Credential Manager） |
| 日志 | electron-log | 文件日志，方便排查 |
| Git | simple-git | isomorphic-git 也可，simple-git 更轻 |

## 二、分层架构

```
┌─────────────────────────────────────────┐
│  Vue3 UI 层（渲染进程）                    │
│  项目列表 / 日志面板 / 设置 / 部署面板      │
└──────────────┬──────────────────────────┘
               │ IPC (contextBridge)
┌──────────────┴──────────────────────────┐
│  业务层（主进程）                          │
│  ├─ ProjectService    项目CRUD/识别       │
│  ├─ DetectorService   类型探测            │
│  ├─ RuntimeService    运行时探测/选择      │
│  ├─ RunnerService     运行/进程管理 ← 核心 │
│  ├─ BuilderService    打包                │
│  ├─ DeployerService   SSH/Docker 部署     │
│  ├─ GitService        Git操作             │
│  └─ CredentialStore   凭证加密(keychain)   │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│  系统调用层                               │
│  child_process / ssh2 / dockerode / fs   │
└──────────────┬──────────────────────────┘
               │
        SQLite (better-sqlite3)
```

### 关键设计原则

1. **主进程承载所有系统操作**：渲染进程只负责 UI，不直接访问文件系统/进程
2. **IPC 通过 contextBridge 暴露**：不暴露 `require`，只暴露白名单 API
3. **服务层单向依赖**：UI → IPC → Service → SystemLayer → DB，不反向调用
4. **命令策略表数据驱动**：项目类型 → 命令映射通过配置，不硬编码

## 三、目录结构

```
project-hub/
├── design/                       # 设计文档
│   ├── 01-business-overview.md
│   ├── 02-architecture.md
│   ├── 03-data-model.md
│   └── 04-roadmap.md
├── electron/                     # 主进程源码
│   ├── main.ts                   # 主进程入口
│   ├── preload.ts                # 预加载脚本（contextBridge）
│   ├── services/                 # 业务服务
│   │   ├── project.service.ts
│   │   ├── detector.service.ts
│   │   ├── runtime.service.ts
│   │   ├── runner.service.ts
│   │   ├── builder.service.ts
│   │   ├── deployer.service.ts
│   │   ├── git.service.ts
│   │   └── credential.service.ts
│   ├── db/                       # 数据库层
│   │   ├── index.ts              # SQLite 初始化
│   │   ├── schema.ts             # 建表语句
│   │   └── repositories/         # 各实体仓储
│   ├── strategies/               # 策略表
│   │   └── project-commands.ts   # 类型→命令映射
│   └── ipc/                      # IPC 处理器
│       └── handlers.ts
├── src/                          # 渲染进程源码（Vue3）
│   ├── App.vue
│   ├── main.ts
│   ├── views/                    # 页面
│   │   ├── ProjectList.vue
│   │   ├── ProjectDetail.vue
│   │   └── Settings.vue
│   ├── components/               # 组件
│   │   ├── ProjectCard.vue
│   │   ├── LogPanel.vue
│   │   └── AddProjectDialog.vue
│   ├── stores/                   # Pinia 状态
│   │   ├── project.ts
│   │   └── workspace.ts
│   ├── api/                      # 调用 IPC 的封装
│   │   └── ipc.ts
│   └── types/                    # 类型定义
│       └── index.ts
├── resources/                    # 静态资源（图标等）
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

## 四、IPC 通信设计

通过 `contextBridge` 暴露白名单 API，前端通过 `window.api` 调用：

```typescript
// preload.ts
contextBridge.exposeInMainWorld('api', {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    add: (data) => ipcRenderer.invoke('project:add', data),
    detect: (path) => ipcRenderer.invoke('project:detect', path),
    remove: (id) => ipcRenderer.invoke('project:remove', id),
  },
  runner: {
    start: (projectId) => ipcRenderer.invoke('runner:start', projectId),
    stop: (taskId) => ipcRenderer.invoke('runner:stop', taskId),
    onLog: (callback) => ipcRenderer.on('runner:log', callback),
  },
  builder: {
    build: (projectId) => ipcRenderer.invoke('builder:build', projectId),
    onLog: (callback) => ipcRenderer.on('builder:log', callback),
  },
  // ...
})
```

日志流：主进程通过 `webContents.send('runner:log', ...)` 推送，渲染进程订阅。

## 五、进程管理设计（核心）

运行项目 = 长驻 `child_process.spawn`，需要：

- **进程表**：`Map<taskId, ChildProcess>`，记录所有运行中的进程
- **日志缓冲**：每个进程的 stdout/stderr 实时推送到前端 + 写文件
- **生命周期**：start / stop / restart / crash 自动重启（可选）
- **端口探测**：启动后探测进程监听的端口，方便管理
- **应用退出清理**：Electron 退出时 kill 所有子进程

```typescript
class RunnerService {
  private processes = new Map<string, ChildProcess>()

  async start(projectId: string): Promise<string> {
    const project = await projectRepo.get(projectId)
    const cmd = resolveCommand(project, 'run')
    const proc = spawn(cmd.bin, cmd.args, { cwd: project.path, env: cmd.env })
    this.processes.set(taskId, proc)
    proc.stdout.on('data', d => this.emitLog(taskId, d.toString()))
    return taskId
  }

  stop(taskId: string) {
    this.processes.get(taskId)?.kill('SIGTERM')
    this.processes.delete(taskId)
  }
}
```

## 六、命令策略表（数据驱动核心）

整个工具的"大脑"——项目类型到命令的映射，设计为可配置策略：

```typescript
// strategies/project-commands.ts
interface CommandStrategy {
  detect: (projectPath: string) => Promise<ProjectType | null>
  getRunCommand: (project: Project, runtime: Runtime) => ResolvedCommand
  getBuildCommand: (project: Project, runtime: Runtime) => ResolvedCommand
  getArtifacts: (projectPath: string) => Promise<string[]>
}

export const strategies: Record<ProjectType, CommandStrategy> = {
  'java-maven': { ... },
  'java-gradle': { ... },
  'python': { ... },
  'flutter': { ... },
  'vue': { ... },
  'react': { ... },
  'node': { ... },
}
```

变量替换：`{runtime}` `{port}` `{env}` `{projectId}` 等，用户可在项目设置覆盖默认命令。

## 七、安全设计

- 凭证（Git token、SSH 密码、服务器密码）只走 keychain，不落 SQLite
- SSH 私钥文件用户指定路径，不复制
- 命令执行前对路径做校验，防止注入
- IPC 不暴露 `require` / `child_process` 等危险 API

## 八、打包发布

- `electron-builder` 打包成 dmg（mac）/ nsis（win）
- 自动更新预留 `electron-updater`（后续接入）
- 数据目录：`app.getPath('userData')`，跨平台标准位置
