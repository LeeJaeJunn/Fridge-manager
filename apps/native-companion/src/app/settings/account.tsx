import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/** 계정 설정 — 이름 수정 + 로그아웃 */
export default function AccountSettingsScreen() {
  const { user, updateName, logout } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setNameInput(user?.name ?? '');
    setError(null);
    setEditing(true);
  }

  async function handleSaveName() {
    const name = nameInput.trim();
    if (!name || saving) return;
    if (name === user?.name) {
      setEditing(false); // 변경 없음
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateName(name); // 전역 user 즉시 반영 (홈 인사 등)
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '수정에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }

  function confirmLogout() {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <Screen edges={['bottom']} contentClassName="gap-6 px-6 py-8">
      {/* 이름 */}
      <View className="gap-2">
        <Text className="text-ink-soft">이름</Text>

        {editing ? (
          <View className="gap-2">
            <TextInput
              className="rounded-xl bg-sand px-4 py-3 text-lg text-ink"
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={20}
              autoFocus
              placeholder="이름"
              placeholderTextColor="#A1A1AA"
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
            <Text className="text-lg text-ink">{user?.name ?? '-'}</Text>
            <Button label="수정" size="sm" variant="secondary" onPress={startEdit} />
          </View>
        )}

        {error && <Text className="text-sm text-red-500">{error}</Text>}
      </View>

      {/* 아이디 (읽기 전용) */}
      <View className="gap-1">
        <Text className="text-ink-soft">아이디</Text>
        <Text className="text-lg text-ink">@{user?.loginId ?? '-'}</Text>
      </View>

      <Button label="로그아웃" variant="secondary" className="mt-auto" onPress={confirmLogout} />
    </Screen>
  );
}
