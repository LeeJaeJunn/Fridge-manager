import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { createCharacter, fetchPresets } from '@/api/character';
import { Button, Screen } from '@/components';
import { useCharacter } from '@/context/character';
import type { PresetSummaryType } from '@companion/types';

export default function OnboardingScreen() {
  const { setCharacter } = useCharacter();
  const [presets, setPresets] = useState<PresetSummaryType[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets()
      .then(setPresets)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'));
  }, []);

  async function handleCreate() {
    if (!presetId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCharacter({ presetId });
      // 게이트 guard 가 뒤집혀 자동으로 홈(탭)으로 전환된다.
      setCharacter(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '생성에 실패했습니다');
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} contentClassName="justify-center gap-8 px-6">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">컴패니언 만들기</Text>
        <Text className="text-ink-soft">함께할 친구를 골라주세요.</Text>
      </View>

      <View className="gap-3">
        {presets.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPresetId(p.id)}
            className={`gap-1 rounded-2xl border px-4 py-4 ${
              presetId === p.id
                ? 'border-lavender bg-lavender-soft'
                : 'border-sand bg-white'
            }`}
          >
            <Text className="text-lg font-semibold text-ink">{p.name}</Text>
            <Text className="text-sm text-ink-soft">{p.description}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <Button
        label="시작하기"
        onPress={handleCreate}
        disabled={!presetId}
        loading={submitting}
      />
    </Screen>
  );
}
