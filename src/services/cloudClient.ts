import Taro from '@tarojs/taro'
import { CLOUD_API_FUNCTION, CLOUD_ENV_ID } from '@/config/cloud'

let initialized = false

const UPLOAD_JSON_PREFIX = 'pindou_upload_'
const UPLOAD_JSON_PATH = `${Taro.env.USER_DATA_PATH}/${UPLOAD_JSON_PREFIX}latest.json`

function getFileSystemManager() {
  return Taro.getFileSystemManager()
}

function removeFileQuietly(filePath: string): void {
  try {
    getFileSystemManager().unlinkSync(filePath)
  } catch {
    // ignore missing files
  }
}

export function cleanupUploadJsonCache(): void {
  const fs = getFileSystemManager()
  try {
    const files = fs.readdirSync(Taro.env.USER_DATA_PATH) as string[]
    files.forEach((name) => {
      if (name.startsWith(UPLOAD_JSON_PREFIX) || name.endsWith('_payload.json')) {
        removeFileQuietly(`${Taro.env.USER_DATA_PATH}/${name}`)
      }
    })
  } catch {
    // ignore unreadable cache dir
  }
}

function isLocalStorageLimitError(message: string): boolean {
  return (
    message.includes('maximum size of the file storage limit') ||
    message.includes('storage limit is exceeded') ||
    message.includes('file storage limit')
  )
}

function toUploadError(error: unknown, fallback: string): Error {
  const errMsg = (error as { errMsg?: string })?.errMsg || ''
  const message = (error instanceof Error ? error.message : '') || errMsg || fallback
  if (isLocalStorageLimitError(message)) {
    return new Error('本地缓存已满，请关闭并重新打开小程序后再试')
  }
  return error instanceof Error ? error : new Error(message)
}

export function initCloud(): boolean {
  if (initialized) return true
  if (process.env.TARO_ENV !== 'weapp') return false
  if (!CLOUD_ENV_ID) return false
  Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
  initialized = true
  return true
}

export function ensureCloudReady(): void {
  if (process.env.TARO_ENV !== 'weapp') {
    throw new Error('请在微信小程序中使用云开发功能')
  }
  if (!CLOUD_ENV_ID) {
    throw new Error('请先在 src/config/cloud.ts 配置 CLOUD_ENV_ID')
  }
  initCloud()
}

export async function callCloudApi<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  try {
    ensureCloudReady()
    const response = await Taro.cloud.callFunction({
      name: CLOUD_API_FUNCTION,
      data: { action, data },
    })
    const result = response.result as { ok?: boolean; data?: T; message?: string } | string
    if (typeof result === 'string') {
      throw new Error(result || '云函数返回异常')
    }
    if (!result?.ok) {
      throw new Error(result?.message || '云函数调用失败')
    }
    return result.data as T
  } catch (error) {
    const errMsg = (error as { errMsg?: string })?.errMsg || ''
    const message = (error instanceof Error ? error.message : '') || errMsg || '云开发请求失败'
    if (message.includes('Cloud API isn\'t enabled') || message.includes('cloud init')) {
      throw new Error('云开发未初始化，请在开发者工具中开通云开发')
    }
    if (message.includes('FunctionName parameter could not be found') || message.includes('-501000')) {
      throw new Error('云函数 api 未部署，请先上传并部署 cloudfunctions/api')
    }
    throw new Error(message)
  }
}

export async function uploadCloudFile(
  cloudPath: string,
  filePath: string,
): Promise<string> {
  ensureCloudReady()
  try {
    const response = await Taro.cloud.uploadFile({ cloudPath, filePath })
    if (!response.fileID) {
      throw new Error('文件上传失败')
    }
    return response.fileID
  } catch (error) {
    const errMsg = (error as { errMsg?: string })?.errMsg || ''
    if (errMsg.includes('file not exist') || errMsg.includes('no such file')) {
      throw new Error('本地文件不存在，请返回预览页重新生成封面')
    }
    throw toUploadError(error, '文件上传失败')
  }
}

async function writeJsonTempFile(data: string): Promise<void> {
  const fs = getFileSystemManager()
  await new Promise<void>((resolve, reject) => {
    fs.writeFile({
      filePath: UPLOAD_JSON_PATH,
      data,
      encoding: 'utf8',
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '写入临时文件失败')),
    })
  })
}

export async function uploadJsonCloudFile(
  cloudPath: string,
  payload: unknown,
): Promise<string> {
  cleanupUploadJsonCache()
  const data = JSON.stringify(payload)

  try {
    try {
      await writeJsonTempFile(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (isLocalStorageLimitError(message)) {
        cleanupUploadJsonCache()
        await writeJsonTempFile(data)
      } else {
        throw toUploadError(error, '写入临时文件失败')
      }
    }
    return await uploadCloudFile(cloudPath, UPLOAD_JSON_PATH)
  } finally {
    removeFileQuietly(UPLOAD_JSON_PATH)
  }
}

export async function getTempFileUrl(fileId: string): Promise<string> {
  if (!fileId) return ''
  ensureCloudReady()
  const response = await Taro.cloud.getTempFileURL({ fileList: [fileId] })
  return response.fileList[0]?.tempFileURL || ''
}

export async function getTempFileUrls(fileIds: string[]): Promise<Record<string, string>> {
  const ids = fileIds.filter((id) => id && id.startsWith('cloud://'))
  if (ids.length === 0) return {}
  ensureCloudReady()
  const response = await Taro.cloud.getTempFileURL({ fileList: ids })
  const map: Record<string, string> = {}
  response.fileList.forEach((item) => {
    if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
  })
  return map
}

export async function downloadJsonFile<T>(fileId: string): Promise<T> {
  ensureCloudReady()
  const response = await Taro.cloud.downloadFile({ fileID: fileId })
  const fs = getFileSystemManager()
  const content = await new Promise<string>((resolve, reject) => {
    fs.readFile({
      filePath: response.tempFilePath,
      encoding: 'utf8',
      success: (res) => resolve(String(res.data)),
      fail: reject,
    })
  })
  return JSON.parse(content) as T
}
