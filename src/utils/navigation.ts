import Taro from '@tarojs/taro'
import { clearGenerateDraft } from '@/services/generateSession'
import { GENERATE_PAGE_RESET_KEY } from '@/types'

const NAV_COOLDOWN_MS = 600

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
  safeRedirect('/pages/generate/index')
}

export function reLaunchGeneratePage(reset = true): void {
  if (reset) {
    Taro.setStorageSync(GENERATE_PAGE_RESET_KEY, '1')
    clearGenerateDraft()
  }
  safeReLaunch('/pages/generate/index')
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
  if (pages.length > 1) {
    if (!canNavigate()) return
    Taro.navigateBack()
      .catch(() => {
        if (fallbackUrl) safeRedirect(fallbackUrl)
      })
      .finally(finishNavigate)
    return
  }
  if (fallbackUrl) safeRedirect(fallbackUrl)
}
