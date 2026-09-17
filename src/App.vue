<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceStore } from './stores/workspace'
import { emitHotkey } from './composables/hotkeys'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
workspaceStore.load()

const activeIndex = computed(() => route.path)

/* ---------- 深色模式 ---------- */
const THEME_KEY = 'project-hub.theme'
const isDark = ref(localStorage.getItem(THEME_KEY) === 'dark')

function applyTheme(dark: boolean): void {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
}

function toggleTheme(): void {
  applyTheme(!isDark.value)
}

applyTheme(isDark.value)

/* ---------- 全局快捷键 ---------- */
const helpVisible = ref(false)

const shortcuts = [
  { keys: '⌘/Ctrl + K', desc: '聚焦项目搜索' },
  { keys: '⌘/Ctrl + N', desc: '添加项目' },
  { keys: '⌘/Ctrl + 1', desc: '前往项目列表' },
  { keys: '⌘/Ctrl + ,', desc: '前往设置' },
  { keys: '?', desc: '显示快捷键帮助' },
  { keys: 'Esc', desc: '关闭弹窗 / 抽屉' }
]

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function onKeyDown(e: KeyboardEvent): void {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    emitHotkey('focus-search')
    return
  }
  if (mod && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    emitHotkey('new-project')
    return
  }
  if (mod && e.key === '1') {
    e.preventDefault()
    router.push('/projects')
    return
  }
  if (mod && e.key === ',') {
    e.preventDefault()
    router.push('/settings')
    return
  }
  if (e.key === '?' && !isEditableTarget(e)) {
    e.preventDefault()
    helpVisible.value = true
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <el-container class="app-shell">
    <el-header class="app-header">
      <div class="logo">
        <el-icon :size="22"><Cpu /></el-icon>
        <span>Project Hub</span>
      </div>
      <el-menu
        :default-active="activeIndex"
        mode="horizontal"
        :ellipsis="false"
        router
        class="top-menu"
      >
        <el-menu-item index="/projects">
          <el-icon><Folder /></el-icon>项目
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>设置
        </el-menu-item>
      </el-menu>
      <el-tooltip content="深色 / 浅色模式" placement="bottom">
        <el-button text @click="toggleTheme">
          <el-icon :size="18"><component :is="isDark ? 'Sunny' : 'Moon'" /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="快捷键帮助（?）" placement="bottom">
        <el-button text @click="helpVisible = true">
          <el-icon :size="18"><QuestionFilled /></el-icon>
        </el-button>
      </el-tooltip>
      <el-select
        v-if="workspaceStore.list.length"
        v-model="workspaceStore.currentId"
        placeholder="选择工作区"
        size="default"
        style="width: 160px"
        @change="workspaceStore.persist"
      >
        <el-option
          v-for="ws in workspaceStore.list"
          :key="ws.id"
          :label="ws.name"
          :value="ws.id"
        />
      </el-select>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>

    <el-dialog v-model="helpVisible" title="键盘快捷键" width="420">
      <div class="shortcut-list">
        <div v-for="s in shortcuts" :key="s.keys" class="shortcut-row">
          <span class="kbd">{{ s.keys }}</span>
          <span class="desc">{{ s.desc }}</span>
        </div>
      </div>
    </el-dialog>
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-color-primary);
  white-space: nowrap;
}
.top-menu {
  flex: 1;
  border-bottom: none;
}
.app-main {
  padding: 0;
  background: var(--el-fill-color-blank);
  overflow: hidden;
}
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.shortcut-row .kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 3px 8px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.shortcut-row .desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
