<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkspaceStore } from '../stores/workspace'
import { useProjectStore } from '../stores/project'
import type { Project, LogChunk, RunSuggestion, TaskHistory } from '../types'
import LogPanel from '../components/LogPanel.vue'
import AddProjectDialog from '../components/AddProjectDialog.vue'

const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const projectStore = useProjectStore()

const addDialogVisible = ref(false)
const activeProject = ref<Project | null>(null)
const runningTasks = ref<Record<string, string>>({}) // projectId -> taskId
const logPanelRef = ref<InstanceType<typeof LogPanel> | null>(null)

const viewMode = ref<'table' | 'card'>('table')
const keyword = ref('')
const platformFilter = ref('all')
const stageFilter = ref<'all' | 'developing' | 'released'>('all')

const filteredProjects = computed(() =>
  workspaceStore.currentId
    ? projectStore.projects.filter((p) => p.workspace_id === workspaceStore.currentId)
    : projectStore.projects
)

const tableRows = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return filteredProjects.value.filter((p) => {
    if (platformFilter.value === 'linked' && !(p.remotes && p.remotes.length)) return false
    if (platformFilter.value === 'local' && p.remotes && p.remotes.length) return false
    if (stageFilter.value === 'developing' && (p.progress_percent || 0) === 0) return false
    if (stageFilter.value === 'released' && p.progress_stage !== 'released') return false
    if (!k) return true
    return (
      p.name.toLowerCase().includes(k) ||
      p.path.toLowerCase().includes(k) ||
      (p.remotes || []).some((r) => r.url.toLowerCase().includes(k))
    )
  })
})

const activeCount = computed(() => filteredProjects.value.filter((p) => (p.progress_percent || 0) > 0).length)
const linkedCount = computed(() => filteredProjects.value.filter((p) => p.remotes && p.remotes.length).length)
const runningCount = computed(() => Object.keys(runningTasks.value).length)

const stats = computed(() => [
  {
    label: '项目总数',
    value: String(filteredProjects.value.length),
    icon: 'FolderOpened',
    tone: 'primary',
    bg: 'rgba(37, 99, 235, 0.1)',
    color: '#2563eb'
  },
  {
    label: '活跃开发',
    value: String(activeCount.value),
    icon: 'TrendCharts',
    tone: 'success',
    bg: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981'
  },
  {
    label: '待同步/已关联',
    value: String(linkedCount.value),
    icon: 'Share',
    tone: 'warning',
    bg: 'rgba(245, 158, 11, 0.1)',
    color: '#f59e0b'
  },
  {
    label: '运行中任务',
    value: String(runningCount.value),
    icon: 'VideoPlay',
    tone: 'info',
    bg: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6'
  }
])

onMounted(async () => {
  if (!workspaceStore.list.length) await workspaceStore.load()
  await projectStore.load(workspaceStore.currentId || undefined)
  if (route.query.action === 'add') {
    addDialogVisible.value = true
  }
})

watch(
  () => route.query.action,
  (action) => {
    if (action === 'add') {
      addDialogVisible.value = true
    }
  }
)

watch(
  () => workspaceStore.currentId,
  () => {
    projectStore.load(workspaceStore.currentId || undefined)
  }
)

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

