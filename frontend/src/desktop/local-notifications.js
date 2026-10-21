// Desktop stand-in for @capacitor/local-notifications. The workout-day reminder and the missed-
// workout nudge are shown as Windows notifications through the page's Notification API, timed
// in the page itself — so they only fire while openGym is open (it can sit in the background).
// Only the next 24 hours are armed; the app re-syncs the schedule on every change and on focus.
const DAY_MS = 24 * 3600 * 1000
const timers = new Map()

const display = () => {
  if (typeof Notification === 'undefined') return 'denied'
  return Notification.permission === 'default' ? 'prompt' : Notification.permission
}

export const LocalNotifications = {
  async checkPermissions() { return { display: display() } },
  async requestPermissions() {
    if (typeof Notification === 'undefined') return { display: 'denied' }
    try { await Notification.requestPermission() } catch { /* answered below */ }
    return { display: display() }
  },
  async schedule({ notifications = [] }) {
    const now = Date.now()
    for (const n of notifications) {
      const at = n.schedule?.at ? new Date(n.schedule.at).getTime() : now
      if (at - now > DAY_MS) continue
      clearTimeout(timers.get(n.id))
      timers.set(n.id, setTimeout(() => {
        timers.delete(n.id)
        try { new Notification(n.title || 'openGym', { body: n.body || '' }) } catch { /* no notifications here */ }
      }, Math.max(0, at - now)))
    }
    return { notifications: notifications.map(n => ({ id: n.id })) }
  },
  async cancel({ notifications = [] }) {
    for (const { id } of notifications) { clearTimeout(timers.get(id)); timers.delete(id) }
  },
  async getPending() { return { notifications: [...timers.keys()].map(id => ({ id })) } },
  async addListener() { return { remove: async () => {} } },
  async removeAllListeners() {},
  async createChannel() {},
  async checkExactNotificationSetting() { return { exact_alarm: 'granted' } }
}
