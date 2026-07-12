import { Text, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/**
 * 임시 인증 실패 화면.
 * 실제 로그인 기능이 붙으면 loginId/password 입력 화면으로 교체한다.
 */
export default function LoginScreen() {
  const { isLoading, refreshMe } = useAuth();

  return (
    <Screen contentClassName="justify-center gap-6 px-6">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">로그인이 필요합니다</Text>
        <Text className="text-ink-soft">
          개발용 유저를 확인하지 못했습니다. 백엔드와 dev auth 설정을 확인한 뒤 다시 시도해 주세요.
        </Text>
      </View>

      <Button label="다시 시도" loading={isLoading} onPress={refreshMe} />
    </Screen>
  );
}
