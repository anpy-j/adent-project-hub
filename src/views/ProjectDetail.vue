<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Edit,
  FolderOpened,
  Refresh,
  RefreshRight,
  Search,
  VideoPlay,
  VideoPause,
  Document,
  Link,
  Plus,
  Delete
} from '@element-plus/icons-vue'
import type {
  GitBranch,
  GitCommit,
  GitSummary,
  LogChunk,
  Project,
  RunSuggestion,
  TaskHistory,
  TaskItem
} from '../types'

const route = useRoute()
const router = useRouter()
const projectId = String(route.params.id || '')

const project = ref<Project | null>(null)
const git = ref<GitSummary | null>(null)
const history = ref<TaskHistory[]>([])
const commits = ref<GitCommit[]>([])
const loading = ref(true)
const saving = ref(false)
const savingBasic = ref(false)
const busy = ref('')

const progress = ref<{ percent: number; stage: Project['progress_stage']; note: string }>({
  percent: 0,
  stage: 'developing',
  note: ''
})
const editForm = ref({ name: '', description: '' })
const linkForm = ref({ name: 'origin', url: '' })

const branches = ref<GitBranch[]>([])
const selectedBranch = ref('')
const newBranch = ref('')

const runCommands = ref<RunSuggestion[]>([])
const customCmd = ref('')
const runTask = ref<TaskHistory | null>(null)
const runLogs = ref<string[]>([])
const runLogsText = computed(() => runLogs.value.join(''))
const logBoxRef = ref<HTMLElement | null>(null)
const runTaskId = ref('')
const external = ref<{ running: boolean; processes: Array<{ pid: number; command: string }> }>({
  running: false,
  processes: []
})

const tasks = ref<TaskItem[]>([])
const newTaskTitle = ref('')
const newTaskTag = ref<'feature' | 'bug' | 'chore'>('feature')

const selectedChanges = ref<Set<string>>(new Set())
const commitMessage = ref('')
const nameEditing = ref(false)

