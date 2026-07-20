/**
 * 微信流量主广告位 ID
 *
 * 在公众平台「流量主 → 广告管理」创建后填入。
 */
export const NATIVE_TEMPLATE_GENERATION_AD_UNIT_ID = 'adunit-eea1e16ec3cd6b6d'

/** 激励视频：预览页 PNG 保存相册前必须看完 */
export const REWARDED_VIDEO_EXPORT_AD_UNIT_ID = 'adunit-57dc66992466c96a'

export function hasRewardedVideoExportAd(): boolean {
  return Boolean(REWARDED_VIDEO_EXPORT_AD_UNIT_ID.trim())
}
