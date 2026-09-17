<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import type { Runtime } from '../types'

const runtimes = ref<Runtime[]>([])
const scanning = ref(false)

async function load() {
  runtimes.value = await window.api.runtime.list()
}

async function scan() {
  scanning.value = true
  try {
    const scanned = await window.api.runtime.scan()
    ElMessage.success(`扫描完成，检测到 ${scanned.length} 个运行时环境`)
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

const kindColor: Record<string, string> = {
  jdk: '#e76f00',
  node: '#16a34a',
  python: '#3776ab',
  flutter: '#02569b'
}

onMounted(load)
</script>

<template>
  <div class="settings-view">
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">全局设置</h1>
        <p class="head-sub">管理本地语言运行时 (Node.js, JDK, Python, Flutter) 与系统环境配置</p>
      </div>
    </div>

    <div class="settings-content">
      <div class="content-card">
        <div class="card-head-row">
          <div class="card-title-group">
            <span class="card-main-title">运行时环境管理</span>
            <span class="card-sub-tip">自动探测本地机器已安装的环境版本</span>
          </div>
          <el-button type="primary" size="small" :loading="scanning" @click="scan">
            <el-icon><Refresh /></el-icon>扫描系统环境
          </el-button>
        </div>

        <div class="table-container">
          <el-table
            :data="runtimes"
            style="width: 100%"
            :header-cell-style="{
              background: '#F8FAFC',
              color: '#64748B',
              fontWeight: 600,
              borderBottom: '1px solid #E2E8F0',
              padding: '12px 16px'
            }"
            :cell-style="{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }"
            empty-text="尚未检测到已安装运行时，点击「扫描系统环境」进行探测"
          >
            <el-table-column prop="kind" label="环境类型" width="140">
              <template #default="{ row }">
                <span
                  class="kind-pill"
                  :style="{ backgroundColor: kindColor[row.kind] || '#64748b' }"
                >
                  {{ kindLabel[row.kind] || row.kind }}
                </span>
              </template>
            </el-table-column>

            <el-table-column prop="version" label="版本" width="160">
              <template #default="{ row }">
                <span class="version-tag mono">{{ row.version }}</span>
              </template>
            </el-table-column>

            <el-table-column prop="path" label="安装路径">
              <template #default="{ row }">
                <span class="mono path-text" :title="row.path">{{ row.path }}</span>
              </template>
            </el-table-column>

            <el-table-column prop="source" label="安装来源" width="120">
              <template #default="{ row }">
                <span class="source-tag">{{ row.source || '系统环境变量' }}</span>
              </template>
            </el-table-column>

            <el-table-column label="默认" width="90" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.is_default" type="success" size="small" effect="light">
                  默认
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background-color: var(--canvas);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
}

.head-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.content-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
}

.card-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-main-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}

.card-sub-tip {
  font-size: 12px;
  color: var(--muted);
}

.table-container {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.kind-pill {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
}

.version-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.path-text {
  font-size: 12px;
  color: var(--muted);
}

.source-tag {
  font-size: 12px;
  color: #64748b;
}
</style>
