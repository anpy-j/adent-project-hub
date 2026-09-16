# 数据模型

## 一、ER 关系总览

```
Workspace 1───* Project
Workspace 1───* DeployTarget
Workspace 1───* GitAccount
Project   *───1 ProjectType (enum)
Project   *───1 Runtime (可选，不绑则用默认)
Project   1───* TaskHistory
Project   1───1 ProjectConfig
Runtime   1───* (被项目引用)
```

## 二、表结构（SQLite）

### workspace — 工作区
```sql
CREATE TABLE workspace (
  id          TEXT PRIMARY KEY,           -- uuid
  name        TEXT NOT NULL,              -- 'personal' / '公司名'
  kind        TEXT NOT NULL,              -- 'personal' | 'company'
  icon        TEXT,                       -- 图标标识
  color       TEXT,                       -- 主题色
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### project — 项目
```sql
CREATE TABLE project (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  path          TEXT NOT NULL,            -- 本地路径
  type          TEXT NOT NULL,            -- 'java-maven'|'java-gradle'|'python'|'flutter'|'vue'|'react'|'node'
  framework     TEXT,                     -- 'spring-boot'|'fastapi'|'vue3-vite' 等
  runtime_id    TEXT REFERENCES runtime(id), -- 指定运行时，NULL 用默认
  tags          TEXT,                     -- JSON 数组字符串
  description   TEXT,
  last_run_at   TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_project_workspace ON project(workspace_id);
```

### runtime — 运行时版本
```sql
CREATE TABLE runtime (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,              -- 'jdk'|'node'|'python'|'flutter'
  version     TEXT NOT NULL,              -- '17.0.2' / '20.11.0'
  path        TEXT NOT NULL,              -- 可执行路径或 home
  is_default  INTEGER DEFAULT 0,          -- 1 = 该 kind 默认
  source      TEXT,                       -- 'system'|'nvm'|'pyenv'|'sdkman'|'fvm'|'manual'
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_runtime_kind ON runtime(kind);
```

### project_config — 项目配置（覆盖默认命令）
```sql
CREATE TABLE project_config (
  project_id      TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  run_command     TEXT,                   -- 覆盖运行命令，NULL 用策略表默认
  build_command   TEXT,
  run_env         TEXT,                   -- JSON: {KEY:VAL}
  build_env       TEXT,
  run_cwd         TEXT,                   -- 覆盖工作目录
  port            INTEGER,                -- 预期端口（用于探测）
  extra           TEXT                    -- JSON: 其他自定义参数
);
```

### deploy_target — 部署目标
```sql
CREATE TABLE deploy_target (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,            -- '生产服务器' / '测试 Docker'
  type          TEXT NOT NULL,            -- 'ssh' | 'docker-registry' | 'docker-local'
  -- SSH 字段
  host          TEXT,
  port          INTEGER DEFAULT 22,
  username      TEXT,
  auth_type     TEXT,                     -- 'password' | 'key'
  -- credential_key 走 keychain，不存表
  credential_key TEXT,
  -- Docker 字段
  registry_url  TEXT,
  image_name    TEXT,
  -- 通用
  remote_path   TEXT,                     -- 部署到远程的路径
  pre_command   TEXT,                     -- 部署前执行
  post_command  TEXT,                     -- 部署后执行
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### task_history — 任务历史（run/build/deploy）
```sql
CREATE TABLE task_history (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,            -- 'run' | 'build' | 'deploy'
  status        TEXT NOT NULL,            -- 'running'|'success'|'failed'|'stopped'
  command       TEXT,                     -- 实际执行的命令
  log_path      TEXT,                     -- 日志文件路径
  pid           INTEGER,                  -- 进程 pid（run 类型）
  exit_code     INTEGER,
  started_at    TEXT DEFAULT (datetime('now')),
  ended_at      TEXT
);
CREATE INDEX idx_task_project ON task_history(project_id);
CREATE INDEX idx_task_type_status ON task_history(type, status);
```

### git_account — Git 账号
```sql
CREATE TABLE git_account (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,            -- 'github'|'gitlab'|'gitee'|'custom'
  username      TEXT NOT NULL,
  -- token 走 keychain，只存引用
  credential_key TEXT,
  base_url      TEXT,                     -- custom 时填
  created_at    TEXT DEFAULT (datetime('now'))
);
```

## 三、枚举类型

```typescript
type ProjectType =
  | 'java-maven'
  | 'java-gradle'
  | 'python'
  | 'flutter'
  | 'vue'
  | 'react'
  | 'node'

type TaskType = 'run' | 'build' | 'deploy'
type TaskStatus = 'running' | 'success' | 'failed' | 'stopped'
type RuntimeKind = 'jdk' | 'node' | 'python' | 'flutter'
type DeployTargetType = 'ssh' | 'docker-registry' | 'docker-local'
type GitProvider = 'github' | 'gitlab' | 'gitee' | 'custom'
```

## 四、数据目录约定

```
userData/                         # app.getPath('userData')
├── project-hub.db                # SQLite 数据库
├── logs/                         # 日志目录
│   └── tasks/
│       └── {taskId}.log          # 每次任务一个日志文件
└── artifacts/                    # 打包产物归档
    └── {projectName}/
        └── {timestamp}/
```

## 五、初始数据

首次启动插入默认工作区：
```sql
INSERT INTO workspace (id, name, kind, icon) VALUES
  ('ws-personal', '个人', 'personal', 'user'),
  ('ws-company',  '公司', 'company',  'building');
```

## 六、迁移策略

- 使用版本号表 `schema_version` 记录当前版本
- 启动时检查版本，依次执行 migration 脚本
- MVP 阶段先简单：每次 schema 变更直接重建（个人自用，数据可丢）