function platformLabel(p: Project): string {
  const r = (p.remotes || [])[0]?.platform
  return r === 'github' ? 'GitHub' : r === 'gitee' ? 'Gitee' : r === 'gitlab' ? 'GitLab' : r ? 'Git' : '仅本地'
}

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const t = iso.includes('T') ? new Date(iso).getTime() : new Date(iso.replace(' ', 'T') + 'Z').getTime()
  if (isNaN(t)) return '-'
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d} 天前` : new Date(t).toLocaleDateString()
}

function onRowMenu(cmd: string, row: Project) {
  if (cmd === 'log') {
    activeProject.value = row
    logPanelRef.value?.show()
  } else if (cmd === 'finder') {
    openInFinder(row)
  } else if (cmd === 'remove') {
    removeProject(row)
  }
}

const runDialog = ref(false)
const runTarget = ref<Project | null>(null)
const runCmdList = ref<RunSuggestion[]>([])
const runCmdLoading = ref(false)

async function openRunDialog(p: Project) {
  runTarget.value = p
  runDialog.value = true
  runCmdLoading.value = true
  try {
    runCmdList.value = await window.api.project.runCommands(p.id)
  } catch {
    runCmdList.value = []
  } finally {
    runCmdLoading.value = false
  }
}

async function startWith(c: RunSuggestion) {
  if (!runTarget.value) return
  try {
    const payload = JSON.parse(JSON.stringify({ bin: c.bin, args: c.args, display: c.cmd }))
    const taskId = await window.api.runner.startCustom(runTarget.value.id, payload)
    runningTasks.value[runTarget.value.id] = taskId
    activeProject.value = runTarget.value
    logPanelRef.value?.attach(taskId, runTarget.value)
    runDialog.value = false
    ElMessage.success(`已启动：${c.cmd}`)
  } catch (e) {
    ElMessage.error(`启动失败: ${(e as Error).message}`)
  }
}

function openAdd() {
  addDialogVisible.value = true
}

async function onAdded() {
  await projectStore.load(workspaceStore.currentId || undefined)
}

async function stopProject(project: Project) {
  const taskId = runningTasks.value[project.id]
  if (!taskId) return
  await window.api.runner.stop(taskId)
}

async function removeProject(project: Project) {
  await ElMessageBox.confirm(`确定删除项目「${project.name}」？`, '删除项目', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await window.api.project.remove(project.id)
  await projectStore.load(workspaceStore.currentId || undefined)
  ElMessage.success('已删除')
}

function openInFinder(project: Project) {
  window.api.system.openPath(project.path)
}

window.api.runner.onStatus((task: TaskHistory) => {
  if (task.status !== 'running') {
    delete runningTasks.value[task.project_id]
    if (task.status === 'failed') {
      ElMessage.error(`任务结束: ${task.status}`)
    }
  }
})

window.api.runner.onLog((chunk: LogChunk) => {
  logPanelRef.value?.append(chunk)
})
</script>

<template>
  <div class="project-list-view">
    <!-- 顶栏 / 页头 -->
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">项目总览</h1>
        <div class="head-sub">
          <span>{{ filteredProjects.length }} 个项目</span>
          <span class="dot-sep">·</span>
          <span>{{ activeCount }} 个活跃</span>
          <span class="dot-sep">·</span>
          <span>{{ linkedCount }} 个已关联</span>
          <el-tag v-if="workspaceStore.currentId" size="small" type="primary" effect="light" class="ws-tag">
            {{ workspaceStore.list.find((w) => w.id === workspaceStore.currentId)?.name }}
          </el-tag>
        </div>
      </div>

      <div class="head-actions">
        <el-input
          v-model="keyword"
          placeholder="搜索项目名称 / 路径 / 仓库…"
          clearable
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-button type="primary" class="btn-add" @click="openAdd">
          <el-icon><Plus /></el-icon>添加项目
        </el-button>
      </div>
    </div>

    <!-- 指标统计行 -->
    <div class="stats-row">
      <div v-for="s in stats" :key="s.label" class="stat-card">
        <div class="stat-icon-wrap" :style="{ backgroundColor: s.bg, color: s.color }">
          <el-icon :size="22"><component :is="s.icon" /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- 筛选与视图切换工具条 -->
    <div class="filter-bar">
      <div class="filter-group">
        <el-radio-group v-model="platformFilter" size="small" class="custom-radio-group">
          <el-radio-button value="all">全部仓库</el-radio-button>
          <el-radio-button value="linked">已关联远程</el-radio-button>
          <el-radio-button value="local">仅本地</el-radio-button>
        </el-radio-group>

        <el-radio-group v-model="stageFilter" size="small" class="custom-radio-group">
          <el-radio-button value="all">全部阶段</el-radio-button>
          <el-radio-button value="developing">开发中</el-radio-button>
          <el-radio-button value="released">已发布</el-radio-button>
        </el-radio-group>
      </div>

      <div class="view-switch">
        <el-radio-group v-model="viewMode" size="small" class="custom-radio-group">
          <el-radio-button value="table">
            <el-icon><Grid /></el-icon>
          </el-radio-button>
          <el-radio-button value="card">
            <el-icon><Menu /></el-icon>
          </el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 表格视图（企业级默认） -->
    <el-card v-if="viewMode === 'table'" class="table-card" shadow="never">
      <el-table
        :data="tableRows"
        style="width: 100%"
        :header-cell-style="{
          background: '#F8FAFC',
          color: '#64748B',
          fontWeight: 600,
          borderBottom: '1px solid #E2E8F0',
          padding: '12px 16px'
        }"
        :cell-style="{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }"
        empty-text="暂无匹配项目，点击右上角「添加项目」录入"
        row-class-name="table-row-hover"
        @row-click="(row: unknown) => router.push(`/projects/${(row as Project).id}`)"
      >
        <el-table-column label="项目信息" min-width="260">
          <template #default="{ row }">
            <div class="cell-project">
              <div class="proj-title-row">
                <span class="proj-name">{{ row.name }}</span>
                <span
                  class="type-pill"
                  :style="{ backgroundColor: typeColor[row.type] || '#64748b' }"
                >
                  {{ typeLabel[row.type] || row.type }}
                </span>
                <span v-if="row.framework" class="framework-pill">
                  {{ row.framework }}
                </span>
              </div>
              <div class="proj-path mono" :title="row.path">
                {{ row.path }}
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="远程仓库" min-width="200">
          <template #default="{ row }">
            <div v-if="(row as Project).remotes && (row as Project).remotes!.length" class="cell-remote">
              <el-tag size="small" effect="plain" type="info" class="remote-badge">
                {{ platformLabel(row as Project) }}
              </el-tag>
              <span class="remote-url mono" :title="(row as Project).remotes![0].url">
                {{ (row as Project).remotes![0].url }}
              </span>
            </div>
            <span v-else class="cell-local-only">仅本地</span>
          </template>
        </el-table-column>

        <el-table-column label="开发进度" width="180">
          <template #default="{ row }">
            <div class="cell-progress">
              <div class="progress-bar-wrap">
                <el-progress
                  :percentage="row.progress_percent || 0"
                  :stroke-width="6"
                  :show-text="false"
                  color="#2563EB"
                  class="progress-line"
                />
                <span class="progress-percent-label">{{ row.progress_percent || 0 }}%</span>
              </div>
              <span class="stage-tag">{{ stageLabel[row.progress_stage] || '规划中' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="运行状态" width="120">
          <template #default="{ row }">
            <div v-if="runningTasks[row.id]" class="status-indicator running">
              <span class="status-dot pulse-dot"></span>
              <span>运行中</span>
            </div>
            <div v-else-if="!row.remotes?.length" class="status-indicator unlinked">
              <span class="status-dot"></span>
              <span>未关联</span>
            </div>
            <div v-else class="status-indicator normal">
              <span class="status-dot"></span>
              <span>就绪</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="最近活动" width="130">
          <template #default="{ row }">
            <span class="cell-time">{{ timeAgo(row.last_run_at || row.updated_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="220" align="right">
          <template #default="{ row }">
            <div class="cell-actions" @click.stop>
              <el-button
                v-if="!runningTasks[row.id]"
                type="primary"
                size="small"
                class="btn-action"
                @click.stop="openRunDialog(row as Project)"
              >
                运行
              </el-button>
              <el-button
                v-else
                type="danger"
                size="small"
                class="btn-action"
                @click.stop="stopProject(row as Project)"
              >
                停止
              </el-button>

              <el-button
                size="small"
                class="btn-action"
                @click.stop="router.push(`/projects/${(row as Project).id}`)"
              >
                详情
              </el-button>

              <el-dropdown trigger="click" @command="(cmd: string) => onRowMenu(cmd, row as Project)">
                <el-button size="small" class="btn-more">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="log">查看日志</el-dropdown-item>
                    <el-dropdown-item command="finder">在访达/资源管理器中打开</el-dropdown-item>
                    <el-dropdown-item command="remove" divided style="color: #ef4444">删除项目</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 卡片视图 -->
    <div v-else class="project-grid">
      <div
        v-for="p in tableRows"
        :key="p.id"
        class="project-card hover-lift"
        :class="runningTasks[p.id] ? 'border-running' : (p.progress_percent || 0) > 80 ? 'border-success' : 'border-primary'"
        @click="router.push(`/projects/${p.id}`)"
      >
        <div class="card-header">
          <div class="card-title-group">
            <h3 class="card-name">{{ p.name }}</h3>
            <span class="card-desc">{{ p.description || '无描述' }}</span>
          </div>
          <span
            class="type-pill"
            :style="{ backgroundColor: typeColor[p.type] || '#64748b' }"
          >
            {{ typeLabel[p.type] || p.type }}
          </span>
        </div>

        <div class="card-path mono" :title="p.path" @click.stop="openInFinder(p)">
          <el-icon><FolderOpened /></el-icon>
          <span>{{ p.path }}</span>
        </div>

        <div class="card-badges">
          <span v-if="p.remotes && p.remotes.length" class="badge-tag mono">
            ⑂ {{ p.remotes[0].name || 'origin' }}
          </span>
          <span v-else class="badge-tag mono">本地项目</span>

          <span v-if="runningTasks[p.id]" class="badge-status running">
            <span class="status-dot pulse-dot"></span> 运行中
          </span>
          <span v-else-if="p.progress_stage === 'released'" class="badge-status released">已发布</span>
          <span v-else class="badge-status normal">{{ stageLabel[p.progress_stage] || '规划中' }}</span>
        </div>

        <div class="card-progress">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: `${p.progress_percent || 0}%` }"></div>
          </div>
          <div class="progress-meta">
            <span>开发进度</span>
            <span class="mono">{{ p.progress_percent || 0 }}%</span>
          </div>
        </div>

        <div class="card-footer">
          <span class="card-time">{{ timeAgo(p.last_run_at || p.updated_at) }}</span>
          <div class="card-actions" @click.stop>
            <el-button
              v-if="!runningTasks[p.id]"
              type="primary"
              size="small"
              @click.stop="openRunDialog(p)"
            >
              运行
            </el-button>
            <el-button
              v-else
              type="danger"
              size="small"
              @click.stop="stopProject(p)"
            >
              停止
            </el-button>
            <el-button size="small" @click.stop="router.push(`/projects/${p.id}`)">
              详情
            </el-button>
          </div>
        </div>
      </div>

      <!-- 添加项目卡片占位 -->
      <div class="add-card-placeholder hover-lift" @click="openAdd">
        <div class="add-icon-circle">
          <el-icon :size="24"><Plus /></el-icon>
        </div>
        <div class="add-text-title">添加项目</div>
        <div class="add-text-sub">本地路径 + 关联仓库，一键纳管</div>
      </div>
    </div>

    <!-- 弹窗与抽屉 -->
    <LogPanel ref="logPanelRef" />

    <AddProjectDialog
      v-model:visible="addDialogVisible"
      :workspace-id="workspaceStore.currentId"
      @added="onAdded"
    />

    <!-- 运行命令选择弹窗 -->
    <el-dialog v-model="runDialog" title="选择运行命令" width="560px" class="run-dialog">
      <div v-loading="runCmdLoading" class="run-cmd-container">
        <div
          v-for="c in runCmdList"
          :key="c.cmd"
          class="run-cmd-row"
          @click="startWith(c)"
        >
          <span class="cmd-text mono">{{ c.cmd }}</span>
          <el-tag v-if="c.custom" size="small" type="info">自定义</el-tag>
          <el-button size="small" type="primary">启动</el-button>
        </div>
        <el-empty
          v-if="!runCmdList.length && !runCmdLoading"
          description="未识别到预置运行命令，可进项目详情页手动添加"
          :image-size="60"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.project-list-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  overflow-y: auto;
  gap: 20px;
}

/* Page Head */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.head-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot-sep {
  color: #cbd5e1;
}

.ws-tag {
  margin-left: 4px;
  font-weight: 500;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 260px;
}

.btn-add {
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

/* Stats Row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
}

.stat-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.custom-radio-group :deep(.el-radio-button__inner) {
  border-radius: 8px !important;
  margin-right: 4px;
  border: 1px solid var(--line) !important;
  background: #ffffff;
  color: var(--muted);
  font-size: 12px;
  padding: 7px 14px;
  transition: all 0.15s;
}

.custom-radio-group :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-left: 1px solid var(--line) !important;
}

.custom-radio-group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--primary) !important;
  color: #ffffff !important;
  border-color: var(--primary) !important;
  box-shadow: none !important;
  font-weight: 600;
}

/* Table Card */
.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

.table-card :deep(.el-card__body) {
  padding: 0 !important;
}

.cell-project {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.proj-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.proj-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--ink);
}

.type-pill {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
}

.framework-pill {
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

.proj-path {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}

.cell-remote {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.remote-badge {
  flex-shrink: 0;
  font-size: 11px;
}

.remote-url {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.cell-local-only {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

.cell-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-line {
  flex: 1;
}

.progress-percent-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  width: 34px;
}

.stage-tag {
  font-size: 11px;
  color: var(--muted);
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.status-indicator.running {
  color: var(--warn);
}
.status-indicator.running .status-dot {
  background-color: var(--warn);
}

.status-indicator.normal {
  color: var(--ok);
}
.status-indicator.normal .status-dot {
  background-color: var(--ok);
}

.status-indicator.unlinked {
  color: #94a3b8;
}
.status-indicator.unlinked .status-dot {
  background-color: #94a3b8;
}

.cell-time {
  font-size: 12px;
  color: var(--muted);
}

.cell-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  align-items: center;
}

.btn-action {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-more {
  padding: 6px 8px;
}

/* Card Grid View */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding-bottom: 30px;
}

.project-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid var(--line);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.border-primary {
  border-top: 4px solid var(--primary);
}

.border-success {
  border-top: 4px solid var(--ok);
}

.border-running {
  border-top: 4px solid var(--warn);
}

.hover-lift:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: #f8fafc;
  padding: 6px 10px;
  border-radius: 6px;
}

.card-path span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 6px;
  font-weight: 500;
}

.badge-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.badge-status.running {
  background: rgba(245, 158, 11, 0.1);
  color: var(--warn);
}

.badge-status.released {
  background: rgba(16, 185, 129, 0.1);
  color: var(--ok);
}

.badge-status.normal {
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
}

.card-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar-bg {
  height: 6px;
  background: #f1f5f9;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.card-time {
  font-size: 12px;
  color: var(--muted);
}

.card-actions {
  display: flex;
  gap: 6px;
}

/* Placeholder card for adding */
.add-card-placeholder {
  border: 2px dashed var(--line);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  cursor: pointer;
  background: #fafafa;
  min-height: 220px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.add-card-placeholder:hover {
  border-color: var(--primary);
  background: #eff6ff;
}

.add-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-text-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
}

.add-text-sub {
  font-size: 12px;
  color: var(--muted);
}

/* Run Command dialog */
.run-cmd-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.run-cmd-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.run-cmd-row:hover {
  border-color: var(--primary);
  background: var(--el-color-primary-light-9);
}

.cmd-text {
  flex: 1;
  font-size: 13px;
  color: var(--ink-2);
}
</style>
