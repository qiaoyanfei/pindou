import { View, Text, Input } from '@tarojs/components'
import { useState } from 'react'
import {
  normalizeCreatorSignature,
  setStoredCreatorNickname,
} from '@/utils/creatorNickname'
import './index.scss'

interface CreatorSignatureInputProps {
  value: string
  onChange: (value: string) => void
}

export default function CreatorSignatureInput({
  value,
  onChange,
}: CreatorSignatureInputProps) {
  const [focused, setFocused] = useState(false)

  const handleBlur = (inputValue: string) => {
    const normalized = normalizeCreatorSignature(inputValue)
    onChange(normalized)
    setStoredCreatorNickname(normalized)
    setFocused(false)
  }

  return (
    <View className={`creator-signature${focused ? ' creator-signature--focused' : ''}`}>
      <View className='creator-signature__field'>
        <Input
          className='creator-signature__input'
          type='nickname'
          placeholder='点击使用微信昵称或自定义'
          maxlength={20}
          value={value}
          onFocus={() => setFocused(true)}
          onInput={(event) => onChange(normalizeCreatorSignature(event.detail.value))}
          onBlur={(event) => handleBlur(event.detail.value)}
        />
      </View>
      <Text className='creator-signature__hint'>保存图纸时将写入水印，保护作品署名</Text>
    </View>
  )
}
