# 开发路线图

## 总览

| 阶段 | 目标 | 验收标准 |
|------|------|---------|
| Phase 1 | 骨架 + 项目识别 + 一键运行 | 加一个 Java 项目 → 识别 → 运行 → 看日志 |
| Phase 2 | 补齐语言 + 运行时 + 打包 | 五种语言全识别、可打包 |
| Phase 3 | SSH + Docker 部署 | 闭环到上线 |
| Phase 4 | Git + 工作区 + 产物任务管理 | 完善体验 |
| Phase 5 | 流水线 + 远程仓库 + 看板 | 增强 |

---

## Phase 1：骨架 + 项目识别 + 一键运行

**目标**：打通核心链路，验证架构

### 任务清单
- [ ] 初始化 Electron + Vue3 + Vite + TypeScript 项目
- [ ] 配置 electron-vite，主进程/渲染进程/preload 三段构建
- [ ] 集成 better-sqlite3，建表脚本 + 初始数据
- [ ] IPC 通信骨架（contextBridge 白名单）
- [ ] DetectorService：识别 Java（pom.xml / build.gradle）和前端（package.json + vue/react 依赖）
- [ ] ProjectService：项目 CRUD
- [ ] RuntimeService：探测系统已装的 java、node 版本
- [ ] RunnerService：spawn 执行、日志流推送、停止
- [ ] UI：项目列表页、添加项目对话框、日志面板
- [ ] 命令策略表（先 java-maven + vue/react 两条）

### 验收链路
1. 打开应用，看到空项目列表
2. 点"添加项目"，选一个本地 Java Maven 项目目录
3. 自动识别为 `java-maven`，识别 Spring Boot 框架
4. 点"运行"，日志面板实时输出
5. 点"停止"，进程结束
6. 重启应用，项目仍在列表中

### 技术要点
- `child_process.spawn` 用 shell 模式执行组合命令（如 `mvn spring-boot:run`）
- 跨平台：命令前缀 Win 用 `cmd /c`，Mac/Linux 直接执行
- 日志推送：`webContents.send` + 渲染进程 `ipcRenderer.on`
- 进程清理：app `before-quit` 时 kill 所有子进程

---

## Phase 2：补齐语言 + 运行时 + 打包

**目标**：所有语言都能识别、运行、打包

### 任务清单
- [ ] DetectorService 补齐：Python / Flutter / Node 识别
- [ ] 命令策略表补齐 7 种类型
- [ ] RuntimeService 完整探测：JDK / Node / Python / Flutter 多版本
- [ ] 项目设置页：可指定运行时版本
- [ ] BuilderService：执行打包，产物路径识别
- [ ] 产物归档：复制到 `userData/artifacts/{project}/{timestamp}/`
- [ ] UI：项目详情页（运行/打包按钮、配置入口）、运行时管理页

### 验收标准
- 7 种项目类型都能正确识别并运行
- Java 项目能 `mvn package` 出 jar
- Flutter 项目能 `flutter build apk`
- Vue/React 项目能 `npm run build` 出 dist
- 产物自动归档，可在 UI 中打开目录

### 框架细分识别
| 类型 | 细分 | 识别依据 |
|------|------|---------|
| Java-Maven | Spring Boot | pom.xml 含 `spring-boot-starter-parent` |
| Java-Gradle | Spring Boot | build.gradle 含 `org.springframework.boot` |
| Python | FastAPI | requirements 含 `fastapi` |
| Python | Django | requirements 含 `django` |
| Flutter | App | pubspec.yaml 无 `publish_to` |
| Vue | Vue3+Vite | package.json vite + vue@3 |
| React | Next.js | package.json 含 `next` |

---

## Phase 3：SSH + Docker 部署

**目标**：打通上线链路

### 任务清单
- [ ] CredentialService：keytar 封装（存取 Git token、SSH 密码）
- [ ] DeployTarget CRUD：服务器列表、Docker Registry 列表
- [ ] DeployerService（SSH 模式）：ssh2 连接 → 上传文件 → 执行远程命令
- [ ] DeployerService（Docker 模式）：构建镜像 → tag → push / 本地 run
- [ ] 部署配置：项目绑定部署目标 + 部署脚本
- [ ] 部署历史：task_history 记录 deploy 类型
- [ ] UI：部署目标管理页、部署对话框（选目标 → 执行 → 日志）

### 验收标准
- Java 项目 build 出 jar 后，SSH 部署到远程服务器指定目录并重启
- Vue 项目 build 出 dist 后，SSH 上传到 nginx 目录
- Docker 模式：构建镜像 push 到 registry，远程 pull 重启
- 部署历史可查看每次日志

---

## Phase 4：Git + 工作区 + 任务管理

**目标**：完善日常体验

### 任务清单
- [ ] GitService（simple-git）：clone / pull / status / branch / checkout
- [ ] 工作区切换 UI：顶部切换器，隔离项目列表
- [ ] 任务管理面板：查看所有运行中进程、最近任务
- [ ] 产物管理 UI：历史产物列表、打开目录、清理
- [ ] 系统设置页：主题、默认运行时、数据目录
- [ ] 应用菜单：快捷操作、关于

### 验收标准
- 切换工作区后只看对应项目
- 可从 Git URL 克隆项目到本地并自动识别
- 任务面板能 stop 任意运行中进程
- 产物可一键打开所在目录

---

## Phase 5：流水线 + 远程仓库 + 看板

**目标**：增强能力

### 任务清单
- [ ] Pipeline：Build → Deploy 串联执行，可视化流程
- [ ] Git Provider 集成：浏览 GitHub/GitLab 仓库列表，一键克隆
- [ ] 项目健康看板：端口占用、进程状态、依赖过期提醒
- [ ] 命令自定义 UI：图形化编辑每个项目的 run/build/deploy 命令
- [ ] 自动更新：electron-updater 接入
- [ ] 打包发布：electron-builder 出 dmg / exe

### 验收标准
- 一键 Build + Deploy 串联完成
- 能浏览自己的 GitHub 仓库并克隆
- 看板显示所有项目运行状态

---

## 开发节奏建议

- 每个 Phase 完成后做一次自测验收，确认链路通再进下一个
- Phase 1 是地基，宁可慢一点把架构立稳
- 命令策略表从 Phase 1 就设计成数据驱动，后续只增配置不改代码
- 个人自用，数据迁移先简单做（schema 变更重建），Phase 4 后再做正经迁移
