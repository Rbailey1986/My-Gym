// Desktop stand-in for @capacitor/filesystem (aliased in vite.config.js when VITE_DESKTOP=1).
// Same call shapes as the plugin; the files are real files on disk, written by the Rust side:
//
//   Data, Library  %APPDATA%\com.robertbuilt.opengym\        the state mirror, coach and device files
//   Cache          %LOCALAPPDATA%\com.robertbuilt.opengym\   export staging
//   Documents      Documents\                        auto-backups land in Documents\openGym\
//
// As with the plugin, no `encoding` means the data is base64.
import { invoke } from './tauri.js'

export const Directory = Object.freeze({
  Data: 'DATA', Library: 'DATA', Cache: 'CACHE', Documents: 'DOCUMENTS',
  External: 'DATA', ExternalStorage: 'DOCUMENTS', ExternalCache: 'CACHE', LibraryNoCloud: 'DATA', Temporary: 'CACHE'
})
export const Encoding = Object.freeze({ UTF8: 'utf8', ASCII: 'ascii', UTF16: 'utf16' })

const where = o => ({ dir: o.directory || 'DATA', path: String(o.path || '') })

export const Filesystem = {
  async readFile(o) {
    return { data: await invoke('fs_read', { ...where(o), utf8: !!o.encoding }) }
  },
  async writeFile(o) {
    return { uri: await invoke('fs_write', { ...where(o), data: String(o.data ?? ''), utf8: !!o.encoding, append: false }) }
  },
  async appendFile(o) {
    await invoke('fs_write', { ...where(o), data: String(o.data ?? ''), utf8: !!o.encoding, append: true })
  },
  async deleteFile(o) {
    await invoke('fs_delete', where(o))
  },
  async mkdir(o) {
    await invoke('fs_mkdir', where(o))
  },
  async readdir(o) {
    return { files: await invoke('fs_readdir', where(o)) }
  },
  async getUri(o) {
    return { uri: await invoke('fs_uri', where(o)) }
  },
  async stat(o) {
    return invoke('fs_stat', where(o))
  },
  async rename(o) {
    await invoke('fs_rename', {
      dir: o.directory || 'DATA', from: String(o.from || ''),
      toDir: o.toDirectory || o.directory || 'DATA', to: String(o.to || '')
    })
  }
}
