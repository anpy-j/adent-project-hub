<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkspaceStore } from '../stores/workspace'
import { useProjectStore } from '../stores/project'
import type { Project, LogChunk, TaskHistory } from '../types'
import LogPanel from '../components/LogPanel.vue'
import AddProjectDialog from '../components/AddProjectDialog.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const projectStore = useProjectStore()

const addDialogVisible = ref(false)
const activeProject = ref<Project | null>(null)
const runningTasks = ref<Record<string, string>>({}) // projectId -> taskId
const logPanelRef = ref<InstanceType<typeof LogPanel> | null>(null)

const filteredProjects = computed(() =>
  workspaceStore.currentId
    ? projectStore.projects.filter((p) => p.workspace_id === workspaceStore.currentId)
    : projectStore.projects
)

onMounted(async () => {
  if (!workspaceStore.list.length) await workspaceStore.load()
  await projectStore.load(workspaceStore.currentId || undefined)
})

watch(() => workspaceStore.currentId, () => {
  projectStore.load(workspaceStore.currentId || undefined)
})

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
  vue: '#42b883',
  react: '#61dafb',
  node: '#5fa04e',
  unknown: '#909399'
}

const stageLabel: Record<string, string> = {
  planning: '规划中',
  developing: '开发中',
  testing: '联调测试',
  released: '已发布'
}

function openAdd() {
  addDialogVisible.value = true
}

async function onAdded() {
  await projectStore.load(workspaceStore.currentId || undefined)
}

async function runProject(project: Project) {
  try {
    const taskId = await window.api.runner.start(project.id)
    runningTasks.value[project.id] = taskId
    activeProject.value = project
    logPanelRef.value?.attach(taskId, project)
  } catch (e) {
    ElMessage.error(`启动失败: ${(e as Error).message}`)
  }
}

async function stopProject(project: Project) {
  const taskId = runningTasks.value[project.id]
  if (!taskId) return
  await window.api.runner.stop(taskId)
}

async function removeProject(project: Project) {
  await ElMessageBox.confirm(`确定删除项目「${project.name}」？`, '删除', {
    type: 'warning'
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
    <div class="toolbar">
      <div class="title">
        <h2>项目列表</h2>
        <el-tag v-if="workspaceStore.currentId" type="info" size="small">
          {{ workspaceStore.list.find((w) => w.id === workspaceStore.currentId)?.name }}
        </el-tag>
      </div>
      <el-button type="primary" @click="openAdd">
        <el-icon><Plus /></el-icon>添加项目
      </el-button>
    </div>

    <div v-loading="projectStore.loading" class="project-grid">
      <el-empty
        v-if="!filteredProjects.length && !projectStore.loading"
        description="还没有项目，点右上角添加"
      />
      <el-card
        v-for="p in filteredProjects"
        :key="p.id"
        class="project-card"
        shadow="hover"
        @click="router.push(`/projects/${p.id}`)"
      >
        <div class="card-head">
          <div class="name">{{ p.name }}</div>
          <el-tag
            size="small"
            :style="{ backgroundColor: typeColor[p.type], color: '#fff', border: 'none' }"
          >
            {{ typeLabel[p.type] }}
          </el-tag>
        </div>
        <div class="path" :title="p.path" @click.stop="openInFinder(p)">
          <el-icon><FolderOpened /></el-icon>
          <span>{{ p.path }}</span>
        </div>
        <div v-if="p.framework" class="framework">
          <el-tag size="small" effect="plain">{{ p.framework }}</el-tag>
        </div>
        <div class="git-row" v-if="p.remotes && p.remotes.length">
          <el-icon><Link /></el-icon>
          <span class="remote-url">{{ p.remotes[0].url }}</span>
        </div>
        <div class="progress-row">
          <el-progress
            :percentage="p.progress_percent || 0"
            :stroke-width="6"
            :show-text="false"
            class="progress-bar"
          />
          <span class="progress-num">{{ p.progress_percent || 0 }}%</span>
          <el-tag size="small" effect="plain" type="info">
            {{ stageLabel[p.progress_stage] || '规划中' }}
          </el-tag>
        </div>
        <div class="actions">
          <el-button
            v-if="!runningTasks[p.id]"
            type="primary"
            size="small"
            @click.stop="runProject(p)"
          >
            <el-icon><VideoPlay /></el-icon>运行
          </el-button>
          <el-button v-else type="danger" size="small" @click.stop="stopProject(p)">
            <el-icon><VideoPause /></el-icon>停止
          </el-button>
          <el-button size="small" @click.stop="activeProject = p; logPanelRef?.show()">
            <el-icon><Document /></el-icon>日志
          </el-button>
          <el-button size="small" text type="danger" @click.stop="removeProject(p)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </el-card>
    </div>

    <LogPanel ref="logPanelRef" />

    <AddProjectDialog
      v-model:visible="addDialogVisible"
      :workspace-id="workspaceStore.currentId"
      @added="onAdded"
    />
  </div>
</template>

<style scoped>
.project-list-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title h2 {
  margin: 0;
  font-size: 18px;
}
.project-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-content: start;
  padding-bottom: 40px;
}
.project-card {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s;
}
.project-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.remote-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.git-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 8px;
  overflow: hidden;
}
.git-row .remote-url {
  flex: 1;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.progress-bar {
  flex: 1;
}
.progress-num {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.path {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 8px;
  overflow: hidden;
}
.path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.framework {
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
