import {
  isLocalStorageLimitError,
  LOCAL_STORAGE_LIMIT_TOAST,
} from '@/utils/localCache'

export function resolveErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error && error.message) {
    if (isLocalStorageLimitError(error)) return LOCAL_STORAGE_LIMIT_TOAST
    return error.message
  }
  const errMsg = (error as { errMsg?: string })?.errMsg
  if (errMsg) {
    if (isLocalStorageLimitError(errMsg)) return LOCAL_STORAGE_LIMIT_TOAST
    if (errMsg.includes('exceed max') || errMsg.includes('size limit')) {
      return '请求数据过大，请降低规格或清晰度后重试'
    }
    if (errMsg.includes('file not exist') || errMsg.includes('file not found') || errMsg.includes('no such file')) {
      return '本地文件不存在，请返回预览页重新操作'
    }
    return errMsg
  }
  return fallback
}
