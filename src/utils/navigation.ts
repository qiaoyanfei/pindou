import Taro from '@tarojs/taro'
import { clearGenerateDraft } from '@/services/generateSession'
import { GENERATE_PAGE_RESET_KEY } from '@/types'
import { isTabPage } from '@/utils/tabBar'

const NAV_COOLDOWN_MS = 600

const TAB_PAGE_SET = new Set([
  '/pages/home/index',
  '/pages/generate/index',
  '/pages/mine/index',
])

let navigating = false
let lastNavAt = 0

function normalizePath(url: string): string {
  const path = url.split('?')[0]
  return path.startsWith('/') ? path : `/${path}`
}

export function getCurrentPagePath(): string {
  const pages = Taro.getCurrentPages()
  const current = pages[pages.length - 1]
  if (!current?.route) return ''
  const route = current.route
  return route.startsWith('/') ? route : `/${route}`
}

export function isOnPage(url: string): boolean {
  return getCurrentPagePath() === normalizePath(url)
}

export function isOnLoginPage(): boolean {
  return getCurrentPagePath() === '/pages/login/index'
}

function canNavigate(): boolean {
  const now = Date.now()
  if (navigating && now - lastNavAt < NAV_COOLDOWN_MS) return false
  navigating = true
  lastNavAt = now
  return true
}

function finishNavigate(): void {
  setTimeout(() => {
    navigating = false
  }, NAV_COOLDOWN_MS)
}

function navigateToFallback(fallbackUrl?: string, isActiveNavigation = false): void {
  if (!fallbackUrl) {
    if (isActiveNavigation) finishNavigate()
    return
  }

  const targetPath = normalizePath(fallbackUrl.split('?')[0])
  const targetUrl = normalizePath(fallbackUrl)
  if (isOnPage(targetUrl) || isOnPage(targetPath)) {
    if (isActiveNavigation) finishNavigate()
    return
  }

  if (!isActiveNavigation && !canNavigate()) return

  if (TAB_PAGE_SET.has(targetPath)) {
    Taro.switchTab({ url: targetPath })
      .catch(() => Taro.reLaunch({ url: targetPath }))
      .finally(finishNavigate)
    return
  }

  Taro.redirectTo({ url: fallbackUrl })
    .catch(() => Taro.reLaunch({ url: fallbackUrl }))
    .finally(finishNavigate)
}

export function safeSwitchTab(url: string): void {
  const target = normalizePath(url.split('?')[0])
  if (!TAB_PAGE_SET.has(target)) {
    safeRedirect(url)
    return
  }
  if (isOnPage(target)) return
  if (!canNavigate()) return

  Taro.switchTab({ url: target })
    .catch(() => Taro.reLaunch({ url: target }))
    .finally(finishNavigate)
}

export function navigateAfterAuth(url: string): void {
  const path = url.split('?')[0]
  if (isTabPage(path)) {
    safeSwitchTab(path)
    return
  }
  safeRedirect(url)
}

export function safeRedirect(url: string): void {
  const target = normalizePath(url)
  if (isOnPage(target)) return
  if (!canNavigate()) return

  Taro.redirectTo({ url })
    .catch(() => Taro.reLaunch({ url }))
    .finally(finishNavigate)
}

export function redirectToGeneratePage(reset = true): void {
  if (reset) {
    Taro.setStorageSync(GENERATE_PAGE_RESET_KEY, '1')
    clearGenerateDraft()
  }
  safeSwitchTab('/pages/generate/index')
}

export function reLaunchGeneratePage(reset = true): void {
  if (reset) {
    Taro.setStorageSync(GENERATE_PAGE_RESET_KEY, '1')
    clearGenerateDraft()
  }
  safeSwitchTab('/pages/generate/index')
}

export function safeReLaunch(url: string): void {
  const target = normalizePath(url)
  if (isOnPage(target)) return
  if (!canNavigate()) return

  Taro.reLaunch({ url })
    .catch(() => Taro.redirectTo({ url }))
    .finally(finishNavigate)
}

export function safeNavigateTo(url: string): void {
  if (!canNavigate()) return

  Taro.navigateTo({ url }).finally(finishNavigate)
}

export function safeNavigateBack(fallbackUrl?: string): void {
  const pages = Taro.getCurrentPages()
  const currentPath = getCurrentPagePath()
  if (pages.length <= 1 || TAB_PAGE_SET.has(currentPath)) {
    navigateToFallback(fallbackUrl)
    return
  }

  if (!canNavigate()) return
  Taro.navigateBack()
    .then(finishNavigate)
    .catch(() => navigateToFallback(fallbackUrl, true))
}
