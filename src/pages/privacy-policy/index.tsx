import { View, Text, ScrollView } from '@tarojs/components'
import { PRIVACY_POLICY_TEXT } from '@/constants/legal/privacyPolicy'
import '@/styles/legal-page.scss'

export default function PrivacyPolicyPage() {
  return (
    <View className='legal-page'>
      <ScrollView scrollY className='legal-page__scroll'>
        <View className='legal-page__content'>
          <Text className='legal-page__text'>{PRIVACY_POLICY_TEXT}</Text>
        </View>
      </ScrollView>
    </View>
  )
}
