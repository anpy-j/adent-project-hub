<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, DocumentCopy } from '@element-plus/icons-vue'
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
  ElMessage.info('日志已清空')
}

function copyLogs() {
  const text = logs.value.map((l) => l.text).join('')
  navigator.clipboard.writeText(text)
  ElMessage.success('日志已复制到剪贴板')
}

defineExpose({ attach, show, append })
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="projectName ? `实时运行日志 · ${projectName}` : '实时运行日志'"
    direction="btt"
    size="42%"
    class="log-drawer"
  >
    <div class="log-wrapper">
      <div class="log-toolbar">
        <div class="log-info">
          <span class="pulse-dot status-dot"></span>
          <span class="log-status-text">实时监听中</span>
          <span class="log-count mono">({{ logs.length }} 条记录)</span>
        </div>
        <div class="log-actions">
          <el-button size="small" :icon="DocumentCopy" @click="copyLogs">复制</el-button>
          <el-button size="small" :icon="Delete" @click="clearLogs">清空</el-button>
        </div>
      </div>
      <div ref="logBodyRef" class="log-body mono">
        <div
          v-for="(line, i) in logs"
          :key="i"
          :class="['log-line', line.stream]"
        >{{ line.text }}</div>
        <div v-if="!logs.length" class="empty">控制台就绪，等待进程输出…</div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.log-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.log-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--ok);
  display: inline-block;
}

.log-status-text {
  font-weight: 600;
  color: #10b981;
}

.log-count {
  color: #94a3b8;
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-body {
  background: #0f172a;
  color: #86efac;
  font-size: 12px;
  line-height: 1.6;
  padding: 14px;
  border-radius: 8px;
  flex: 1;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
}

.log-line.stderr {
  color: #ef4444;
}

.empty {
  color: #475569;
  text-align: center;
  margin-top: 50px;
  font-style: italic;
}
</style>
