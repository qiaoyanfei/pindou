import type { BeanTransaction } from '@/types/community'

export interface BeanLogIconStyle {
  background: string
  glyph: string
}

export function getBeanLogIconStyle(title: string, type: BeanTransaction['type']): BeanLogIconStyle {
  if (title.includes('发布')) {
    return { background: '#dcfce7', glyph: '↑' }
  }
  if (title.includes('下载')) {
    return { background: '#dbeafe', glyph: '↓' }
  }
  if (title.includes('注册')) {
    return { background: '#fce7f3', glyph: '🎁' }
  }
  if (title.includes('分享')) {
    return { background: '#dcfce7', glyph: '↗' }
  }
  if (title.includes('邀请')) {
    return { background: '#fce7f3', glyph: '★' }
  }
  if (type === 'income') {
    return { background: '#ede9fe', glyph: '+' }
  }
  return { background: '#ffedd5', glyph: '−' }
}
