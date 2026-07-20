import Taro from '@tarojs/taro'

/** 本机开关：关闭后当前设备保存 PNG 到相册无需看完激励视频（不影响其他用户） */
const LOCAL_REQUIRE_EXPORT_VIDEO_KEY = 'localRequireExportVideo'

/** 默认 true：需看完视频；显式存 false 时本机跳过 */
export function getLocalRequireExportVideo(): boolean {
  try {
    const value = Taro.getStorageSync(LOCAL_REQUIRE_EXPORT_VIDEO_KEY)
    if (value === false || value === '0' || value === 0) return false
    return true
  } catch {
    return true
  }
}

export function setLocalRequireExportVideo(required: boolean): void {
  Taro.setStorageSync(LOCAL_REQUIRE_EXPORT_VIDEO_KEY, required)
}
