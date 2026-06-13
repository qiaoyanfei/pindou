import Taro from '@tarojs/taro'

function isUserCancel(err: unknown): boolean {
  const msg = (err as { errMsg?: string })?.errMsg || ''
  return msg.includes('cancel') || msg.includes('fail cancel')
}

export function showActionSheet(options: { itemList: string[] }): Promise<{ tapIndex: number } | null> {
  return new Promise((resolve) => {
    Taro.showActionSheet({
      itemList: options.itemList,
      success: (res) => resolve(res),
      fail: (err) => {
        if (!isUserCancel(err)) {
          console.warn('[showActionSheet]', err)
        }
        resolve(null)
      },
    })
  })
}

export function showModal(options: Taro.showModal.Option): Promise<{ confirm: boolean; cancel: boolean } | null> {
  return new Promise((resolve) => {
    Taro.showModal({
      ...options,
      success: (res) => resolve(res),
      fail: (err) => {
        if (!isUserCancel(err)) {
          console.warn('[showModal]', err)
        }
        resolve(null)
      },
    })
  })
}
