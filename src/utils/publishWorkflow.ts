import Taro from '@tarojs/taro'
import {
  DEFAULT_CONFIG,
  normalizeConfig,
} from '@/utils/constants'
import {
  PATTERN_STORAGE_KEY,
  PUBLISH_STORAGE_KEY,
  type PatternConfig,
  type PatternResult,
  type PublishStoragePayload,
} from '@/types'

export interface PublishWorkflowData {
  pattern: PatternResult
  config: PatternConfig
  coverPath?: string
  title?: string
}

/** 从 PATTERN_STORAGE_KEY 读取图纸，PUBLISH_STORAGE_KEY 只存封面与表单信息 */
export function readPublishWorkflow(): PublishWorkflowData | null {
  try {
    const patternStored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as {
      pattern?: PatternResult
      config?: PatternConfig
    } | undefined
    const publishStored = Taro.getStorageSync(PUBLISH_STORAGE_KEY) as PublishStoragePayload | undefined
    const pattern = patternStored?.pattern || publishStored?.pattern
    if (!pattern) return null
    return {
      pattern,
      config: normalizeConfig(
        publishStored?.config || patternStored?.config || DEFAULT_CONFIG,
      ),
      coverPath: publishStored?.coverPath,
      title: publishStored?.title,
    }
  } catch {
    return null
  }
}
