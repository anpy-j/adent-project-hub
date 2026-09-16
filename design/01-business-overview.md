# 业务总览

## 一、产品定位

跨平台（Win/Mac）桌面客户端，统一管理本地与云端（Git）的个人/公司项目，能根据项目类型**一键运行、打包、部署**。

本质：把 "IDE 的项目管理 + CI/CD 流水线 + 运行时管理" 打包成一个面向个人开发者的轻量工具。

核心价值：不用记每个项目怎么跑、怎么打包、怎么部署，打开客户端点一下就行；个人和公司项目隔离，互不干扰。

## 二、使用定位（MVP）

- **个人自用**：单用户，无协作，无权限/审计
- **技术栈**：Electron + Vue3 + TypeScript + SQLite
- **项目类型**：Java、Python、Flutter、Vue/React、Node
- **部署方式**：SSH 远程服务器 + Docker

## 三、核心业务模块

### 1. 工作区管理（Workspace）
- 个人工作区 / 公司工作区，可多公司多开
- 隔离：项目列表、Git 账号、部署目标、凭证各自独立
- 切换工作区 = 切换一套完整环境

### 2. 项目源管理（Source）
- **本地项目**：扫描目录或手动指定路径
- **云端项目**：连接 Git Provider（GitHub / GitLab / Gitee / 私有 Git），浏览仓库、克隆到本地
- **多账号**：每个 Provider 支持多账号（个人 token + 公司 token），按工作区绑定

### 3. 项目识别与分类（Detection）
打开/添加项目时自动识别类型，依据特征文件：

| 类型 | 特征文件 | 识别细分 |
|------|---------|---------|
| Java | `pom.xml` / `build.gradle` | Maven / Gradle、Spring Boot |
| Python | `requirements.txt` / `pyproject.toml` / `Pipfile` | pip / poetry、FastAPI/Django |
| Flutter | `pubspec.yaml` | App / Package |
| Vue | `package.json` + vue 依赖 | Vue2 / Vue3、Vite/Webpack |
| React | `package.json` + react 依赖 | CRA / Next.js / Vite |
| Node | `package.json` | 纯服务 |

识别后可手动修正，并保存为项目配置。

### 4. 运行时管理（Runtime）
- 多版本并存：JDK、Node、Python、Flutter SDK
- 每个项目可指定使用的运行时版本
- 自动探测系统已装版本，缺失时提示安装（或对接版本管理器：nvm/pyenv/sdkman/fvm）

### 5. 项目操作（Run / Build / Deploy）—— 核心

按类型映射到具体命令，配置可自定义：

**运行（Run）**
- Java：`mvn spring-boot:run` / `java -jar` / `gradle bootRun`
- Python：`python main.py` / `uvicorn` / `python manage.py runserver`
- Flutter：`flutter run -d <device>`
- Vue/React：`npm run dev`

**打包（Build）**
- Java：`mvn package` / `gradle build` → jar/war
- Python：`pyinstaller` / 打包镜像
- Flutter：`flutter build apk/ios/macos/web`
- Vue/React：`npm run build` → dist

**部署（Deploy）**
- 本地：复制到目录、本地 Docker
- 远程：SSH+SCP、Docker Registry 推送
- 每个项目绑定一套部署配置（目标 + 方式 + 参数）

### 6. 任务与进程管理
- 运行中的项目 = 长驻进程，需管理（启停、重启、日志流）
- 打包/部署 = 一次性任务，记录历史
- 流水线（Pipeline）：可选进阶，串联 Build → Deploy

### 7. Git 集成
- 克隆/拉取/推送/分支切换/状态查看
- 凭证安全存储（系统 keychain）
- 公司项目强制走公司 Git，不串号

### 8. 部署目标管理（DeployTarget）
- 服务器列表（SSH 主机）、Docker Registry
- 按工作区隔离
- 健康检查、部署历史、回滚

### 9. 设置与凭证
- 系统设置、主题、快捷键
- 凭证库（Git token、SSH key、服务器密码）加密存储

## 四、典型使用流程

```
添加项目 → 自动识别类型 → 指定运行时 → 一键运行/打包 → 部署到目标
   │            │              │              │              │
 本地路径      pom.xml       JDK 17        mvn package    SSH 部署
 云端克隆      pubspec       Flutter 3.x   flutter build  Docker
```

四类典型场景：
1. **本地开发**：打开项目 → 运行 → 看日志 → 改完重启
2. **出包**：选项目 → Build → 产物自动归档到统一目录
3. **上线**：Build → 选部署目标 → Deploy → 查看状态
4. **多工作区**：上班切公司区（连公司 Git、公司服务器），下班切个人区

## 五、功能优先级

### P0 — 必须有（MVP 先做）
1. 项目注册：手动加本地路径 + 自动识别类型
2. 项目列表/分组：个人/公司工作区，标签分类
3. 一键运行：按类型执行对应命令，实时日志，可停止
4. 一键打包：按类型 build，产物归档到统一目录
5. 运行时探测：自动扫系统已装 JDK/Node/Python/Flutter，项目可指定版本
6. Git 集成：克隆、pull、状态查看

### P1 — 重要（第二批）
7. SSH 部署：传文件 + 执行远程命令，保存服务器列表
8. Docker 部署：构建镜像 → push registry / 本地 run
9. 打包产物管理：历史记录、一键打开产物目录
10. 部署历史：记录每次部署，可查看日志

### P2 — 锦上添花
11. 流水线：Build → Deploy 串联
12. 远程项目浏览：连 GitHub/GitLab 浏览仓库一键克隆
13. 项目健康看板：端口占用、进程状态、依赖更新提醒
14. 命令自定义：每个项目可覆盖默认 run/build/deploy 命令
