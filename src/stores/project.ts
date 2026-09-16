import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '../types'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const loading = ref(false)

  async function load(workspaceId?: string) {
    loading.value = true
    try {
      projects.value = await window.api.project.list(workspaceId)
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    const wsId = projects.value[0]?.workspace_id
    await load(wsId)
  }

  return { projects, loading, load, refresh }
})
