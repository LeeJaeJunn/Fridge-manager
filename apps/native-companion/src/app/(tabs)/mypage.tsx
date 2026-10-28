import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { deleteSavedDish, fetchSavedDishes, saveDish, updateSavedDish } from '@/api/saved-dish';
import { Avatar, Button, Card, SavedDishDialog, Screen } from '@/components';
import { useAuth } from '@/context/auth';
import {
  draftFromSaved,
  EMPTY_SAVED_DISH_DRAFT,
  toSaveRequest,
  toUpdateRequest,
  type SavedDishDraftType,
} from '@/lib/saved-dish';
import type { SavedDishIngredientType, SavedDishType } from '@companion/types';

const SAVED_STAR = '#F59E0B'; // amber-deep — 저장 상태는 금색 별로 구분한다.
const ICON_COLOR = '#716865'; // ink-soft — Ionicons 는 className 으로 색을 못 받는다

/** "김치, 밥, 계란 외 2개" — 3개까지 이름만, 나머지는 개수로. */
function ingredientSummary(ingredients: SavedDishIngredientType[]): string {
  const head = ingredients
    .slice(0, 3)
    .map((ingredient) => ingredient.name)
    .join(', ');
  const rest = ingredients.length - 3;
  return rest > 0 ? `${head} 외 ${rest}개` : head;
}

