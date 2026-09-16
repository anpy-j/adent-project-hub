<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { Project, LogChunk } from '../types'

const visible = ref(false)
const logs = ref<{ stream: 'stdout' | 'stderr'; text: string; ts: number }[]>([])
const projectId = ref<string>('')
const projectName = ref<string>('')
const logBodyRef = ref<HTMLElement | null>(null)

function attach(_taskId: string, project: Project) {
  projectId.value = project.id
  projectName.value = project.name
  logs.value = []
  visible.value = true
  nextTick(scrollToBottom)
}

function show() {
  visible.value = true
}

function append(chunk: LogChunk) {
  if (!visible.value) return
  logs.value.push({ stream: chunk.stream, text: chunk.data, ts: chunk.timestamp })
  if (logs.value.length > 5000) logs.value.splice(0, 1000)
  nextTick(scrollToBottom)
}

function scrollToBottom() {
  if (logBodyRef.value) logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight
}

function clearLogs() {
  logs.value = []
}

defineExpose({ attach, show, append })
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="projectName ? `日志 - ${projectName}` : '日志'"
    direction="btt"
    size="40%"
  >
    <div class="log-toolbar">
      <el-button size="small" @click="clearLogs">清空</el-button>
    </div>
    <div ref="logBodyRef" class="log-body">
      <div
        v-for="(line, i) in logs"
        :key="i"
        :class="['log-line', line.stream]"
      >{{ line.text }}</div>
      <div v-if="!logs.length" class="empty">暂无日志输出</div>
    </div>
  </el-drawer>
</template>

<style scoped>
.log-toolbar {
  margin-bottom: 8px;
}
.log-body {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 12px;
  border-radius: 6px;
  height: calc(100% - 50px);
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-line.stderr {
  color: #f56c6c;
}
.empty {
  color: #666;
  text-align: center;
  margin-top: 40px;
}
</style>
