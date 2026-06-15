import { View, Text, ScrollView } from '@tarojs/components'
import { USER_AGREEMENT_TEXT } from '@/constants/legal/userAgreement'
import '@/styles/legal-page.scss'

export default function UserAgreementPage() {
  return (
    <View className='legal-page'>
      <ScrollView scrollY className='legal-page__scroll'>
        <View className='legal-page__content'>
          <Text className='legal-page__text'>{USER_AGREEMENT_TEXT}</Text>
        </View>
      </ScrollView>
    </View>
  )
}
