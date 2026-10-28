import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Card, Screen } from '@/components';

/** 설정 허브의 이동 행 (라벨 + 화살표) */
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

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-2.5 px-6 py-8">
      <SettingsRow label="계정" onPress={() => router.push('/settings/account')} />
      <SettingsRow label="캐릭터 설정" onPress={() => router.push('/settings/character')} />
      <SettingsRow label="AI 메모리 관리" onPress={() => router.push('/settings/memory')} />
    </Screen>
  );
}
