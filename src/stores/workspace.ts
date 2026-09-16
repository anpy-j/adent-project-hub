import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Workspace } from '../types'

const STORAGE_KEY = 'project-hub.workspace.current'

export const useWorkspaceStore = defineStore('workspace', () => {
  const list = ref<Workspace[]>([])
  const currentId = ref<string>('')

  async function load() {
    list.value = await window.api.workspace.list()
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && list.value.some((w) => w.id === saved)) {
      currentId.value = saved
    } else {
      currentId.value = list.value[0]?.id ?? ''
    }
  }

  function persist(id: string) {
    currentId.value = id
    localStorage.setItem(STORAGE_KEY, id)
  }

  return { list, currentId, load, persist }
})
