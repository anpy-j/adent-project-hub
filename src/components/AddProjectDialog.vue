<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened, Search, Check, Close, Delete, Plus } from '@element-plus/icons-vue'
import type { DetectResult, Project, ProjectType, SubProject } from '../types'

const props = defineProps<{
  visible: boolean
  workspaceId: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'added', p: Project): void
}>()

const currentStep = ref(1)

const form = ref({
  path: '',
  name: '',
  type: '' as ProjectType | '',
  framework: '' as string | null,
  description: ''
})

const detecting = ref(false)
const detectResult = ref<DetectResult | null>(null)
const remotes = ref<Array<{ name: string; url: string; platform?: string; is_default: number }>>([])
const newRemote = ref({ name: '', url: '' })
const submitting = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      currentStep.value = 1
      form.value = { path: '', name: '', type: '', framework: '', description: '' }
      detectResult.value = null
      remotes.value = []
      newRemote.value = { name: '', url: '' }
    }
  }
)

async function pickDir() {
  const dir = await window.api.system.pickDirectory()
  if (dir) {
    form.value.path = dir
    await detect()
  }
}

async function detect() {
  if (!form.value.path) {
    ElMessage.warning('请先输入或选择本地项目路径')
    return
  }
  detecting.value = true
  try {
    const result = await window.api.project.detect(form.value.path)
    applyDetectResult(result)
    ElMessage.success('识别完成')
  } catch (e) {
    ElMessage.error(`识别失败: ${(e as Error).message}`)
  } finally {
    detecting.value = false
  }
}

function applyDetectResult(result: DetectResult) {
  detectResult.value = result
  form.value.name = result.suggestedName
  form.value.type = result.type
  form.value.framework = result.framework
  if (remotes.value.length === 0 && result.remotes.length) {
    remotes.value = result.remotes.map((r) => ({
      name: r.name,
      url: r.url,
      platform: r.platform,
      is_default: r.is_default
    }))
  }
}

