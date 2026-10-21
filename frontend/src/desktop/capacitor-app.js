// Desktop stand-in for @capacitor/app. A desktop window has no hardware back button and no
// foreground/background lifecycle beyond what visibilitychange already reports to the page.
export const App = {
  async addListener() { return { remove: async () => {} } },
  async removeAllListeners() {},
  async exitApp() { window.close() },
  async getInfo() { return { name: 'openGym', id: 'ch.opengym.desktop', version: __APP_VERSION__, build: '' } },
  async getState() { return { isActive: document.visibilityState !== 'hidden' } }
}
