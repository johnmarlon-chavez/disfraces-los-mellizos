import type { ApiDisfraces } from '../../shared/ipc'

declare global {
  interface Window {
    api: ApiDisfraces
  }
}
