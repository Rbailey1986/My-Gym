// The bridge to the Rust side of the Windows desktop build (desktop/src-tauri/src/lib.rs).
// tauri.conf.json sets withGlobalTauri, so the invoke function is on window and no npm
// package is needed. Only ever called from DESKTOP code paths and the src/desktop/ shims.
export const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args)

// fetch() for the Coach's provider calls, made from Rust. The page's origin is
// http://tauri.localhost, which Ollama's CORS rules do not know; from Rust there is no CORS.
// The Rust command only accepts loopback addresses (localhost, 127.x, ::1), so this cannot
// reach the internet. Same subset as lib/capacitor-fetch.js: method, headers, a string body,
// an abort signal, and a response with ok/status/text()/json().
export async function desktopFetch(url, init = {}) {
  const request = invoke('local_http', {
    url: String(url),
    method: init.method || 'GET',
    headers: { ...(init.headers || {}) },
    body: typeof init.body === 'string' ? init.body : init.body == null ? null : JSON.stringify(init.body)
  })
  const res = init.signal ? await Promise.race([request, abortOf(init.signal)]) : await request
  const text = res.body || ''
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: async () => text,
    json: async () => JSON.parse(text)
  }
}

function abortOf(signal) {
  return new Promise((_, reject) => {
    const err = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    if (signal.aborted) return err()
    signal.addEventListener('abort', err, { once: true })
  })
}