function selectSubProject(sub: SubProject) {
  form.value.path = sub.path
  detectResult.value = detectResult.value
    ? { ...detectResult.value, type: sub.type, framework: sub.framework, suggestedName: sub.name, subProjects: undefined }
    : { type: sub.type, framework: sub.framework, suggestedName: sub.name, isGit: false, branch: null, remotes: [], subProjects: undefined }
  form.value.name = sub.name
  form.value.type = sub.type
  form.value.framework = sub.framework
  ElMessage.info(`已选择子项目: ${sub.name}`)
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

const typeOptions = [
  { label: 'Java · Maven', value: 'java-maven' },
  { label: 'Java · Gradle', value: 'java-gradle' },
  { label: 'Python', value: 'python' },
  { label: 'Flutter', value: 'flutter' },
  { label: 'Vue', value: 'vue' },
  { label: 'React', value: 'react' },
  { label: 'Node', value: 'node' },
  { label: '未知', value: 'unknown' }
]

const platformLabel: Record<string, string> = {
  github: 'GitHub',
  gitee: 'Gitee',
  gitlab: 'GitLab',
  other: 'Git'
}

function addRemote() {
  const url = newRemote.value.url.trim()
  if (!url) {
    ElMessage.warning('请填写仓库地址')
    return
  }
  remotes.value.push({
    name: newRemote.value.name.trim() || (remotes.value.length === 0 ? 'origin' : `remote-${remotes.value.length}`),
    url: url.trim(),
    platform: undefined,
    is_default: remotes.value.length === 0 ? 1 : 0
  })
  newRemote.value = { name: '', url: '' }
}

function removeRemote(index: number) {
  remotes.value.splice(index, 1)
}

function nextToStep2() {
  if (!form.value.path) {
    ElMessage.warning('请选择项目本地路径')
    return
  }
  if (!form.value.name) {
    ElMessage.warning('请填写项目名称')
    return
  }
  currentStep.value = 2
}

function nextToStep3() {
  currentStep.value = 3
}

async function submit() {
  if (!form.value.path) {
    ElMessage.warning('请选择项目路径')
    currentStep.value = 1
    return
  }
  if (!form.value.name) {
    ElMessage.warning('请填写项目名称')
    currentStep.value = 1
    return
  }
  submitting.value = true
  try {
    // Vue 响应式 Proxy 无法被 IPC structured clone，必须深拷贝为纯对象
    const payload = JSON.parse(
      JSON.stringify({
        workspace_id: props.workspaceId,
        name: form.value.name,
        path: form.value.path,
        type: form.value.type || 'unknown',
        framework: form.value.framework || null,
        description: form.value.description || null,
        remotes: remotes.value
      })
    )
    const project = await window.api.project.add(payload)
    emit('added', project)
    emit('update:visible', false)
    ElMessage.success('已成功纳管项目！')
  } catch (e) {
    ElMessage.error(`添加失败: ${(e as Error).message}`)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="添加项目"
    width="640px"
    class="add-project-dialog"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <!-- 步骤指示器 (1 基本信息 → 2 关联仓库 → 3 确认完成) -->
    <div class="steps-indicator">
      <div
        class="step-item"
        :class="{ active: currentStep === 1, completed: currentStep > 1 }"
        @click="currentStep = 1"
      >
        <span class="step-badge">1</span>
        <span class="step-name">基本信息</span>
      </div>

      <div class="step-line" :class="{ filled: currentStep > 1 }"></div>

      <div
        class="step-item"
        :class="{ active: currentStep === 2, completed: currentStep > 2 }"
        @click="form.path && form.name ? currentStep = 2 : null"
      >
        <span class="step-badge">2</span>
        <span class="step-name">关联仓库</span>
      </div>

      <div class="step-line" :class="{ filled: currentStep > 2 }"></div>

      <div
        class="step-item"
        :class="{ active: currentStep === 3 }"
        @click="form.path && form.name ? currentStep = 3 : null"
      >
        <span class="step-badge">3</span>
        <span class="step-name">确认完成</span>
      </div>
    </div>

    <!-- 步骤内容区域 -->
    <div class="step-body">
      <!-- Step 1: 路径识别与基本信息 -->
      <div v-show="currentStep === 1" class="step-pane">
        <div class="form-item-group">
          <label class="item-label">
            本地项目路径 <span class="required">*</span>
          </label>
          <div class="path-input-row">
            <el-input
              v-model="form.path"
              placeholder="请选择或输入本地项目绝对路径…"
              clearable
              @blur="form.path && !detectResult && detect()"
            >
              <template #prefix>
                <el-icon><FolderOpened /></el-icon>
              </template>
            </el-input>
            <el-button @click="pickDir">浏览</el-button>
            <el-button type="primary" plain :loading="detecting" @click="detect">
              识别
            </el-button>
          </div>
        </div>

        <!-- 识别状态结果卡片 -->
        <div v-if="detectResult" class="detect-result-banner">
          <div class="detect-status-line">
            <el-icon class="ok-icon"><Check /></el-icon>
            <span class="detect-title">已识别项目特征：</span>
            <el-tag size="small" type="success" effect="dark">
              {{ typeLabel[detectResult.type] || detectResult.type }}
            </el-tag>
            <el-tag v-if="detectResult.framework" size="small" effect="plain" type="info">
              {{ detectResult.framework }}
            </el-tag>
            <el-tag v-if="detectResult.isGit" size="small" effect="plain">
              git: {{ detectResult.branch || 'main' }}
            </el-tag>
          </div>
          <div v-if="detectResult.remotes.length" class="detect-remote-hint">
            已自动提取 {{ detectResult.remotes.length }} 个远程仓库（将在第 2 步关联）
          </div>
        </div>

        <!-- 子项目切换 -->
        <div v-if="detectResult?.subProjects?.length" class="sub-projects-container">
          <div class="sub-title">检测到多模块/子项目，点击可切换为子项目路径：</div>
          <div class="sub-list">
            <div
              v-for="sub in detectResult.subProjects"
              :key="sub.path"
              class="sub-card-row"
              @click="selectSubProject(sub)"
            >
              <el-icon><FolderOpened /></el-icon>
              <span class="sub-card-name">{{ sub.name }}</span>
              <el-tag size="small">{{ typeLabel[sub.type] || sub.type }}</el-tag>
              <el-tag v-if="sub.framework" size="small" effect="plain">{{ sub.framework }}</el-tag>
            </div>
          </div>
        </div>

        <div class="form-row-grid">
          <div class="form-item-group">
            <label class="item-label">
              项目名称 <span class="required">*</span>
            </label>
            <el-input v-model="form.name" placeholder="请输入项目标识名" />
          </div>

          <div class="form-item-group">
            <label class="item-label">项目类型</label>
            <el-select v-model="form.type" placeholder="可手动修正项目类型">
              <el-option
                v-for="opt in typeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
        </div>

        <div class="form-item-group">
          <label class="item-label">项目描述</label>
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="一句话介绍这个项目的功能与用途（选填）…"
          />
        </div>
      </div>

      <!-- Step 2: 关联仓库 -->
      <div v-show="currentStep === 2" class="step-pane">
        <div class="step-hint-box">
          关联远程 Git 仓库便于统一查看远端分支、拉取和推送代码。若仅在本地开发，可直接进行下一步。
        </div>

        <div class="remotes-manage-box">
          <div class="remotes-header-label">已关联的远程仓库：</div>
          <div v-if="remotes.length" class="remotes-dialog-list">
            <div v-for="(r, i) in remotes" :key="r.url + i" class="remote-manage-item">
              <span class="remote-badge-name">{{ r.name }}</span>
              <span v-if="r.is_default" class="badge-tag-default">默认</span>
              <span v-if="r.platform" class="badge-tag-platform">
                {{ platformLabel[r.platform] || r.platform }}
              </span>
              <span class="remote-url-display mono" :title="r.url">{{ r.url }}</span>
              <button type="button" class="btn-remove-remote" @click="removeRemote(i)">
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>
          <div v-else class="empty-remotes-tip">
            暂无关联远程仓库，可在下方手动录入 remote 地址。
          </div>

          <div class="add-remote-bar">
            <el-input
              v-model="newRemote.name"
              placeholder="名称 (默认 origin)"
              style="width: 140px"
            />
            <el-input
              v-model="newRemote.url"
              placeholder="git@github.com:you/repo.git 或 https://..."
              class="mono"
              @keyup.enter="addRemote"
            />
            <el-button @click="addRemote">
              <el-icon><Plus /></el-icon>添加关联
            </el-button>
          </div>
        </div>
      </div>

      <!-- Step 3: 确认完成 -->
      <div v-show="currentStep === 3" class="step-pane">
        <div class="confirm-summary-card">
          <div class="summary-header">项目确认清单</div>

          <div class="summary-grid">
            <div class="summary-row">
              <span class="s-label">项目名称</span>
              <span class="s-val bold">{{ form.name }}</span>
            </div>

            <div class="summary-row">
              <span class="s-label">本地目录</span>
              <span class="s-val mono">{{ form.path }}</span>
            </div>

            <div class="summary-row">
              <span class="s-label">类型/框架</span>
              <div class="s-val flex-gap">
                <el-tag size="small" type="primary">
                  {{ typeLabel[form.type] || form.type || '未知' }}
                </el-tag>
                <el-tag v-if="form.framework" size="small" effect="plain">
                  {{ form.framework }}
                </el-tag>
              </div>
            </div>

            <div class="summary-row">
              <span class="s-label">远程仓库</span>
              <div class="s-val">
                <template v-if="remotes.length">
                  <div v-for="r in remotes" :key="r.url" class="summary-remote-tag mono">
                    {{ r.name }}: {{ r.url }}
                  </div>
                </template>
                <span v-else class="text-muted">仅登记本地目录</span>
              </div>
            </div>

            <div v-if="form.description" class="summary-row">
              <span class="s-label">项目描述</span>
              <span class="s-val text-muted">{{ form.description }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗底部操作按钮 -->
    <template #footer>
      <div class="dialog-footer-actions">
        <el-button @click="emit('update:visible', false)">取消</el-button>

        <!-- Step 1 Actions -->
        <template v-if="currentStep === 1">
          <el-button type="primary" @click="nextToStep2">
            下一步：关联仓库
          </el-button>
        </template>

        <!-- Step 2 Actions -->
        <template v-else-if="currentStep === 2">
          <el-button @click="currentStep = 1">上一步</el-button>
          <el-button type="primary" @click="nextToStep3">
            下一步：确认信息
          </el-button>
        </template>

        <!-- Step 3 Actions -->
        <template v-else-if="currentStep === 3">
          <el-button @click="currentStep = 2">上一步</el-button>
          <el-button type="primary" :loading="submitting" @click="submit">
            确认添加项目
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.add-project-dialog :deep(.el-dialog__body) {
  padding: 20px 24px !important;
}

/* Steps Indicator */
.steps-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 9999px;
  transition: all 0.15s ease;
}

.step-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.step-item.active {
  color: #ffffff;
  background: var(--primary);
  font-weight: 600;
}

.step-item.active .step-badge {
  background: #ffffff;
  color: var(--primary);
}

.step-item.completed {
  color: var(--ok);
}

.step-item.completed .step-badge {
  background: rgba(16, 185, 129, 0.15);
  color: var(--ok);
}

.step-line {
  width: 32px;
  height: 2px;
  background: var(--line);
}

.step-line.filled {
  background: var(--primary);
}

/* Step Pane Content */
.step-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 260px;
}

.form-item-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.required {
  color: #ef4444;
}

.path-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.path-input-row .el-input {
  flex: 1;
}

/* Detect Result Banner */
.detect-result-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detect-status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}

.ok-icon {
  color: var(--ok);
  font-size: 14px;
  font-weight: bold;
}

.detect-title {
  font-weight: 600;
  color: #065f46;
}

.detect-remote-hint {
  font-size: 11px;
  color: #047857;
  padding-left: 22px;
}

/* Sub-projects list */
.sub-projects-container {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  background: #f8fafc;
}

.sub-title {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.sub-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}

.sub-card-row:hover {
  border-color: var(--primary);
  background: #eff6ff;
}

.sub-card-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.form-row-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Step 2: Remotes Management */
.step-hint-box {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.remotes-manage-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.remotes-header-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.remotes-dialog-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.remote-manage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.remote-badge-name {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ink);
  color: #ffffff;
}

.badge-tag-default {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #ecfdf5;
  color: #10b981;
}

.badge-tag-platform {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eff6ff;
  color: #2563eb;
}

.remote-url-display {
  flex: 1;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove-remote {
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}

.btn-remove-remote:hover {
  color: #ef4444;
}

.empty-remotes-tip {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  padding: 8px 0;
}

.add-remote-bar {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* Step 3: Confirmation Summary */
.confirm-summary-card {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #f8fafc;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-header {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}

.summary-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  font-size: 13px;
}

.s-label {
  width: 80px;
  color: var(--muted);
  font-weight: 500;
  flex-shrink: 0;
}

.s-val {
  flex: 1;
  color: var(--ink-2);
}

.s-val.bold {
  font-weight: 700;
  color: var(--ink);
}

.flex-gap {
  display: flex;
  gap: 6px;
}

.summary-remote-tag {
  font-size: 12px;
  color: #475569;
}

.dialog-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
