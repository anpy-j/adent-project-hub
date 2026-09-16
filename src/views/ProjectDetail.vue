<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight, Search, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import type { GitBranch, GitCommit, GitSummary, LogChunk, Project, RunSuggestion, TaskHistory } from '../types'

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

const selectedChanges = ref<Set<string>>(new Set())
const commitMessage = ref('')

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
    runLogs.value = [`$ ${c.cmd}`, '']
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

/* ---------- 基本信息 ---------- */
async function saveBasic() {
  if (!project.value) return
  savingBasic.value = true
  try {
    await window.api.project.update(project.value.id, {
      name: editForm.value.name.trim() || project.value.name,
      description: editForm.value.description
    })
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    savingBasic.value = false
  }
}

async function saveProgress() {
  if (!project.value) return
  saving.value = true
  try {
    await window.api.project.update(project.value.id, {
      progress_percent: progress.value.percent,
      progress_stage: progress.value.stage,
      progress_note: progress.value.note
    })
    ElMessage.success('进度已保存')
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
    `<pre style="max-height:420px;overflow:auto;margin:0;font-size:12px">${log
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
  window.api.runner.onLog(appendRunLog)
  window.api.runner.onStatus(onRunStatus)
})
</script>

<template>
  <div v-loading="loading" class="detail-view">
    <div class="toolbar">
      <el-button text @click="router.push('/projects')">
        <el-icon><ArrowLeft /></el-icon>返回项目列表
      </el-button>
    </div>

    <template v-if="project">
      <el-card class="head-card">
        <div class="head-line">
          <h2 class="name">{{ project.name }}</h2>
          <el-tag size="small">{{ typeLabel[project.type] || project.type }}</el-tag>
          <el-tag v-if="project.framework" size="small" effect="plain">{{ project.framework }}</el-tag>
          <el-input v-model="editForm.name" size="small" style="width: 180px" placeholder="名称" />
          <el-input
            v-model="editForm.description"
            size="small"
            style="flex: 1"
            placeholder="描述"
            @keyup.enter="saveBasic"
          />
          <el-button size="small" type="primary" plain :loading="savingBasic" @click="saveBasic">保存</el-button>
          <el-button size="small" @click="openFolder()">
            <el-icon><FolderOpened /></el-icon>目录
          </el-button>
        </div>
        <div class="meta-line">
          <span class="path" :title="project.path" @click="openFolder()">{{ project.path }}</span>
          <template v-if="git?.isGit">
            <span class="sep">·</span>
            <span class="mono">⑂ {{ git.branch }}</span>
            <el-tag v-if="git.ahead > 0" type="danger" size="small">↑ {{ git.ahead }}</el-tag>
            <el-tag v-if="git.behind > 0" type="warning" size="small">↓ {{ git.behind }}</el-tag>
            <el-tag v-if="git.ahead === 0 && git.behind === 0" type="success" size="small">已同步</el-tag>
          </template>
          <el-tag v-else size="small" type="info">未检测到 git 仓库</el-tag>
        </div>
      </el-card>

      <div class="grid">
        <div class="col">
          <el-card class="block">
            <template #header>
              <div class="head-row">
                <b>开发进度（手动维护）</b>
                <el-tag size="small" type="info">{{ stageLabel[progress.stage] }}</el-tag>
              </div>
            </template>
            <div class="progress-top">
              <span class="progress-num">{{ progress.percent }}%</span>
              <el-slider v-model="progress.percent" :step="5" style="flex: 1" />
            </div>
            <el-radio-group v-model="progress.stage" class="stage">
              <el-radio-button value="planning">规划中</el-radio-button>
              <el-radio-button value="developing">开发中</el-radio-button>
              <el-radio-button value="testing">联调测试</el-radio-button>
              <el-radio-button value="released">已发布</el-radio-button>
            </el-radio-group>
            <el-input
              v-model="progress.note"
              type="textarea"
              :rows="3"
              placeholder="当前进展备注，例如：完成登录模块，正在开发订单接口…"
            />
            <el-button type="primary" :loading="saving" style="margin-top: 12px" @click="saveProgress">
              保存进度
            </el-button>
          </el-card>

          <el-card class="block">
            <template #header>
              <div class="head-row">
                <b>Git 仓库</b>
                <div class="branch-row">
                  <el-select
                    v-if="branches.length"
                    v-model="selectedBranch"
                    size="small"
                    style="width: 160px"
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
                    style="width: 120px"
                    @keyup.enter="createBranch"
                  />
                  <el-button size="small" @click="createBranch">创建</el-button>
                </div>
              </div>
            </template>

            <template v-if="!git?.isGit">
              <el-alert type="warning" :closable="false" show-icon class="tip-alert">
                <template #title>
                  未检测到本地 git 仓库。若刚执行过 git init / clone，点「识别」刷新；也可直接在下方手动关联远程仓库。
                </template>
              </el-alert>
              <el-button class="recognize-btn" :loading="busy === 'sync'" @click="recognize">
                <el-icon><Search /></el-icon>识别本地仓库
              </el-button>
            </template>

            <template v-else>
              <el-empty
                v-if="!project.remotes?.length"
                description="本地是 git 仓库，但还没有 remote，可在下方手动添加"
                :image-size="60"
              />
              <div v-for="r in project.remotes" :key="r.id" class="remote-row">
                <el-tag size="small" effect="dark">{{ r.name }}</el-tag>
                <el-tag v-if="r.is_default" size="small" type="success">默认</el-tag>
                <el-tag size="small" effect="plain">{{ platformLabel[r.platform] || r.platform }}</el-tag>
                <span class="remote-url" :title="r.url">{{ r.url }}</span>
                <el-button size="small" text type="primary" @click="openRepo(r.url)">打开网页</el-button>
              </div>
              <div class="btn-row" style="margin-bottom: 4px">
                <el-button size="small" :icon="RefreshRight" @click="syncRemotes">从本地读取</el-button>
                <el-button size="small" type="primary" plain :loading="busy === 'pull'" @click="doPull">
                  拉取
                </el-button>
                <el-button size="small" type="primary" :loading="busy === 'push'" @click="doPush">
                  推送
                </el-button>
              </div>
            </template>

            <template v-if="git?.isGit">
              <el-divider>提交改动</el-divider>
              <div v-if="git.changes.length" class="changes-list">
                <label v-for="f in git.changes" :key="f.path" class="change-row">
                  <el-checkbox
                    :model-value="selectedChanges.has(f.path)"
                    @change="toggleChange(f.path)"
                  />
                  <el-tag size="small" effect="plain">{{ f.status }}</el-tag>
                  <span class="remote-url" :title="f.path">{{ f.path }}</span>
                </label>
              </div>
              <div v-else class="tip-line" style="padding: 4px 0 8px">工作区干净，没有未提交变更</div>
              <el-input v-model="commitMessage" placeholder="提交说明，如 feat: 新增 xx 功能" />
              <div class="btn-row" style="margin-top: 10px">
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
                  :loading="busy === 'commit-push'"
                  :disabled="!commitMessage.trim() || (!selectedChanges.size && !git.changes.length)"
                  @click="commitAndPush"
                >
                  提交并推送
                </el-button>
              </div>
            </template>

            <el-divider>{{ git?.isGit ? '手动添加远程仓库' : '手动关联远程仓库' }}</el-divider>
            <el-input
              v-model="linkForm.url"
              placeholder="git@github.com:you/repo.git 或 https://github.com/you/repo.git"
            >
              <template #prepend>地址</template>
            </el-input>
            <el-input v-model="linkForm.name" placeholder="remote 名称（默认 origin）" class="link-name" />
            <div class="btn-row">
              <el-button :loading="busy === 'link'" @click="linkOnly">仅关联</el-button>
              <el-button type="primary" :loading="busy === 'upload'" @click="linkAndUpload">
                {{ git?.isGit ? '添加并首次上传' : '关联并首次上传' }}
              </el-button>
            </div>
            <div class="tip-line">
              「首次上传」会自动：git init（如需）→ 添加 remote → 提交全部文件 → push -u origin
            </div>
          </el-card>
        </div>

        <div class="col">
          <el-card class="block">
            <template #header>
              <div class="head-row">
                <b>运行方式</b>
                <span v-if="runTask?.status === 'running'" class="run-state">
                  <span class="dot" />运行中
                  <el-button size="small" type="danger" plain @click="stopRun">
                    <el-icon><VideoPause /></el-icon>停止
                  </el-button>
                </span>
              </div>
            </template>
            <div class="cmd-list">
              <div v-for="c in runCommands" :key="c.cmd" class="cmd-row">
                <span class="cmd-text mono">{{ c.cmd }}</span>
                <el-tag v-if="c.custom" size="small" effect="plain" type="info">自定义</el-tag>
                <el-button size="small" text type="danger" v-if="c.custom" @click="removeCustomCommand(c.cmd)">
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
              <el-empty v-if="!runCommands.length" description="未识别到运行方式" :image-size="50" />
            </div>
            <div class="custom-add">
              <el-input
                v-model="customCmd"
                placeholder="手动添加运行命令，如 ./run.sh"
                @keyup.enter="addCustomCommand"
              />
              <el-button type="primary" plain @click="addCustomCommand">添加</el-button>
            </div>
            <div v-if="runLogs.length" ref="logBoxRef" class="log-box">
              <pre>{{ runLogsText }}</pre>
            </div>
          </el-card>

          <el-card class="block">
            <template #header>
              <div class="head-row">
                <b>提交记录</b>
                <el-button size="small" text @click="loadCommits">
                  <el-icon><Refresh /></el-icon>刷新
                </el-button>
              </div>
            </template>
            <el-table v-if="commits.length" :data="commits" size="small" max-height="300">
              <el-table-column label="提交" width="90">
                <template #default="{ row }">
                  <span class="mono hash">{{ row.hash }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="message" label="说明" show-overflow-tooltip />
              <el-table-column prop="author" label="作者" width="100" />
              <el-table-column label="时间" width="150">
                <template #default="{ row }">
                  <span class="time">{{ fmtTime(row.date) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无提交记录" :image-size="60" />
          </el-card>

          <el-card class="block">
            <template #header><b>最近运行记录</b></template>
            <el-table v-if="history.length" :data="history" size="small" max-height="260">
              <el-table-column prop="type" label="类型" width="80" />
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <el-tag :type="statusType[row.status] || 'info'" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="command" label="命令" show-overflow-tooltip />
              <el-table-column label="日志" width="80">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="viewLog(row.id)">查看</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无运行记录" :image-size="60" />
          </el-card>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}
.toolbar {
  margin-bottom: 12px;
}
.head-card {
  margin-bottom: 16px;
}
.head-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.name {
  margin: 0;
  white-space: nowrap;
}
.meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}
.sep {
  color: var(--el-border-color);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.hash {
  color: var(--el-color-primary);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.block {
  margin-bottom: 16px;
}
.head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.progress-top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 4px;
}
.progress-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-color-primary);
  width: 64px;
}
.stage {
  margin: 14px 0;
}
.remote-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  margin-bottom: 8px;
}
.remote-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tip-line {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tip-alert {
  margin-bottom: 12px;
}
.recognize-btn {
  margin-bottom: 4px;
}
.link-name {
  margin-top: 10px;
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.branch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.changes-list {
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.change-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  cursor: pointer;
}
.cmd-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cmd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}
.cmd-text {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.custom-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.run-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-warning);
  font-size: 12px;
}
.run-state .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-warning);
  animation: blink 1.2s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
.log-box {
  background: #0f172a;
  color: #86efac;
  border-radius: 6px;
  padding: 10px;
  max-height: 220px;
  overflow-y: auto;
  margin-top: 10px;
}
.log-box pre {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
