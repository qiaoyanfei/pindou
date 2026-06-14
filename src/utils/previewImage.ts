import Taro from '@tarojs/taro'

/** 全屏预览高清图，关闭长按保存/分享菜单，保留双指缩放 */
export function previewImageWithoutMenu(
  options: Taro.previewImage.Option,
): Promise<TaroGeneral.CallbackResult> {
  return Taro.previewImage({
    ...options,
    showmenu: false,
  })
}
