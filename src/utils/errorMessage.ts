export function resolveErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string })?.errMsg
  if (errMsg) {
    if (errMsg.includes('maximum size of the file storage limit') || errMsg.includes('file storage limit')) {
      return '本地缓存已满，请关闭并重新打开小程序后再试'
    }
    if (errMsg.includes('exceed max') || errMsg.includes('size limit')) {
      return '请求数据过大，请降低规格或清晰度后重试'
    }
    return errMsg
  }
  return fallback
}
