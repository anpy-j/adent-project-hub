import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ServiceItem, ServiceStatusInfo } from '../types'

export type ServiceRow = ServiceItem & { status: ServiceStatusInfo }

export const useServiceStore = defineStore('service', () => {
  const services = ref<ServiceRow[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      services.value = await window.api.service.probeAll()
    } finally {
      loading.value = false
    }
  }

  function applyStatus(info: ServiceStatusInfo) {
    const row = services.value.find((s) => s.id === info.serviceId)
    if (row) {
      row.status = info
      row.last_status = info.status
    }
  }

  return { services, loading, load, applyStatus }
})