async function load() {
  loading.value = true
  try {
    let detail = await window.api.project.detail(projectId)
    if (!detail.remotes?.length) {
      try {
        await window.api.project.syncRemotes(projectId)
        detail = await window.api.project.detail(projectId)
      } catch {
        // 忽略
      }
    }
    project.value = detail
    git.value = detail.git
    history.value = detail.history || []
    progress.value = {
      percent: detail.progress_percent || 0,
      stage: (detail.progress_stage || 'planning') as Project['progress_stage'],
      note: detail.progress_note || ''
    }
    editForm.value = { name: detail.name, description: detail.description || '' }
  } catch (e) {
    ElMessage.error(`加载失败: ${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

async function loadCommits() {
  try {
    commits.value = await window.api.git.log(projectId, 20)
  } catch {
    commits.value = []
  }
}

async function loadTasks() {
  try {
    tasks.value = await window.api.project.tasks.list(projectId)
  } catch {
    tasks.value = []
  }
}

async function loadBranches() {
  try {
    branches.value = await window.api.git.branches(projectId)
    selectedBranch.value = branches.value.find((b) => b.current)?.name || ''
  } catch {
    branches.value = []
  }
}

async function switchBranch(name: string) {
  if (!name || name === branches.value.find((b) => b.current)?.name) return
  try {
    const msg = await window.api.git.checkout(projectId, name)
    ElMessage.success(msg)
    await load()
    await loadCommits()
    await loadBranches()
  } catch (e) {
    ElMessage.error(`切换失败: ${(e as Error).message}`)
  }
}

async function createBranch() {
  const name = newBranch.value.trim()
  if (!name) {
    ElMessage.warning('请填写分支名')
    return
  }
  try {
    const msg = await window.api.git.checkout(projectId, name, true)
    ElMessage.success(msg)
    newBranch.value = ''
    await load()
    await loadCommits()
    await loadBranches()
  } catch (e) {
    ElMessage.error(`创建失败: ${(e as Error).message}`)
  }
}

/* ---------- Git 提交 ---------- */
function toggleChange(path: string) {
  const set = new Set(selectedChanges.value)
  if (set.has(path)) set.delete(path)
  else set.add(path)
  selectedChanges.value = set
}

async function doCommit(alsoPush = false) {
  const message = commitMessage.value.trim()
  if (!message) {
    ElMessage.warning('请填写提交说明')
    return
  }
  const paths = selectedChanges.value.size ? [...selectedChanges.value] : undefined
  busy.value = alsoPush ? 'commit-push' : 'commit'
  try {
    const msg = await window.api.git.commit(projectId, message, paths)
    ElMessage.success(msg)
    commitMessage.value = ''
    selectedChanges.value = new Set()
    if (alsoPush) {
      const pushMsg = await window.api.git.push(projectId, false)
      ElMessage.success(pushMsg)
    }
    await load()
    await loadCommits()
  } catch (e) {
    ElMessage.error(`提交失败: ${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function doPull() {
  busy.value = 'pull'
  try {
    ElMessage.success(await window.api.git.pull(projectId))
    load()
    loadCommits()
  } catch (e) {
    ElMessage.error(`拉取失败: ${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function doPush() {
  busy.value = 'push'
  try {
    ElMessage.success(await window.api.git.push(projectId, false))
    load()
  } catch (e) {
    ElMessage.error(`推送失败: ${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function recognize() {
  busy.value = 'sync'
  try {
    await window.api.project.syncRemotes(projectId)
    await load()
    await loadCommits()
    await loadBranches()
    ElMessage.success(
      git.value?.isGit ? '已识别到本地 git 仓库' : '该目录仍无 git 仓库，可在下方手动关联远程仓库'
    )
  } catch (e) {
    ElMessage.error(String((e as Error).message || e))
  } finally {
    busy.value = ''
  }
}

async function linkOnly() {
  if (!linkForm.value.url.trim()) {
    ElMessage.warning('请填写远程仓库地址')
    return
  }
  busy.value = 'link'
  try {
    await window.api.git.linkRemote(projectId, { name: linkForm.value.name, url: linkForm.value.url })
    ElMessage.success('已关联远程仓库')
    linkForm.value.url = ''
    await load()
    await loadCommits()
    await loadBranches()
  } catch (e) {
    ElMessage.error(`关联失败: ${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function linkAndUpload() {
  if (!linkForm.value.url.trim()) {
    ElMessage.warning('请填写远程仓库地址')
    return
  }
  busy.value = 'upload'
  try {
    await window.api.git.linkRemote(projectId, { name: linkForm.value.name || 'origin', url: linkForm.value.url.trim() })
    ElMessage.success('已关联远程仓库')
    await window.api.git.commitAll(projectId, 'Initial commit by ProjectHub')
    const msg = await window.api.git.push(projectId, true)
    ElMessage.success(msg)
    await load()
    await loadCommits()
    await loadBranches()
  } catch (e) {
    ElMessage.error(`上传失败: ${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function syncRemotes() {
  try {
    await window.api.project.syncRemotes(projectId)
    ElMessage.success('已从本地仓库读取 remote')
    load()
  } catch (e) {
    ElMessage.error(`同步失败: ${(e as Error).message}`)
  }
}

/* ---------- 运行方式 ---------- */
async function loadRunCommands() {
  try {
    runCommands.value = await window.api.project.runCommands(projectId)
  } catch {
    runCommands.value = []
  }
}

async function loadRunState() {
  try {
    const list = await window.api.runner.listRunning()
    runTask.value = list.find((t) => t.project_id === projectId) || null
    if (runTask.value) runTaskId.value = runTask.value.id
  } catch {
    runTask.value = null
  }
  try {
    external.value = await window.api.runner.probeExternal(projectId)
  } catch {
    external.value = { running: false, processes: [] }
  }
}

async function runCommand(c: RunSuggestion) {
  if (runTask.value?.status === 'running') {
    ElMessage.warning('已有任务在运行，请先停止')
    return
  }
  try {
    const payload = JSON.parse(JSON.stringify({ bin: c.bin, args: c.args, display: c.cmd })) as {
      bin: string
      args: string[]
      display?: string
    }
    const taskId = await window.api.runner.startCustom(projectId, payload)
    runTaskId.value = taskId
    runLogs.value = [`$ ${c.cmd}\n`]
    runTask.value = {
      id: taskId,
      project_id: projectId,
      type: 'run',
      status: 'running',
      command: c.cmd,
      log_path: null,
      pid: null,
      exit_code: null,
      started_at: new Date().toISOString(),
      ended_at: null
    }
  } catch (e) {
    ElMessage.error(`启动失败: ${(e as Error).message}`)
  }
}

async function stopRun() {
  if (!runTask.value) return
  await window.api.runner.stop(runTask.value.id)
}

function appendRunLog(chunk: LogChunk) {
  if (chunk.taskId !== runTaskId.value) return
  runLogs.value.push(chunk.data)
  if (runLogs.value.length > 300) runLogs.value.splice(0, 100)
  nextTick(() => {
    if (logBoxRef.value) logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight
  })
}

function onRunStatus(task: TaskHistory) {
  if (task.project_id !== projectId) return
  if (task.id === runTaskId.value || runTask.value?.id === task.id) {
    runTask.value = task.status === 'running' ? task : null
    ElMessage.info(`任务结束：${task.status}`)
  }
  history.value = [task, ...history.value.filter((t) => t.id !== task.id)].slice(0, 20)
}

async function addCustomCommand() {
  const cmd = customCmd.value.trim()
  if (!cmd) {
    ElMessage.warning('请填写命令')
    return
  }
  try {
    const cur = runCommands.value.filter((c) => c.custom).map((c) => c.cmd)
    if (cur.includes(cmd)) {
      ElMessage.warning('该命令已存在')
      return
    }
    await window.api.project.customCommands.save(projectId, [...cur, cmd])
    customCmd.value = ''
    runCommands.value = await window.api.project.runCommands(projectId)
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  }
}

async function removeCustomCommand(cmd: string) {
  try {
    const cur = runCommands.value.filter((c) => c.custom && c.cmd !== cmd).map((c) => c.cmd)
    await window.api.project.customCommands.save(projectId, cur)
    runCommands.value = await window.api.project.runCommands(projectId)
    ElMessage.success('已移除')
  } catch (e) {
    ElMessage.error(String((e as Error).message || e))
  }
}

async function addTask() {
  const title = newTaskTitle.value.trim()
  if (!title) {
    ElMessage.warning('请填写任务标题')
    return
  }
  try {
    tasks.value = await window.api.project.tasks.add(projectId, title, newTaskTag.value)
    newTaskTitle.value = ''
    await load()
  } catch (e) {
    ElMessage.error(`添加失败: ${(e as Error).message}`)
  }
}

async function toggleTask(t: TaskItem) {
  try {
    await window.api.project.tasks.toggle(t.id)
    await loadTasks()
    const detail = await window.api.project.detail(projectId)
    project.value = detail
    progress.value.percent = detail.progress_percent || 0
  } catch (e) {
    ElMessage.error(String((e as Error).message || e))
  }
}

async function removeTask(t: TaskItem) {
  try {
    await window.api.project.tasks.remove(t.id)
    tasks.value = tasks.value.filter((x) => x.id !== t.id)
    await load()
  } catch (e) {
    ElMessage.error(String((e as Error).message || e))
  }
}

/* ---------- 基本信息 ---------- */
async function saveBasic() {
  if (!project.value) return
  savingBasic.value = true
  try {
    await window.api.project.update(project.value.id, {
      name: editForm.value.name.trim() || project.value.name,
      description: editForm.value.description
    })
    ElMessage.success('已保存项目信息')
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    savingBasic.value = false
  }
}

async function saveName() {
  if (!project.value) return
  const name = editForm.value.name.trim()
  nameEditing.value = false
  if (!name || name === project.value.name) return
  try {
    await window.api.project.update(project.value.id, { name })
    ElMessage.success('已重命名')
    load()
  } catch (e) {
    ElMessage.error(String((e as Error).message || e))
  }
}

/* ---------- 开发进度 ---------- */
async function saveProgress() {
  if (!project.value) return
  saving.value = true
  try {
    await window.api.project.update(project.value.id, {
      progress_stage: progress.value.stage,
      progress_note: progress.value.note
    })
    ElMessage.success('阶段与备注已保存')
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function commitAndPush() {
  await doCommit(true)
}

/* ---------- 其他 ---------- */
function toWebUrl(url: string): string {
  const m = url.match(/^git@([^:]+):(.+?)(\.git)?$/)
  if (m) return `https://${m[1]}/${m[2]}`
  return url.replace(/\.git$/, '')
}

async function openRepo(url: string) {
  try {
    await window.api.system.openExternal(toWebUrl(url))
  } catch {
    ElMessage.error('打开失败')
  }
}

async function viewLog(taskId: string) {
  const log = await window.api.task.readLog(taskId)
  ElMessageBox.alert(
    `<pre style="max-height:420px;overflow:auto;margin:0;font-size:12px;background:#0f172a;color:#86efac;padding:12px;border-radius:6px;font-family:ui-monospace,Menlo,monospace">${log
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</pre>`,
    '运行日志',
    { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
  ).catch(() => undefined)
}

function openFolder() {
  if (project.value) window.api.system.openPath(project.value.path)
}

function fmtTime(iso: string): string {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 16)
}

const typeLabel: Record<string, string> = {
  'java-maven': 'Java · Maven',
  'java-gradle': 'Java · Gradle',
  python: 'Python',
  flutter: 'Flutter',
  vue: 'Vue',
  react: 'React',
  node: 'Node',
  unknown: '未知'
}

const typeColor: Record<string, string> = {
  'java-maven': '#e76f00',
  'java-gradle': '#02303a',
  python: '#3776ab',
  flutter: '#02569b',
  vue: '#10b981',
  react: '#0284c7',
  node: '#16a34a',
  unknown: '#64748b'
}

const stageLabel: Record<string, string> = {
  planning: '规划中',
  developing: '开发中',
  testing: '联调测试',
  released: '已发布'
}

const platformLabel: Record<string, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
  other: 'Git'
}

const statusType: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  running: 'warning',
  success: 'success',
  failed: 'danger',
  stopped: 'info'
}

onMounted(() => {
  load()
  loadCommits()
  loadBranches()
  loadRunCommands()
  loadRunState()
  loadTasks()
  window.api.runner.onLog(appendRunLog)
  window.api.runner.onStatus(onRunStatus)
})
</script>

<template>
  <div v-loading="loading" class="detail-view">
    <!-- 返回导航条 -->
    <div class="top-nav-bar">
      <el-button text class="btn-back" @click="router.push('/projects')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回项目列表</span>
      </el-button>
    </div>

    <template v-if="project">
      <!-- 信息头卡片 (Design Token: rounded 12px, soft shadow) -->
      <div class="header-card">
        <div class="header-top-row">
          <div class="title-edit-area">
            <template v-if="nameEditing">
              <el-input
                v-model="editForm.name"
                size="default"
                class="name-input"
                autofocus
                @keyup.enter="saveName"
                @blur="saveName"
              />
            </template>
            <template v-else>
              <h1 class="project-title" title="点击重命名" @click="nameEditing = true">
                {{ project.name }}
                <el-icon class="icon-rename"><Edit /></el-icon>
              </h1>
            </template>

            <span
              class="type-pill"
              :style="{ backgroundColor: typeColor[project.type] || '#64748b' }"
            >
              {{ typeLabel[project.type] || project.type }}
            </span>

            <span v-if="project.framework" class="framework-pill">
              {{ project.framework }}
            </span>

            <div v-if="runTask?.status === 'running'" class="status-badge running">
              <span class="status-dot pulse-dot"></span>
              <span>运行中</span>
            </div>
            <div v-else-if="external.running" class="status-badge external">
              <span class="status-dot"></span>
              <span>外部进程</span>
            </div>
            <div v-else class="status-badge active">
              <span class="status-dot"></span>
              <span>活跃</span>
            </div>
          </div>

          <div class="header-action-group">
            <el-input
              v-model="editForm.description"
              size="small"
              placeholder="项目描述，一句话说明项目功能…"
              class="desc-input"
              @keyup.enter="saveBasic"
            />
            <el-button size="small" type="primary" :loading="savingBasic" @click="saveBasic">
              保存
            </el-button>
            <el-button size="small" @click="openFolder()">
              <el-icon><FolderOpened /></el-icon>打开目录
            </el-button>
            <el-button size="small" :loading="busy === 'sync'" @click="recognize">
              <el-icon><Search /></el-icon>识别
            </el-button>
          </div>
        </div>

        <div class="header-meta-row">
          <span class="meta-path mono" :title="project.path" @click="openFolder()">
            {{ project.path }}
          </span>

          <span class="meta-sep">·</span>

          <template v-if="git?.isGit">
            <span class="meta-branch mono">⑂ {{ git.branch || 'main' }}</span>

            <span v-if="git.ahead > 0" class="badge-ahead mono">
              ↑ {{ git.ahead }}
            </span>

            <span v-if="git.behind > 0" class="badge-behind mono">
              ↓ {{ git.behind }}
            </span>

            <span v-if="git.ahead === 0 && git.behind === 0" class="badge-synced">
              已同步
            </span>

            <span v-if="git.lastCommit" class="meta-last-commit mono">
              {{ git.lastCommit.hash }} {{ git.lastCommit.message }}
            </span>
          </template>
          <template v-else>
            <span class="badge-no-git">未检测到 Git 仓库</span>
          </template>
        </div>
      </div>

      <!-- 主体栅格布局 (两列中后台布局) -->
      <div class="detail-grid">
        <!-- 左列：开发进度 + Git 工作区 + 提交记录 -->
        <div class="grid-col col-left">
          <!-- 1. 开发进度卡片 -->
          <div class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">开发进度</span>
              <span class="task-summary-badge">
                {{ tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length} 已完成` : '暂无任务' }}
              </span>
            </div>

            <div class="progress-hero">
              <span class="progress-big-number">{{ progress.percent }}%</span>
              <div class="progress-bar-container">
                <el-progress
                  :percentage="progress.percent"
                  :stroke-width="8"
                  :show-text="false"
                  color="#2563EB"
                />
              </div>
            </div>

            <div class="stage-segmented">
              <el-radio-group v-model="progress.stage" size="small" class="stage-radio-group">
                <el-radio-button value="planning">规划中</el-radio-button>
                <el-radio-button value="developing">开发中</el-radio-button>
                <el-radio-button value="testing">联调测试</el-radio-button>
                <el-radio-button value="released">已发布</el-radio-button>
              </el-radio-group>
            </div>

            <div class="progress-note-area">
              <el-input
                v-model="progress.note"
                type="textarea"
                :rows="2"
                placeholder="填写当前阶段的进展备注…"
              />
              <el-button
                type="primary"
                size="small"
                :loading="saving"
                class="btn-save-progress"
                @click="saveProgress"
              >
                保存阶段与备注
              </el-button>
            </div>

            <div class="task-divider">
              <span>任务列表（驱动进度）</span>
            </div>

            <div class="task-add-row">
              <el-input
                v-model="newTaskTitle"
                size="small"
                placeholder="输入新任务描述…"
                @keyup.enter="addTask"
              />
              <el-select v-model="newTaskTag" size="small" style="width: 100px">
                <el-option label="功能" value="feature" />
                <el-option label="缺陷" value="bug" />
                <el-option label="杂项" value="chore" />
              </el-select>
              <el-button size="small" type="primary" @click="addTask">添加</el-button>
            </div>

            <div class="task-item-list">
              <div v-for="t in tasks" :key="t.id" class="task-row">
                <el-checkbox :model-value="!!t.done" @change="toggleTask(t)" />
                <span class="task-text" :class="{ 'is-done': t.done }">{{ t.title }}</span>
                <span
                  class="task-tag-pill"
                  :class="t.tag === 'bug' ? 'tag-bug' : t.tag === 'feature' ? 'tag-feature' : 'tag-chore'"
                >
                  {{ t.tag === 'bug' ? '缺陷' : t.tag === 'feature' ? '功能' : '杂项' }}
                </span>
                <button type="button" class="btn-delete-task" @click="removeTask(t)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>

              <el-empty
                v-if="!tasks.length"
                description="暂无任务，可添加任务自动驱动完成百分比"
                :image-size="48"
              />
            </div>
          </div>

          <!-- 2. Git 工作区卡片 (已存在 Git 仓库) -->
          <div v-if="git?.isGit" class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">Git 工作区</span>
            </div>

            <el-tabs class="custom-tabs">
              <!-- Tab 1: 变更与提交 -->
              <el-tab-pane label="变更与提交">
                <div v-if="git.changes.length" class="changes-box">
                  <div class="changes-header-bar">
                    <span class="changes-count">未提交改动 ({{ git.changes.length }})</span>
                    <span class="changes-tip">勾选文件或提交全部</span>
                  </div>
                  <div class="changes-scroll">
                    <label v-for="f in git.changes" :key="f.path" class="change-file-item">
                      <el-checkbox
                        :model-value="selectedChanges.has(f.path)"
                        @change="toggleChange(f.path)"
                      />
                      <span
                        class="status-char"
                        :class="f.status === 'M' ? 'status-m' : f.status === 'A' ? 'status-a' : 'status-d'"
                      >
                        {{ f.status }}
                      </span>
                      <span class="file-path mono" :title="f.path">{{ f.path }}</span>
                    </label>
                  </div>
                </div>
                <div v-else class="clean-tip">
                  工作区干净，无未提交变更
                </div>

                <div class="commit-input-box">
                  <el-input
                    v-model="commitMessage"
                    placeholder="提交说明，如 feat: 支持自定义多命令并行"
                    @keyup.enter="doCommit(false)"
                  />
                </div>

                <div class="git-action-buttons">
                  <el-button
                    size="small"
                    type="primary"
                    :loading="busy === 'commit'"
                    :disabled="!commitMessage.trim() || (!selectedChanges.size && !git.changes.length)"
                    @click="doCommit(false)"
                  >
                    提交{{ selectedChanges.size ? `所选 ${selectedChanges.size} 个` : '全部' }}
                  </el-button>

                  <el-button
                    size="small"
                    type="success"
                    class="btn-commit-push"
                    :loading="busy === 'commit-push'"
                    :disabled="!commitMessage.trim() || (!selectedChanges.size && !git.changes.length)"
                    @click="commitAndPush"
                  >
                    提交并推送
                  </el-button>

                  <el-button
                    size="small"
                    :loading="busy === 'pull'"
                    @click="doPull"
                  >
                    拉取
                  </el-button>

                  <el-button
                    size="small"
                    :loading="busy === 'push'"
                    @click="doPush"
                  >
                    推送
                  </el-button>
                </div>
              </el-tab-pane>

              <!-- Tab 2: 远程与分支 -->
              <el-tab-pane label="远程与分支">
                <div class="branch-manager-bar">
                  <span class="field-label">分支管理:</span>
                  <el-select
                    v-if="branches.length"
                    v-model="selectedBranch"
                    size="small"
                    style="width: 170px"
                    placeholder="切换分支"
                    @change="switchBranch"
                  >
                    <el-option
                      v-for="b in branches"
                      :key="b.name"
                      :label="b.name + (b.current ? '（当前）' : '')"
                      :value="b.name"
                    />
                  </el-select>

                  <el-input
                    v-model="newBranch"
                    size="small"
                    placeholder="新分支名"
                    style="width: 130px"
                    @keyup.enter="createBranch"
                  />

                  <el-button size="small" @click="createBranch">
                    创建并切换
                  </el-button>
                </div>

                <div class="remotes-sub-header">远程仓库列表</div>

                <div v-if="project.remotes && project.remotes.length" class="remotes-list">
                  <div v-for="r in project.remotes" :key="r.id" class="remote-row-item">
                    <span class="remote-name-tag">{{ r.name }}</span>
                    <span v-if="r.is_default" class="badge-default">默认</span>
                    <span class="badge-platform">{{ platformLabel[r.platform] || r.platform }}</span>
                    <span class="remote-url-text mono" :title="r.url">{{ r.url }}</span>
                    <button type="button" class="btn-link-web" @click="openRepo(r.url)">
                      网页
                    </button>
                  </div>
                </div>
                <div v-else class="clean-tip">未关联远程仓库</div>

                <div class="remote-buttons-row">
                  <el-button size="small" :icon="RefreshRight" @click="syncRemotes">
                    从本地读取
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    :loading="busy === 'pull'"
                    @click="doPull"
                  >
                    拉取
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :loading="busy === 'push'"
                    @click="doPush"
                  >
                    推送
                  </el-button>
                </div>

                <div class="task-divider">
                  <span>手动添加远程仓库</span>
                </div>

                <div class="link-form-container">
                  <el-input
                    v-model="linkForm.url"
                    size="small"
                    placeholder="git@github.com:you/repo.git 或 https://..."
                  >
                    <template #prepend>地址</template>
                  </el-input>
                  <div class="link-form-row2">
                    <el-input
                      v-model="linkForm.name"
                      size="small"
                      placeholder="remote 名称（默认 origin）"
                      style="flex: 1"
                    />
                    <el-button
                      size="small"
                      :loading="busy === 'link'"
                      @click="linkOnly"
                    >
                      仅关联
                    </el-button>
                    <el-button
                      size="small"
                      type="primary"
                      :loading="busy === 'upload'"
                      @click="linkAndUpload"
                    >
                      添加并首次上传
                    </el-button>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>

          <!-- Git 仓库关联卡片 (未初始化 Git 仓库) -->
          <div v-else class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">Git 仓库关联</span>
            </div>

            <el-alert
              type="warning"
              :closable="false"
              show-icon
              class="tip-alert-box"
            >
              <template #title>
                未检测到本地 Git 仓库。可点击顶部「识别」刷新，或在下方手动关联远程仓库。
              </template>
            </el-alert>

            <template v-if="project.remotes?.length">
              <div class="remotes-sub-header">已登记的仓库关联：</div>
              <div v-for="r in project.remotes" :key="r.id" class="remote-row-item">
                <span class="remote-name-tag">{{ r.name }}</span>
                <span class="badge-platform">{{ platformLabel[r.platform] || r.platform }}</span>
                <span class="remote-url-text mono" :title="r.url">{{ r.url }}</span>
                <button type="button" class="btn-link-web" @click="openRepo(r.url)">
                  打开网页
                </button>
              </div>
            </template>

            <div class="task-divider">
              <span>手动关联远程仓库</span>
            </div>

            <div class="link-form-container">
              <el-input
                v-model="linkForm.url"
                size="small"
                placeholder="git@github.com:you/repo.git 或 https://github.com/..."
              >
                <template #prepend>地址</template>
              </el-input>
              <div class="link-form-row2">
                <el-input
                  v-model="linkForm.name"
                  size="small"
                  placeholder="remote 名称（默认 origin）"
                  style="flex: 1"
                />
                <el-button
                  size="small"
                  :loading="busy === 'link'"
                  @click="linkOnly"
                >
                  仅关联
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  :loading="busy === 'upload'"
                  @click="linkAndUpload"
                >
                  关联并首次上传
                </el-button>
              </div>
              <div class="tip-footnote">
                「首次上传」将自动执行：git init → 添加 remote → 提交所有文件 → push -u origin
              </div>
            </div>
          </div>

          <!-- 3. 提交记录卡片 -->
          <div class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">提交记录</span>
              <el-button size="small" text @click="loadCommits">
                <el-icon><Refresh /></el-icon>刷新
              </el-button>
            </div>

            <div v-if="commits.length" class="commits-table-wrap">
              <el-table :data="commits" size="small" max-height="260">
                <el-table-column label="Hash" width="90">
                  <template #default="{ row }">
                    <span class="commit-hash mono">{{ row.hash }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="说明" show-overflow-tooltip />
                <el-table-column label="时间" width="130">
                  <template #default="{ row }">
                    <span class="commit-time">{{ fmtTime(row.date) }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-empty v-else description="暂无提交记录" :image-size="50" />
          </div>
        </div>

        <!-- 右列：运行控制台 + 实时日志 + 最近运行记录 -->
        <div class="grid-col col-right">
          <!-- 4. 运行方式与控制台 -->
          <div class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">运行方式</span>
              <div v-if="runTask?.status === 'running'" class="running-indicator-tag">
                <span class="status-dot pulse-dot"></span>
                <span>运行中</span>
                <el-button size="small" type="danger" plain class="btn-stop-mini" @click="stopRun">
                  停止
                </el-button>
              </div>
            </div>

            <div class="cmd-list-wrap">
              <div
                v-for="c in runCommands"
                :key="c.cmd"
                class="cmd-item-box"
                :class="{ 'is-custom': c.custom }"
              >
                <div class="cmd-item-left">
                  <span class="cmd-code mono">{{ c.cmd }}</span>
                  <span v-if="c.custom" class="badge-custom">自定义</span>
                </div>
                <div class="cmd-item-actions">
                  <el-button
                    v-if="c.custom"
                    size="small"
                    text
                    type="danger"
                    @click="removeCustomCommand(c.cmd)"
                  >
                    移除
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="runTask?.status === 'running'"
                    @click="runCommand(c)"
                  >
                    <el-icon><VideoPlay /></el-icon>运行
                  </el-button>
                </div>
              </div>

              <el-empty
                v-if="!runCommands.length"
                description="未识别到预置运行方式，可在下方手动添加"
                :image-size="48"
              />
            </div>

            <!-- 添加自定义命令 -->
            <div class="custom-cmd-input-row">
              <el-input
                v-model="customCmd"
                size="small"
                placeholder="手动添加运行命令，如 ./run.sh 或 npm run dev"
                @keyup.enter="addCustomCommand"
              />
              <el-button size="small" type="primary" plain @click="addCustomCommand">
                添加
              </el-button>
            </div>

            <!-- 实时终端日志框 (High-tech Dark Terminal) -->
            <div class="terminal-container">
              <div class="terminal-header">
                <span class="terminal-title">实时控制台日志</span>
                <span v-if="runTaskId" class="terminal-id mono">Task: {{ runTaskId }}</span>
              </div>
              <div ref="logBoxRef" class="terminal-body mono">
                <pre v-if="runLogs.length">{{ runLogsText }}</pre>
                <div v-else class="terminal-empty">控制台等待输出…</div>
              </div>
            </div>
          </div>

          <!-- 5. 最近运行记录 -->
          <div class="content-card">
            <div class="card-title-bar">
              <span class="card-main-title">运行记录</span>
            </div>

            <div v-if="history.length" class="history-table-wrap">
              <el-table :data="history" size="small" max-height="240">
                <el-table-column prop="type" label="类型" width="70" />
                <el-table-column label="状态" width="90">
                  <template #default="{ row }">
                    <el-tag :type="statusType[row.status] || 'info'" size="small">
                      {{ row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="command" label="命令" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="mono" style="font-size: 11px">{{ row.command }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="日志" width="70" align="right">
                  <template #default="{ row }">
                    <el-button size="small" text type="primary" @click="viewLog(row.id)">
                      查看
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-empty v-else description="暂无运行记录" :image-size="50" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  background-color: var(--canvas);
}

.top-nav-bar {
  margin-bottom: 16px;
}

.btn-back {
  font-size: 13px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-back:hover {
  color: var(--primary);
}

/* Header Card */
.header-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.title-edit-area {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.project-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.icon-rename {
  font-size: 13px;
  color: #94a3b8;
}

.name-input {
  width: 200px;
}

.type-pill {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 9999px;
}

.framework-pill {
  font-size: 11px;
  color: #0284c7;
  background: #e0f2fe;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.running {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warn);
}
.status-badge.running .status-dot {
  background-color: var(--warn);
}

.status-badge.active {
  background: rgba(16, 185, 129, 0.12);
  color: var(--ok);
}
.status-badge.active .status-dot {
  background-color: var(--ok);
}

.status-badge.external {
  background: rgba(59, 130, 246, 0.12);
  color: var(--info);
}
.status-badge.external .status-dot {
  background-color: var(--info);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.header-action-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 580px;
  justify-content: flex-end;
}

.desc-input {
  flex: 1;
  max-width: 260px;
}

.header-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  flex-wrap: wrap;
}

.meta-path {
  cursor: pointer;
  color: #475569;
  background: #f8fafc;
  padding: 2px 8px;
  border-radius: 4px;
}

.meta-sep {
  color: #cbd5e1;
}

.meta-branch {
  color: var(--ink);
  font-weight: 600;
}

.badge-ahead {
  background: #fef2f2;
  color: #ef4444;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 11px;
}

.badge-behind {
  background: #fffbeb;
  color: #f59e0b;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 11px;
}

.badge-synced {
  background: #ecfdf5;
  color: #10b981;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 11px;
}

.meta-last-commit {
  color: #94a3b8;
}

.badge-no-git {
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 4px;
}

/* Grid Layout */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.grid-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Generic Content Card */
.content-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
}

.card-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-main-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}

.task-summary-badge {
  font-size: 12px;
  color: var(--muted);
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
}

/* Progress Hero */
.progress-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.progress-big-number {
  font-size: 26px;
  font-weight: 800;
  color: var(--primary);
  min-width: 60px;
}

.progress-bar-container {
  flex: 1;
}

.stage-segmented {
  margin-bottom: 14px;
}

.stage-radio-group :deep(.el-radio-button__inner) {
  border-radius: 8px !important;
  margin-right: 4px;
  border: 1px solid var(--line) !important;
  background: #ffffff;
  color: var(--muted);
  font-size: 12px;
  padding: 6px 12px;
}

.stage-radio-group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--primary) !important;
  color: #ffffff !important;
  border-color: var(--primary) !important;
  box-shadow: none !important;
  font-weight: 600;
}

.progress-note-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-save-progress {
  align-self: flex-start;
}

.task-divider {
  display: flex;
  align-items: center;
  margin: 18px 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  gap: 10px;
}

.task-divider::before,
.task-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}

.task-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.task-item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.task-text {
  flex: 1;
  font-size: 13px;
  color: var(--ink-2);
}

.task-text.is-done {
  color: #94a3b8;
  text-decoration: line-through;
}

.task-tag-pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.tag-feature {
  background: #eff6ff;
  color: #2563eb;
}

.tag-bug {
  background: #fef2f2;
  color: #ef4444;
}

.tag-chore {
  background: #f8fafc;
  color: #64748b;
}

.btn-delete-task {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.btn-delete-task:hover {
  color: #ef4444;
}

/* Changes and Commit */
.changes-box {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.changes-header-bar {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}

.changes-count {
  font-weight: 600;
  color: var(--ink);
}

.changes-tip {
  color: var(--muted);
}

.changes-scroll {
  max-height: 180px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.change-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.change-file-item:hover {
  background: #f8fafc;
}

.status-char {
  font-size: 11px;
  font-weight: 700;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.status-m {
  background: #fffbeb;
  color: #f59e0b;
}

.status-a {
  background: #ecfdf5;
  color: #10b981;
}

.status-d {
  background: #fef2f2;
  color: #ef4444;
}

.file-path {
  flex: 1;
  font-size: 12px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clean-tip {
  padding: 12px 0;
  font-size: 13px;
  color: var(--muted);
}

.commit-input-box {
  margin-bottom: 12px;
}

.git-action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-commit-push {
  background-color: #10b981 !important;
  border-color: #10b981 !important;
}

/* Branch Manager */
.branch-manager-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.field-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

.remotes-sub-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 8px;
}

.remotes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.remote-row-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.remote-name-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ink);
  color: #ffffff;
}

.badge-default {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #ecfdf5;
  color: #10b981;
  font-weight: 500;
}

.badge-platform {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 500;
}

.remote-url-text {
  flex: 1;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-link-web {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}

.remote-buttons-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.link-form-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-form-row2 {
  display: flex;
  gap: 8px;
}

.tip-footnote {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.tip-alert-box {
  margin-bottom: 14px;
}

/* Commits Table */
.commits-table-wrap {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.commit-hash {
  font-size: 12px;
  color: var(--primary);
  font-weight: 600;
}

.commit-time {
  font-size: 12px;
  color: var(--muted);
}

/* Run Console */
.running-indicator-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--warn);
  font-weight: 600;
}

.running-indicator-tag .status-dot {
  background-color: var(--warn);
}

.btn-stop-mini {
  margin-left: 6px;
  padding: 2px 8px;
}

.cmd-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.cmd-item-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  transition: all 0.15s;
}

.cmd-item-box.is-custom {
  border-style: dashed;
  border-color: #cbd5e1;
}

.cmd-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.cmd-code {
  font-size: 13px;
  color: var(--ink-2);
}

.badge-custom {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
}

.cmd-item-actions {
  display: flex;
  gap: 6px;
}

.custom-cmd-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

/* High-tech Dark Terminal */
.terminal-container {
  background: #0f172a;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.4);
}

.terminal-header {
  background: #1e293b;
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.terminal-title {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.terminal-id {
  font-size: 11px;
  color: #64748b;
}

.terminal-body {
  padding: 12px;
  min-height: 120px;
  max-height: 180px;
  overflow-y: auto;
  color: #86efac;
  font-size: 12px;
  line-height: 1.5;
}

.terminal-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal-empty {
  color: #475569;
  font-style: italic;
}

.history-table-wrap {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
</style>
