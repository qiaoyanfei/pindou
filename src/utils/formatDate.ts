export function formatDateTime(value?: string | Date | { seconds?: number } | null): string {
  if (!value) return ''
  let date: Date
  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'object' && 'seconds' in value && value.seconds) {
    date = new Date(value.seconds * 1000)
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
