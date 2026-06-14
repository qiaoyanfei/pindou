import Taro from '@tarojs/taro'

/** 全屏预览图片；allowLongPressMenu 为 true 时长按可保存/分享 */
export function previewImageForHd(
  options: Taro.previewImage.Option,
  allowLongPressMenu = false,
): Promise<TaroGeneral.CallbackResult> {
  return Taro.previewImage({
    ...options,
    showmenu: allowLongPressMenu,
  })
}
