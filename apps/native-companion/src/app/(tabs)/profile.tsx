import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

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
  const { user } = useAuth();
  // 이름을 안 정했으면 이메일 앞부분으로 대신한다 — 주소 전체는 아바타·제목에 길고 사적이다.
  const name = user?.name ?? user?.email?.split('@')[0] ?? '사용자';

  return (
    <Screen scroll contentClassName="gap-8 px-6 py-8">
      {/* 내 정보 */}
      <View className="items-center gap-3">
        <Avatar name={name} />
        <View className="items-center gap-0.5">
          <Text className="text-xl font-bold text-ink">{name}</Text>
          {user?.email && <Text className="text-sm text-ink-soft">{user.email}</Text>}
        </View>
      </View>

      {/* 섹션 */}
      <View className="gap-2.5">
        <SettingsRow label="계정" onPress={() => router.push('/settings/account')} />
        <SettingsRow label="캐릭터 설정" onPress={() => router.push('/settings/character')} />
        <SettingsRow label="AI 메모리 관리" onPress={() => router.push('/settings/memory')} />
      </View>
    </Screen>
  );
}
