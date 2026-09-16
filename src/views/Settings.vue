<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
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

onMounted(load)
</script>

<template>
  <div class="settings-view">
    <div class="toolbar">
      <h2>设置</h2>
    </div>
    <el-card>
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
</style>