/** 별을 잘못 눌러 저장 해제한 레시피를 즉시 복구하는 배너. */
function UndoBanner({ name, busy, onUndo }: { name: string; busy: boolean; onUndo: () => void }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-ink px-5 py-3">
      <Text className="flex-1 text-sm text-white">{name} 저장을 해제했어요</Text>
      <Pressable
        onPress={onUndo}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${name} 저장 해제 되돌리기`}
        className={busy ? 'opacity-50' : 'active:opacity-60'}
      >
        <Text className="text-sm font-semibold text-primary-soft">
          {busy ? '되돌리는 중…' : '되돌리기'}
        </Text>
      </Pressable>
    </View>
  );
}

/** 마이페이지 상단 — 닉네임 첫 글자 아바타와 설정 진입. */
function ProfileHeader({ name, onOpenSettings }: { name: string; onOpenSettings: () => void }) {
  return (
    <View className="flex-row items-center gap-4">
      <Avatar name={name} size={72} />
      <Text numberOfLines={1} className="flex-1 text-xl font-bold text-ink">
        {name}
      </Text>
      <Pressable
        onPress={onOpenSettings}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="설정"
        className="active:opacity-60"
      >
        <Ionicons name="settings-outline" size={24} color={ICON_COLOR} />
      </Pressable>
    </View>
  );
}

export default function MyPageScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const displayName = user?.name ?? user?.email?.split('@')[0] ?? '사용자';
  const [dishes, setDishes] = useState<SavedDishType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 모달은 화면이 하나만 들고, 카드는 열어달라고만 요청한다.
  const [editing, setEditing] = useState<SavedDishType | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [undoDish, setUndoDish] = useState<SavedDishType | null>(null);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(() => {
    fetchSavedDishes()
      .then((list) => {
        setDishes(list);
        setLoadError(null);
        setQuickError(null);
      })
      .catch(() => setLoadError('저장한 레시피를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  // 채팅에서 새로 저장한 요리를 탭 이동 즉시 반영한다.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave(draft: SavedDishDraftType) {
    if (!editing || busy) return;
    setBusy(true);
    setMutationError(null);
    try {
      const saved = await updateSavedDish(editing.id, toUpdateRequest(draft));
      // 서버 정렬(updatedAt desc)과 같게 수정한 요리를 맨 앞으로 옮긴다.
      setDishes((previous) => [saved, ...previous.filter((dish) => dish.id !== saved.id)]);
      setEditing(null);
    } catch {
      setMutationError('수정에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsave() {
    if (!editing || busy) return;
    const { id } = editing;
    setBusy(true);
    setMutationError(null);
    try {
      await deleteSavedDish(id);
      setDishes((previous) => previous.filter((dish) => dish.id !== id));
      setEditing(null);
    } catch {
      setMutationError('저장 해제에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickUnsave(event: GestureResponderEvent, dish: SavedDishType) {
    event.stopPropagation();
    if (removingId !== null) return;
    setRemovingId(dish.id);
    setQuickError(null);
    try {
      await deleteSavedDish(dish.id);
      setDishes((previous) => previous.filter((item) => item.id !== dish.id));
      setUndoDish(dish);
    } catch {
      setQuickError('저장 해제에 실패했어요');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleUndo() {
    if (!undoDish || undoing) return;
    setUndoing(true);
    setQuickError(null);
    try {
      const restored = await saveDish(
        toSaveRequest(draftFromSaved(undoDish), undoDish.sourceMessageId),
      );
      setDishes((previous) => [
        restored,
        ...previous.filter((dish) => dish.sourceMessageId !== restored.sourceMessageId),
      ]);
      setUndoDish(null);
    } catch {
      setQuickError('레시피를 되돌리지 못했어요');
    } finally {
      setUndoing(false);
    }
  }

  return (
    <Screen scroll edges={['top']} contentClassName="gap-4 px-6 py-6">
      <ProfileHeader name={displayName} onOpenSettings={() => router.push('/settings')} />
      <View className="mt-4 gap-1">
        <Text className="text-lg font-bold text-ink">저장한 레시피</Text>
        <Text className="text-sm text-ink-soft">
          채팅에서 저장한 요리예요. 눌러서 자세히 보거나 수정해요.
        </Text>
      </View>

      {loadError ? (
        <Card radius="3xl" className="gap-3 px-5 py-4">
          <Text className="text-sm text-ink">{loadError}</Text>
          <Button label="다시 시도" variant="secondary" onPress={load} />
        </Card>
      ) : null}

      {quickError ? (
        <Card radius="3xl" className="px-5 py-4">
          <Text className="text-sm text-red-500">{quickError}</Text>
        </Card>
      ) : null}

      {undoDish ? (
        <UndoBanner name={undoDish.dishName} busy={undoing} onUndo={() => void handleUndo()} />
      ) : null}

      {loading ? (
        <ActivityIndicator color="#C94B55" className="mt-8" />
      ) : dishes.length === 0 && loadError === null ? (
        <Card radius="3xl" className="gap-4 px-5 py-5">
          <View className="gap-1">
            <Text className="text-base font-semibold text-ink">아직 저장한 레시피가 없어요</Text>
            <Text className="text-sm text-ink-soft">
              채팅에서 추천받은 요리를 저장하면 여기에 모여요.
            </Text>
          </View>
          <Button label="요리 추천받기" onPress={() => router.push('/chat')} />
        </Card>
      ) : (
        dishes.map((dish) => (
          <Card
            key={dish.id}
            radius="3xl"
            onPress={() => {
              setMutationError(null);
              setEditing(dish);
            }}
            className="gap-1 px-5 py-4"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-base font-semibold text-ink">{dish.dishName}</Text>
                <Text className="text-sm text-ink-soft">
                  {dish.servings}인분
                  {dish.cookMinutes === null ? '' : ` · 약 ${dish.cookMinutes}분`}
                </Text>
              </View>
              <Pressable
                onPress={(event) => void handleQuickUnsave(event, dish)}
                disabled={removingId !== null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${dish.dishName} 저장 해제`}
                className={removingId === dish.id ? 'opacity-40' : 'active:opacity-60'}
              >
                <Ionicons name="star" size={22} color={SAVED_STAR} />
              </Pressable>
            </View>
            {dish.ingredients.length > 0 ? (
              <Text numberOfLines={1} className="text-sm text-ink-faint">
                {ingredientSummary(dish.ingredients)}
              </Text>
            ) : null}
          </Card>
        ))
      )}

      <SavedDishDialog
        visible={editing !== null}
        initial={editing ? draftFromSaved(editing) : EMPTY_SAVED_DISH_DRAFT}
        savedId={editing?.id ?? null}
        busy={busy}
        error={mutationError}
        onClose={() => {
          setMutationError(null);
          setEditing(null);
        }}
        onSave={handleSave}
        onUnsave={handleUnsave}
      />
    </Screen>
  );
}
