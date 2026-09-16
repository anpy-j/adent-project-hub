<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceStore } from './stores/workspace'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
workspaceStore.load()

const activeIndex = computed(() => route.path)
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
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 16px;
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
