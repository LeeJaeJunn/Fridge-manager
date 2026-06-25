import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createCharacter, fetchPresets } from '@/api/character';
import { useCharacter } from '@/context/character';
import type { PresetSummaryType } from '@companion/types';

export default function OnboardingScreen() {
  const { setCharacter } = useCharacter();
  const [presets, setPresets] = useState<PresetSummaryType[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [name, setName] = useState('');
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
      const created = await createCharacter({
        presetId,
        name: name.trim() || undefined,
      });
      // 게이트 guard 가 뒤집혀 자동으로 홈(탭)으로 전환된다.
      setCharacter(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '생성에 실패했습니다');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center gap-8 px-6">
        <View className="gap-2">
          <Text className="text-2xl font-bold text-neutral-900">컴패니언 만들기</Text>
          <Text className="text-neutral-500">성격을 고르고 이름을 지어주세요.</Text>
        </View>

        <View className="gap-3">
          {presets.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPresetId(p.id)}
              className={`rounded-2xl border px-4 py-4 ${
                presetId === p.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-neutral-200 bg-neutral-50'
              }`}
            >
              <Text className="text-lg text-neutral-900">{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          className="rounded-full bg-neutral-100 px-4 py-3 text-neutral-900"
          placeholder="이름 (비우면 기본 이름)"
          placeholderTextColor="#9ca3af"
          value={name}
          onChangeText={setName}
          maxLength={30}
        />

        {error && <Text className="text-sm text-red-500">{error}</Text>}

        <Pressable
          onPress={handleCreate}
          disabled={!presetId || submitting}
          className={`items-center rounded-full px-6 py-3 ${
            !presetId || submitting ? 'bg-indigo-300' : 'bg-indigo-500'
          }`}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">시작하기</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
