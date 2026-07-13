import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { Avatar, Card, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/** 프로필 허브의 이동 행 (라벨 + 화살표) */
function SettingsRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Card
      onPress={onPress}
      radius="2xl"
      className="flex-row items-center justify-between px-5 py-4"
    >
      <Text className="text-base text-ink">{label}</Text>
      <Text className="text-lg text-ink-faint">›</Text>
    </Card>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const name = user?.name ?? user?.loginId ?? '사용자';

  const confirmLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <Screen scroll contentClassName="gap-8 px-6 py-8">
      {/* 내 정보 */}
      <View className="items-center gap-3">
        <Avatar name={name} />
        <View className="items-center gap-0.5">
          <Text className="text-xl font-bold text-ink">{name}</Text>
          {user?.loginId && <Text className="text-sm text-ink-soft">@{user.loginId}</Text>}
        </View>
      </View>

      {/* 섹션 */}
      <View className="gap-2.5">
        <SettingsRow label="캐릭터 설정" onPress={() => router.push('/settings/character')} />
        <SettingsRow label="AI 메모리 관리" onPress={() => router.push('/settings/memory')} />
        <SettingsRow label="로그아웃" onPress={confirmLogout} />
      </View>
    </Screen>
  );
}
