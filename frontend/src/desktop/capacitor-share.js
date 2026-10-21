// Desktop stand-in for @capacitor/share. On the phone a backup export goes out through the OS
// share sheet; on the desktop there is nobody to share with, so the staged file is copied into
// Downloads and shown selected in Explorer.
import { invoke } from './tauri.js'

export const Share = {
  async share({ url }) {
    if (!url) throw new Error('nothing to save')
    await invoke('save_to_downloads', { path: url })
    return {}
  },
  async canShare() { return { value: true } }
}
