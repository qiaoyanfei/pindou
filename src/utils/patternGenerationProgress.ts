export class PatternGenerationCancelled extends Error {
  constructor() {
    super('PATTERN_GENERATION_CANCELLED')
    this.name = 'PatternGenerationCancelled'
  }
}

export interface PatternAbortSignal {
  readonly aborted: boolean
}

export interface PatternAbortController {
  readonly signal: PatternAbortSignal
  abort(): void
}

export function createPatternAbortController(): PatternAbortController {
  if (typeof AbortController !== 'undefined') {
    return new AbortController()
  }

  let aborted = false
  const signal: PatternAbortSignal = {
    get aborted() {
      return aborted
    },
  }

  return {
    signal,
    abort() {
      aborted = true
    },
  }
}

export function isPatternGenerationCancelled(error: unknown): boolean {
  if (error instanceof PatternGenerationCancelled) return true
  return error instanceof Error && error.message === 'PATTERN_GENERATION_CANCELLED'
}

export function throwIfAborted(signal?: PatternAbortSignal): void {
  if (signal?.aborted) {
    throw new PatternGenerationCancelled()
  }
}

export function yieldToMain(delayMs = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

const MIN_STAGE_MS = 400
const MIN_LOADING_MS = 500

/** 生成超过该时长后，底部按钮可点击取消 */
export const PATTERN_GENERATION_CANCEL_UNLOCK_MS = 20_000

export const PATTERN_GENERATION_CANCEL_BUTTON_LABEL = '处理中，请保持前台'

export const PATTERN_GENERATION_OVERLAY_HINT = '正在处理中，请保持小程序在前台'

export const PATTERN_GENERATION_OVERLAY_PATIENCE_HINT = '格子越多耗时越长，请耐心等待并保持在前台'

export const PATTERN_GENERATION_OVERLAY_CANCEL_LABEL = '取消生成'

export interface PatternProgressContext {
  percent?: number
}

interface StageProgressRange {
  start: number
  end: number
  label: string
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function clampPercentFine(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function normalizeReportPercent(value: number | null): number | null {
  if (value === null) return null
  return clampPercentFine(value)
}

function percentDisplayChanged(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a !== b
  return normalizeReportPercent(a) !== normalizeReportPercent(b)
}

function resolveStageProgressRange(stageMessage: string): StageProgressRange {
  if (stageMessage.includes('读取') || stageMessage.includes('分析')) {
    return { start: 5, end: 18, label: '读取分析图进度' }
  }
  if (stageMessage.includes('采样')) {
    return { start: 18, end: 58, label: '采样进度' }
  }
  if (stageMessage.includes('匹配')) {
    return { start: 58, end: 88, label: '匹配色号进度' }
  }
  if (stageMessage.includes('优化') || stageMessage.includes('生成')) {
    return { start: 88, end: 100, label: '生成图纸进度' }
  }
  return { start: 0, end: 100, label: '处理进度' }
}

/** 20s 后按钮用的紧凑阶段名：去掉「进度」，保留完整阶段描述 */
function resolveStageCompactName(stageMessage: string): string {
  if (stageMessage.includes('采样')) return '采样'
  if (stageMessage.includes('匹配')) return '匹配色号'
  if (stageMessage.includes('读取')) return '读取图片'
  if (stageMessage.includes('分析')) return '分析图片'
  if (stageMessage.includes('优化')) return '优化边缘'
  if (stageMessage.includes('生成')) return '生成图纸'
  return resolveStageProgressRange(stageMessage).label.replace(/进度$/, '')
}

export function computeStageProgressPercent(stageMessage: string, subRatio = 0): number {
  const range = resolveStageProgressRange(stageMessage)
  const ratio = Math.max(0, Math.min(1, subRatio))
  return clampPercentFine(range.start + (range.end - range.start) * ratio)
}

export function overallPercentToStageLocal(stageMessage: string, overallPercent: number): number {
  const range = resolveStageProgressRange(stageMessage)
  const clamped = clampPercentFine(overallPercent)
  if (range.end <= range.start) return clamped
  if (clamped <= range.start) return 0
  if (clamped >= range.end) return 100
  return clampPercentFine(((clamped - range.start) / (range.end - range.start)) * 100)
}

function formatPercentLabel(value: number): string {
  const fine = clampPercentFine(value)
  return Number.isInteger(fine) ? `${fine}` : fine.toFixed(1)
}

function resolveNativeLoadingStageLabel(stageMessage: string): string {
  if (stageMessage.includes('采样')) return '采样颜色'
  if (stageMessage.includes('匹配')) return '匹配色号'
  if (stageMessage.includes('读取')) return '读取图片'
  if (stageMessage.includes('分析')) return '分析图片'
  if (stageMessage.includes('优化')) return '优化边缘'
  if (stageMessage.includes('生成')) return '生成图纸'
  const normalized = normalizeProgressMessage(stageMessage)
  return normalized || '处理中'
}

export function formatGenerationOverlayStage(stageMessage: string): string {
  return resolveNativeLoadingStageLabel(stageMessage)
}

export function formatGenerationOverlayLocalPercent(
  stageMessage: string,
  overallPercent: number,
): string {
  const localPercent = overallPercentToStageLocal(stageMessage, overallPercent)
  return `${formatPercentLabel(localPercent)}%`
}

export function formatGenerationOverlayOverallPercent(overallPercent: number): string {
  return `${formatPercentLabel(overallPercent)}%`
}

export function getGenerationOverlayProgress(stageMessage: string, overallPercent: number) {
  return {
    stagePercent: overallPercentToStageLocal(stageMessage, overallPercent),
    overallPercent: clampPercentFine(overallPercent),
  }
}

export function formatStageLocalProgress(stageMessage: string, overallPercent: number): string {
  const stageText = stageMessage.trim()
  if (!stageText) return `${formatPercentLabel(overallPercent)}%`
  const localPercent = overallPercentToStageLocal(stageMessage, overallPercent)
  return `${stageText} ${formatPercentLabel(localPercent)}%`
}

export function formatCompactButtonProgress(stageMessage: string, overallPercent: number): string {
  const localPercent = overallPercentToStageLocal(stageMessage, overallPercent)
  return `${resolveStageCompactName(stageMessage)}${formatPercentLabel(localPercent)}%`
}

export function normalizeProgressMessage(message: string): string {
  return message.replace(/\.{3}|…/g, '').trim()
}

export interface ActionButtonLabel {
  main: string
  sub?: string
}

export function formatGenerateSubmitLabel(
  idleMain: string,
  loading = false,
  cancelled = false,
  canCancel = false,
): ActionButtonLabel {
  if (cancelled) {
    return { main: '已取消' }
  }
  if (!loading) {
    return { main: idleMain }
  }
  if (canCancel) {
    return { main: PATTERN_GENERATION_CANCEL_BUTTON_LABEL }
  }
  return { main: idleMain }
}

export interface PatternGenerationProgressReporter {
  report: (message: string, context?: PatternProgressContext) => Promise<void>
  finish: (options?: { skipDelay?: boolean }) => Promise<void>
}

/** 按钮上展示的固定进度文案（不含时间预估） */
export function mapStageToButtonMessage(stage: string): string {
  if (stage.includes('读取') || stage.includes('分析')) {
    return '读取并分析图片…'
  }
  if (stage.includes('采样') || stage.includes('匹配')) {
    return '采样并匹配色号…'
  }
  if (stage.includes('优化') || stage.includes('生成')) {
    return '生成图纸…'
  }
  return '处理中，请稍候…'
}

export function formatActionButtonLabel(
  idleMain: string,
  loading: boolean,
  stageMessage: string,
  cancelled = false,
  canCancel = false,
  percent: number | null = null,
): ActionButtonLabel {
  if (cancelled) {
    return { main: '已取消' }
  }

  if (!loading) {
    return { main: idleMain }
  }

  const stageText = stageMessage.trim()

  if (percent !== null) {
    return { main: formatStageLocalProgress(stageMessage, percent) }
  }

  return { main: stageText || mapStageToButtonMessage(stageMessage) }
}

export function createPatternGenerationProgressReporter(
  onStage: (message: string, context?: PatternProgressContext) => void | Promise<void>,
): PatternGenerationProgressReporter {
  let lastMessage = ''
  let lastPercent: number | null = null
  let lastShownAt = 0
  let pendingMessage: string | null = null
  let pendingPercent: number | null = null
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  const startedAt = Date.now()

  const flushMessage = async (message: string, percent?: number) => {
    const nextPercent = normalizeReportPercent(percent ?? null)
    if (message === lastMessage && nextPercent === lastPercent) return
    lastMessage = message
    lastPercent = nextPercent
    lastShownAt = Date.now()
    await onStage(message, nextPercent !== null ? { percent: nextPercent } : undefined)
  }

  const report = async (message: string, context?: PatternProgressContext) => {
    const nextPercent = normalizeReportPercent(context?.percent ?? null)
    if (message === lastMessage && nextPercent === lastPercent) return

    if (
      message === lastMessage
      && nextPercent !== null
      && percentDisplayChanged(nextPercent, lastPercent)
    ) {
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
      pendingMessage = null
      pendingPercent = null
      await flushMessage(message, nextPercent)
      return
    }

    const now = Date.now()
    const elapsed = lastMessage ? now - lastShownAt : MIN_STAGE_MS

    if (elapsed >= MIN_STAGE_MS) {
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
      pendingMessage = null
      pendingPercent = null
      await flushMessage(message, nextPercent ?? undefined)
      return
    }

    pendingMessage = message
    pendingPercent = nextPercent
    if (pendingTimer) return

    pendingTimer = setTimeout(() => {
      pendingTimer = null
      const next = pendingMessage
      const nextPendingPercent = pendingPercent
      pendingMessage = null
      pendingPercent = null
      if (next && (next !== lastMessage || nextPendingPercent !== lastPercent)) {
        void flushMessage(next, nextPendingPercent ?? undefined)
      }
    }, MIN_STAGE_MS - elapsed)
  }

  const finish = async (options?: { skipDelay?: boolean }) => {
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
    pendingMessage = null
    if (options?.skipDelay) return
    const remaining = MIN_LOADING_MS - (Date.now() - startedAt)
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining))
    }
  }

  return { report, finish }
}
