// Windows desktop build (VITE_DESKTOP=1, always together with VITE_MOBILE=1): the same standalone,
// server-less app as the phone, inside a Tauri window instead of a Capacitor shell. The Capacitor
// packages are aliased to src/desktop/ shims backed by the Rust side (desktop/src-tauri), so most
// of the mobile code runs unchanged; DESKTOP marks the few places where the desktop does something
// else, and where online or sharing features are left out of this build entirely.
//
// Its own module rather than an export of mobile.js: the tests mock mobile.js wholesale.
export const DESKTOP = import.meta.env.VITE_MOBILE === '1' && import.meta.env.VITE_DESKTOP === '1'
