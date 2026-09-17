<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Runtime, AiConfig, AiProviderOption, AiProvider } from '../types'

// ---- 运行时管理 ----
const runtimes = ref<Runtime[]>([])
const scanning = ref(false)

async function load() {
  runtimes.value = await window.api.runtime.list()
}

async function scan() {
  scanning.value = true
  try {
    const scanned = await window.api.runtime.scan()
    ElMessage.success(`扫描完成，新增 ${scanned.length} 个运行时`)
    await load()
  } finally {
    scanning.value = false
  }
}

const kindLabel: Record<string, string> = {
  jdk: 'JDK',
  node: 'Node.js',
  python: 'Python',
  flutter: 'Flutter'
}

// ---- AI 设置（服务发现 Agent） ----
const providers = ref<AiProviderOption[]>([])
const aiForm = ref<AiConfig>({ provider: 'ollama', base_url: '', api_key: '', model: '' })
const aiLoading = ref(false)
const aiSaving = ref(false)
const aiTesting = ref(false)
const aiTestResult = ref('')
const modelOptions = ref<string[]>([])
const modelsLoading = ref(false)
const aiConfigured = ref(false)

const currentProvider = ref<AiProviderOption | null>(null)

function applyProviderPreset(p: AiProviderOption | null) {
  currentProvider.value = p
  if (p && p.baseUrl) aiForm.value.base_url = p.baseUrl
}

async function loadAi() {
  aiLoading.value = true
  try {
    providers.value = await window.api.ai.providers()
    const cfg = await window.api.ai.getConfig()
    aiForm.value = { ...cfg }
    applyProviderPreset(providers.value.find((p) => p.value === cfg.provider) || null)
    aiConfigured.value = !!(cfg.base_url && cfg.model)
  } finally {
    aiLoading.value = false
  }
}

watch(
  () => aiForm.value.provider,
  (val) => {
    const p = providers.value.find((x) => x.value === val)
    if (p) applyProviderPreset(p)
  }
)

async function saveAi() {
  aiSaving.value = true
  try {
    // 关键：contextBridge 无法克隆响应式代理，先转纯对象
    const saved = await window.api.ai.saveConfig(JSON.parse(JSON.stringify(aiForm.value)))
    aiForm.value = { ...saved }
    aiConfigured.value = !!(saved.base_url && saved.model)
    ElMessage.success('AI 配置已保存')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    aiSaving.value = false
  }
}

async function fetchModels() {
  modelsLoading.value = true
  try {
    // 用当前表单值（未保存也允许拉取）
    const list = await window.api.ai.listModels(JSON.parse(JSON.stringify(aiForm.value)))
    modelOptions.value = list
    ElMessage.success(`获取到 ${list.length} 个模型`)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    modelsLoading.value = false
  }
}

async function testAi() {
  aiTesting.value = true
  aiTestResult.value = ''
  try {
    const reply = await window.api.ai.test(JSON.parse(JSON.stringify(aiForm.value)))
    aiTestResult.value = reply
    ElMessage.success('连接正常')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    aiTesting.value = false
  }
}

onMounted(() => {
  load()
  loadAi()
})
</script>

<template>
  <div class="settings-view">
    <div class="toolbar">
      <h2>设置</h2>
    </div>

    <!-- AI 设置 -->
    <el-card v-loading="aiLoading" class="ai-card">
      <template #header>
        <div class="card-head">
          <span>
            AI 设置（服务发现 Agent）
            <el-tag :type="aiConfigured ? 'success' : 'info'" size="small" style="margin-left: 8px">
              {{ aiConfigured ? '已配置' : '未配置' }}
            </el-tag>
          </span>
          <span class="card-head-actions">
            <el-button size="small" :loading="modelsLoading" @click="fetchModels">获取模型列表</el-button>
            <el-button size="small" :loading="aiTesting" @click="testAi">测试连接</el-button>
            <el-button type="primary" size="small" :loading="aiSaving" @click="saveAi">保存</el-button>
          </span>
        </div>
      </template>
      <el-form label-width="100px" label-position="right">
        <el-form-item label="厂商">
          <el-select v-model="aiForm.provider" style="width: 280px">
            <el-option v-for="p in providers" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
          <span class="form-tip">{{ currentProvider?.hint }}</span>
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="aiForm.base_url" placeholder="http://localhost:11434/v1" style="width: 420px" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="aiForm.api_key"
            type="password"
            show-password
            :placeholder="currentProvider?.needKey ? '必填' : '本机模型可留空'"
            style="width: 420px"
          />
        </el-form-item>
        <el-form-item label="模型">
          <el-select
            v-model="aiForm.model"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入模型名，例如 qwen2.5:7b"
            style="width: 420px"
          >
            <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="aiTestResult" label="测试回复">
          <span class="test-result">{{ aiTestResult }}</span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 运行时管理 -->
    <el-card style="margin-top: 16px">
      <template #header>
        <div class="card-head">
          <span>运行时管理</span>
          <el-button type="primary" size="small" :loading="scanning" @click="scan">
            <el-icon><Refresh /></el-icon>扫描系统
          </el-button>
        </div>
      </template>
      <el-table :data="runtimes" stripe>
        <el-table-column prop="kind" label="类型" width="120">
          <template #default="{ row }">{{ kindLabel[row.kind] || row.kind }}</template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="140" />
        <el-table-column prop="path" label="路径" />
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column label="默认" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}
.toolbar {
  margin-bottom: 16px;
}
.toolbar h2 {
  margin: 0;
  font-size: 18px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-head-actions {
  display: flex;
  gap: 8px;
}
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.test-result {
  font-size: 13px;
  color: var(--el-color-success);
}
.ai-card {
  margin-bottom: 4px;
}
</style>
