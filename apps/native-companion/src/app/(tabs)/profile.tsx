import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteMyCharacter } from '@/api/character';
import { useCharacter } from '@/context/character';

export default function ProfileScreen() {
  const { character, setCharacter } = useCharacter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    console.log('222');
    setDeleting(true);
    try {
      await deleteMyCharacter();
      setCharacter(null); // 게이트가 온보딩으로 전환됨
    } catch (e: unknown) {
      Alert.alert('삭제 실패', e instanceof Error ? e.message : '오류');
      setDeleting(false);
    }
  }

  function confirmDelete() {
    console.log('???');
    handleDelete();
    // Alert.alert('캐릭터 삭제', '정말 삭제할까요? 대화도 함께 삭제됩니다.', [
    //   { text: '취소', style: 'cancel' },
    //   { text: '삭제', style: 'destructive', onPress: () => void handleDelete() },
    // ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-1 gap-6 px-6 py-8">
        <Text className="text-xl font-bold text-neutral-900">프로필</Text>

        <View className="gap-1">
          <Text className="text-neutral-500">내 캐릭터</Text>
          <Text className="text-lg text-neutral-900">{character?.name ?? '-'}</Text>
        </View>

        {/* 이름 수정(PATCH)은 Step C 에서 추가 */}
        <Text className="text-sm text-neutral-500">이름 수정은 곧 추가됩니다.</Text>

        {/* ⚠️ 테스트용: 캐릭터를 지워 온보딩을 다시 보기 위함 */}
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          className="mt-auto items-center rounded-full border border-red-500/50 px-6 py-3"
        >
          {deleting ? (
            <ActivityIndicator color="#f87171" />
          ) : (
            <Text className="font-semibold text-red-500">캐릭터 삭제 (테스트용)</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
