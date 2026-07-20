/**
 * 微信流量主广告位 ID
 *
 * 在公众平台「流量主 → 广告管理」创建后填入。
 */
export const NATIVE_TEMPLATE_GENERATION_AD_UNIT_ID = 'adunit-eea1e16ec3cd6b6d'

/** 激励视频：预览页 PNG 保存相册 */
export const REWARDED_VIDEO_EXPORT_AD_UNIT_ID = 'adunit-57dc66992466c96a'

/** 激励视频：社区图纸看完可免小豆下载（可与导出位共用同一广告位） */
export const REWARDED_VIDEO_DOWNLOAD_AD_UNIT_ID = 'adunit-57dc66992466c96a'

/** 插屏：色号详情页 */
export const INTERSTITIAL_COLOR_DETAIL_AD_UNIT_ID = 'adunit-0637195784e312bb'

export function hasRewardedVideoExportAd(): boolean {
  return Boolean(REWARDED_VIDEO_EXPORT_AD_UNIT_ID.trim())
}

export function hasRewardedVideoDownloadAd(): boolean {
  return Boolean(REWARDED_VIDEO_DOWNLOAD_AD_UNIT_ID.trim())
}

export function hasInterstitialColorDetailAd(): boolean {
  return Boolean(INTERSTITIAL_COLOR_DETAIL_AD_UNIT_ID.trim())
}
