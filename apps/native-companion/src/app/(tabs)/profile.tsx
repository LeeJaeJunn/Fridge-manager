import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteMyCharacter, updateCharacterName } from '@/api/character';
import { useCharacter } from '@/context/character';

export default function ProfileScreen() {
  const { character, setCharacter } = useCharacter();
  const [deleting, setDeleting] = useState(false);

  // 이름 수정
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setNameInput(character?.name ?? '');
    setError(null);
    setEditing(true);
  }

  async function handleSaveName() {
    const name = nameInput.trim();
    if (!name || saving) return;
    if (name === character?.name) {
      setEditing(false); // 변경 없음
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCharacterName({ name });
      setCharacter(updated); // 홈 인사 등 전역 즉시 반영
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '수정에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
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

        <View className="gap-2">
          <Text className="text-neutral-500">내 캐릭터</Text>

          {editing ? (
            <View className="gap-2">
              <TextInput
                className="rounded-xl bg-neutral-100 px-4 py-3 text-lg text-neutral-900"
                value={nameInput}
                onChangeText={setNameInput}
                maxLength={30}
                autoFocus
                placeholder="이름"
                placeholderTextColor="#9ca3af"
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleSaveName}
                  disabled={saving || !nameInput.trim()}
                  className={`flex-1 items-center rounded-full px-4 py-2 ${
                    saving || !nameInput.trim() ? 'bg-indigo-300' : 'bg-indigo-500'
                  }`}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="font-semibold text-white">저장</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setEditing(false)}
                  disabled={saving}
                  className="flex-1 items-center rounded-full border border-neutral-200 px-4 py-2"
                >
                  <Text className="font-semibold text-neutral-700">취소</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <Text className="text-lg text-neutral-900">{character?.name ?? '-'}</Text>
              <Pressable onPress={startEdit} className="rounded-full bg-neutral-100 px-4 py-2">
                <Text className="font-medium text-neutral-700">수정</Text>
              </Pressable>
            </View>
          )}

          {error && <Text className="text-sm text-red-500">{error}</Text>}
        </View>

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
