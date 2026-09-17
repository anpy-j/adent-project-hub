import { onBeforeUnmount } from 'vue'

const EVENT_NAME = 'hub:hotkey'

export function emitHotkey(name: string): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: name }))
}

export function onHotkey(name: string, cb: () => void): void {
  const handler = (e: Event): void => {
    if ((e as CustomEvent).detail === name) cb()
  }
  window.addEventListener(EVENT_NAME, handler)
  onBeforeUnmount(() => window.removeEventListener(EVENT_NAME, handler))
}
