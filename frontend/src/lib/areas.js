// The app's five areas and which routes belong to each. The tab bar lights the area's tab, and
// #app carries data-area so a screen takes its area's colour (index.css, "area colours"): Today
// and Train keep the account's accent, Food is orange, Progress is blue. Settings opens from
// Today's header, so it is Today's.
const AREA = {
  home: 'home', settings: 'home', checkin: 'home', admin: 'home',
  plan: 'train', library: 'train', muscles: 'train', coach: 'train', workout: 'train',
  food: 'food',
  stats: 'progress', history: 'progress', 'structural-balance': 'progress', measurements: 'progress', 'progress-photos': 'progress',
}

export const areaOf = pathname => AREA[String(pathname || '').split('/')[1] || 'home'] || 'home'

// The colour a tab lights in. Today and Train follow the account's accent.
export const AREA_TINT = { home: null, train: null, food: 'var(--orange)', progress: 'var(--blue)' }
