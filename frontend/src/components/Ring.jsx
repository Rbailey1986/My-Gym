// A progress ring in the style of an activity ring: a dim full track with the filled share drawn
// over it from twelve o'clock, clockwise. `value` is 0…1 (clamped); null draws the track alone,
// for a measure that has nothing to show yet.
export default function Ring({ value, color = 'var(--acc)', size = 76, stroke = 9, children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value == null ? null : Math.min(1, Math.max(0, value))
  return <div className="ring" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${color} 18%, transparent)`} strokeWidth={stroke} />
      {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
    {children && <div className="ring-in">{children}</div>}
  </div>
}
