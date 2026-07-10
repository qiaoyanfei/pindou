import { View, Text, ScrollView } from '@tarojs/components'
import { USER_AGREEMENT_TEXT } from '@/constants/legal/userAgreement'
import { useDefaultPageShare } from '@/utils/shareReward'
import '@/styles/legal-page.scss'

export default function UserAgreementPage() {
  useDefaultPageShare({ title: '用户协议', path: '/pages/home/index' })

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
