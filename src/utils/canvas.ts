import Taro from '@tarojs/taro'

const CANVAS_READY_RETRY_COUNT = 10
const CANVAS_READY_RETRY_DELAY = 80

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function queryCanvasNode(canvasId: string): Promise<WechatMiniprogram.Canvas | null> {
  return new Promise((resolve) => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as WechatMiniprogram.Canvas | undefined
        resolve(node ?? null)
      })
  })
}

export async function getCanvasNode(canvasId: string): Promise<WechatMiniprogram.Canvas> {
  for (let attempt = 0; attempt <= CANVAS_READY_RETRY_COUNT; attempt += 1) {
    const node = await queryCanvasNode(canvasId)
    if (node) return node
    if (attempt < CANVAS_READY_RETRY_COUNT) {
      await wait(CANVAS_READY_RETRY_DELAY)
    }
  }
  throw new Error('图片生成失败，请重试')
}

export async function canvasToTempFile(canvasId: string): Promise<string> {
  const canvas = await getCanvasNode(canvasId)
  const width = canvas.width
  const height = canvas.height
  if (!width || !height) {
    throw new Error('图片生成失败，请重试')
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
