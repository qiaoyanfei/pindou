import Taro from '@tarojs/taro'

export const TAB_URLS = [
  '/pages/home/index',
  '/pages/generate/index',
  '/pages/mine/index',
] as const

export const TAB_INDEX = {
  home: 0,
  generate: 1,
  mine: 2,
} as const

export type TabKey = keyof typeof TAB_INDEX

export function isTabPage(url: string): boolean {
  const path = url.split('?')[0]
  const normalized = path.startsWith('/') ? path : `/${path}`
  return TAB_URLS.includes(normalized as (typeof TAB_URLS)[number])
}

export function updateTabBarSelected(index: number): void {
  const page = Taro.getCurrentInstance().page
  if (!page) return
  const tabBar = Taro.getTabBar<{ setSelected: (selected: number) => void }>(page)
  tabBar?.setSelected(index)
}
