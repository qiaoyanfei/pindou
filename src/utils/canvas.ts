import Taro from '@tarojs/taro'

export function getCanvasNode(canvasId: string): Promise<WechatMiniprogram.Canvas> {
  return new Promise((resolve, reject) => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as WechatMiniprogram.Canvas | undefined
        if (!node) {
          reject(new Error('Canvas 未就绪'))
          return
        }
        resolve(node)
      })
  })
}

export async function canvasToTempFile(canvasId: string): Promise<string> {
  const canvas = await getCanvasNode(canvasId)
  const width = canvas.width
  const height = canvas.height
  if (!width || !height) {
    throw new Error('Canvas 尺寸无效')
  }

  const result = await Taro.canvasToTempFilePath({
    canvas,
    x: 0,
    y: 0,
    width,
    height,
    destWidth: width,
    destHeight: height,
  })
  return result.tempFilePath
}
