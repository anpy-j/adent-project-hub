/// <reference types="electron-vite/node" />
/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly VITE_DEV_SERVER_URL?: string
    readonly VITE_PUBLIC?: string
  }
}

interface Window {
  api: import('./api/ipc').ProjectHubAPI
}
