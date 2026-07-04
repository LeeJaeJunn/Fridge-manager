import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { deleteMyCharacter, updateCharacterName } from '@/api/character';
import { Button, Screen } from '@/components';
import { useCharacter } from '@/context/character';

export default function CharacterSettingsScreen() {
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

  return (
    <Screen edges={['bottom']} contentClassName="gap-6 px-6 py-8">
      <View className="gap-2">
        <Text className="text-ink-soft">캐릭터 이름</Text>

        {editing ? (
          <View className="gap-2">
            <TextInput
              className="rounded-xl bg-sand px-4 py-3 text-lg text-ink"
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={30}
              autoFocus
              placeholder="이름"
              placeholderTextColor="#A8A2B8"
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View className="flex-row gap-2">
              <Button
                label="저장"
                size="sm"
                className="flex-1"
                onPress={handleSaveName}
                disabled={!nameInput.trim()}
                loading={saving}
              />
              <Button
                label="취소"
                size="sm"
                variant="secondary"
                className="flex-1"
                onPress={() => setEditing(false)}
                disabled={saving}
              />
            </View>
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <Text className="text-lg text-ink">{character?.name ?? '-'}</Text>
            <Button label="수정" size="sm" variant="secondary" onPress={startEdit} />
          </View>
        )}

        {error && <Text className="text-sm text-red-500">{error}</Text>}
      </View>

      {/* ⚠️ 테스트용: 캐릭터를 지워 온보딩을 다시 보기 위함 */}
      <Button
        label="캐릭터 삭제 (테스트용)"
        variant="danger"
        className="mt-auto"
        onPress={handleDelete}
        loading={deleting}
      />
    </Screen>
  );
}
