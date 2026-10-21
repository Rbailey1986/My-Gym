// Desktop stand-in for @capacitor/core. The platform reads as 'web', so every Android- or
// iOS-only path (updater, Health Connect, rest alarm, backup folder picker) stays off. The one
// native plugin the desktop does provide is Print; any other registerPlugin() name gets an
// object without methods, and the callers already treat a failing plugin call as "not here".
const Print = {
  // The same self-contained HTML the phone hands to its print flow, printed from a hidden
  // iframe: WebView2's print dialog offers "Save as PDF" as well as real printers.
  async printHtml({ html }) {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' })
    document.body.appendChild(frame)
    await new Promise(resolve => { frame.onload = resolve; frame.srcdoc = html })
    try { frame.contentWindow.focus(); frame.contentWindow.print() } finally { setTimeout(() => frame.remove(), 1000) }
  }
}

const plugins = { Print }

export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: name => name in plugins,
  convertFileSrc: s => s
}

export function registerPlugin(name) {
  return plugins[name] || {}
}

export const CapacitorHttp = {
  async request() { throw new Error('not available on the desktop') }
}
