// DeepSeek peak / off-peak rule — JS twin of deepseek_peak.py. Rules live in
// peak-hours.md, data in <repo>/deepseek_calendar.json (shared with Python).
// Peak (2x price): Mon-Fri 09:00-12:00 and 14:00-18:00 Beijing time.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAL_PATH = path.resolve(__dirname, '../../../deepseek_calendar.json')
const DEFAULT = {
  timezone: 'Asia/Shanghai',
  peak_windows: [['09:00', '12:00'], ['14:00', '18:00']],
  peak_weekdays: [0, 1, 2, 3, 4],
  holidays_off_peak: {},
  makeup_workdays_off_peak: {},
}

function calendar() {
  try {
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(CAL_PATH, 'utf8')) }
  } catch {
    return DEFAULT
  }
}

export function isDeepSeekPeak(now = new Date()) {
  const cal = calendar()
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: cal.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map(p => [p.type, p.value])
  )
  const day = `${parts.year}-${parts.month}-${parts.day}`
  if (cal.holidays_off_peak[day] || cal.makeup_workdays_off_peak[day]) return false
  // Monday = 0, same convention as Python's weekday()
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday)
  if (!cal.peak_weekdays.includes(weekday)) return false
  const hm = `${parts.hour}:${parts.minute}`
  return cal.peak_windows.some(([a, b]) => hm >= a && hm < b)
}

export function deepSeekPeakPolicy() {
  const p = (process.env.DEEPSEEK_PEAK_POLICY || 'last_resort').trim().toLowerCase()
  return ['last_resort', 'block', 'allow'].includes(p) ? p : 'last_resort'
}

// 'primary' off-peak, else the policy: 'last_resort' | 'block' | 'primary' (allow)
export function deepSeekMode(now = new Date()) {
  if (!isDeepSeekPeak(now)) return 'primary'
  const p = deepSeekPeakPolicy()
  return p === 'allow' ? 'primary' : p
}
