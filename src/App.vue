<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceStore } from './stores/workspace'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
workspaceStore.load()

const activePath = computed(() => {
  if (route.path.startsWith('/projects')) return '/projects'
  if (route.path.startsWith('/settings')) return '/settings'
  return route.path
})

function navigateTo(path: string) {
  router.push(path)
}

function handleAddProject() {
  if (route.path === '/projects') {
    // If already on projects page, trigger by setting query
    router.replace({ path: '/projects', query: { action: 'add', t: Date.now() } })
  } else {
    router.push({ path: '/projects', query: { action: 'add' } })
  }
}
</script>

<template>
  <div class="app-shell">
    <!-- Top Window Titlebar -->
    <header class="window-titlebar">
      <div class="traffic-lights">
        <span class="dot close"></span>
        <span class="dot minimize"></span>
        <span class="dot maximize"></span>
      </div>
      <div class="titlebar-center">
        <el-icon class="titlebar-icon"><Cpu /></el-icon>
        <span class="titlebar-text">ProjectHub — 项目管理系统</span>
      </div>
      <div class="titlebar-right">
        <div v-if="workspaceStore.list.length" class="workspace-select-wrapper">
          <span class="ws-label">当前工作区:</span>
          <el-select
            v-model="workspaceStore.currentId"
            placeholder="选择工作区"
            size="small"
            class="dark-select"
            @change="workspaceStore.persist"
          >
            <el-option
              v-for="ws in workspaceStore.list"
              :key="ws.id"
              :label="ws.name"
              :value="ws.id"
            />
          </el-select>
        </div>
      </div>
    </header>

    <!-- App Body: Sidebar + Main Content -->
    <div class="app-body">
      <!-- Left Sidebar -->
      <aside class="app-sidebar">
        <nav class="sidebar-nav">
          <button
            type="button"
            class="nav-item"
            :class="{ active: activePath === '/projects' && !route.query.action }"
            @click="navigateTo('/projects')"
          >
            <el-icon class="nav-icon"><FolderOpened /></el-icon>
            <span>项目总览</span>
          </button>

          <button
            type="button"
            class="nav-item"
            :class="{ active: route.query.action === 'add' }"
            @click="handleAddProject"
          >
            <el-icon class="nav-icon"><Plus /></el-icon>
            <span>添加项目</span>
          </button>

          <button
            type="button"
            class="nav-item"
            :class="{ active: activePath === '/settings' }"
            @click="navigateTo('/settings')"
          >
            <el-icon class="nav-icon"><Setting /></el-icon>
            <span>全局设置</span>
          </button>
        </nav>

        <div class="sidebar-spacer"></div>

        <!-- Local Environment Badge -->
        <div class="sidebar-footer">
          <div class="env-card">
            <div class="env-label">本机环境</div>
            <div class="env-value">Git · Node v22 · Native</div>
          </div>
        </div>
      </aside>

      <!-- Main Content Stage -->
      <main class="app-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--canvas);
}

/* Window Titlebar */
.window-titlebar {
  height: 44px;
  background-color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  user-select: none;
}

.traffic-lights {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 80px;
}

.traffic-lights .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.traffic-lights .dot.close {
  background-color: #ff5f57;
}

.traffic-lights .dot.minimize {
  background-color: #febc2e;
}

.traffic-lights .dot.maximize {
  background-color: #28c840;
}

.titlebar-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
}

.titlebar-icon {
  font-size: 14px;
  color: var(--primary-light);
}

.titlebar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-label {
  font-size: 12px;
  color: #64748b;
}

.dark-select {
  width: 140px;
}

.dark-select :deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset !important;
}

.dark-select :deep(.el-input__inner) {
  color: #f1f5f9 !important;
  font-size: 12px;
}

/* App Body */
.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Sidebar */
.app-sidebar {
  width: 220px;
  background-color: var(--ink);
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  font-size: 14px;
  color: #94a3b8;
  background: transparent;
  border: none;
  width: 100%;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  outline: none;
}

.nav-item:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.05);
}

.nav-item.active {
  background-color: rgba(37, 99, 235, 0.18);
  color: #ffffff;
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--primary);
}

.nav-icon {
  font-size: 16px;
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-footer {
  padding: 0 16px;
}

.env-card {
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.env-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.env-value {
  font-size: 12px;
  color: #e2e8f0;
  font-weight: 500;
}

/* Main Content Area */
.app-main {
  flex: 1;
  background-color: var(--canvas);
  overflow: hidden;
  position: relative;
}
</style>
