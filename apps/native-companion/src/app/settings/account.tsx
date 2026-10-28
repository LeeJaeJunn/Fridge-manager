import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/** 계정 설정 — 이름 수정 + 로그아웃 + 회원탈퇴 */
export default function AccountSettingsScreen() {
  const { user, updateName, logout, deleteAccount } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  function confirmDelete() {
    Alert.alert(
      '회원탈퇴',
      '탈퇴하면 캐릭터·대화·기억이 모두 삭제되고 되돌릴 수 없어요. 정말 탈퇴할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            // 성공 시 게이트가 로그인으로 전환되며 이 화면은 언마운트된다 → 성공 경로엔 setDeleting 불필요.
            deleteAccount().catch((e: unknown) => {
              setDeleting(false);
              Alert.alert('탈퇴 실패', e instanceof Error ? e.message : '오류가 발생했습니다');
            });
          },
        },
      ],
    );
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
              placeholderTextColor="#A79C98"
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

      {/* 이메일 (읽기 전용 — 로그인 키라 앱에서 바꾸지 않는다) */}
      <View className="gap-1">
        <Text className="text-ink-soft">이메일</Text>
        <Text className="text-lg text-ink">{user?.email ?? '-'}</Text>
      </View>

      <View className="mt-auto gap-3">
        <Button label="로그아웃" variant="secondary" onPress={confirmLogout} />
        <Button label="회원탈퇴" variant="danger" onPress={confirmDelete} loading={deleting} />
      </View>
    </Screen>
  );
}
