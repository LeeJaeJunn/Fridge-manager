import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import {
  addIngredients,
  consumeIngredient,
  fetchInventory,
  fetchInventoryOptions,
  restoreIngredient,
} from '@/api/inventory';
import { Button, Card, ChipGroup, Field, Screen } from '@/components';
import { expiryLabel, freshness, FRESHNESS_STYLE } from '@/lib/expiry';
import type { IngredientType, InventoryOptionsType } from '@companion/types';

/** 카테고리 이모지 — 라벨은 서버(options)가 주고, 글리프만 클라가 소유(정적·소수). */
const CATEGORY_EMOJI: Record<string, string> = {
  VEGETABLE: '🥬',
  FRUIT: '🍎',
  MEAT: '🥩',
  SEAFOOD: '🦐',
  DAIRY: '🥛',
  EGG: '🥚',
  GRAIN: '🍚',
  SAUCE: '🧂',
  PROCESSED: '🥫',
  FROZEN: '🧊',
  ETC: '📦',
};

const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';
const PLACEHOLDER = '#A1A1AA';

function IngredientCard({ item, onConsume }: { item: IngredientType; onConsume: () => void }) {
  const tint = FRESHNESS_STYLE[freshness(item.expiresAt)];
  return (
    <Card radius="3xl" className="flex-row items-center gap-3 px-5 py-4">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-sand">
        <Text className="text-lg">{CATEGORY_EMOJI[item.category] ?? '📦'}</Text>
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-ink">{item.name}</Text>
          {item.quantityNote ? (
            <Text className="text-sm text-ink-faint">{item.quantityNote}</Text>
          ) : null}
        </View>
        <View className={`self-start rounded-full px-2.5 py-0.5 ${tint.bg}`}>
          <Text className={`text-xs font-medium ${tint.text}`}>{expiryLabel(item)}</Text>
        </View>
      </View>

      <Pressable
        onPress={onConsume}
        hitSlop={8}
        className="rounded-full border border-line px-3 py-1.5 active:bg-sand"
      >
        <Text className="text-sm text-ink-soft">다 먹음</Text>
      </Pressable>
    </Card>
  );
}

/** 방금 소비한 재료를 되돌릴 수 있는 배너 (LLM·오터치 오차감 복구용). */
function UndoBanner({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-ink px-5 py-3">
      <Text className="text-sm text-white">{name} 다 먹음 처리했어요</Text>
      <Pressable onPress={onUndo} hitSlop={8}>
        <Text className="text-sm font-semibold text-lavender-soft">되돌리기</Text>
      </Pressable>
    </View>
  );
}

/** 재료 직접 추가 폼 (채팅이 주 입력이고, 이건 교정·보조 경로). */
function AddForm({ options, onAdded }: { options: InventoryOptionsType; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('ETC');
  const [storage, setStorage] = useState<string>('FRIDGE');
  const [quantityNote, setQuantityNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setCategory('ETC');
    setStorage('FRIDGE');
    setQuantityNote('');
  };

  async function submit() {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await addIngredients([
        {
          name: name.trim(),
          category: category as IngredientType['category'],
          storage: storage as IngredientType['storage'],
          ...(quantityNote.trim() ? { quantityNote: quantityNote.trim() } : {}),
        },
      ]);
      reset();
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <Button label="+ 재료 직접 추가" variant="secondary" onPress={() => setOpen(true)} />;
  }

  return (
    <Card radius="3xl" className="gap-4 px-5 py-5">
      <Field label="재료 이름">
        <TextInput
          className={INPUT}
          value={name}
          onChangeText={setName}
          placeholder="예: 두부"
          placeholderTextColor={PLACEHOLDER}
          maxLength={options.limits.nameMax}
          returnKeyType="done"
        />
      </Field>
      <Field label="분류">
        <ChipGroup options={options.categories} value={category} onChange={setCategory} />
      </Field>
      <Field label="보관">
        <ChipGroup options={options.storages} value={storage} onChange={setStorage} />
      </Field>
      <Field label="수량 (선택)">
        <TextInput
          className={INPUT}
          value={quantityNote}
          onChangeText={setQuantityNote}
          placeholder="예: 한 모, 2개, 반 팩"
          placeholderTextColor={PLACEHOLDER}
          maxLength={options.limits.quantityNoteMax}
          returnKeyType="done"
        />
      </Field>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="취소"
            variant="secondary"
            onPress={() => {
              reset();
              setOpen(false);
            }}
          />
        </View>
        <View className="flex-1">
          <Button label="추가" onPress={submit} loading={saving} disabled={!name.trim()} />
        </View>
      </View>
    </Card>
  );
}

export default function FridgeScreen() {
  const [items, setItems] = useState<IngredientType[]>([]);
  const [options, setOptions] = useState<InventoryOptionsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchInventory(), fetchInventoryOptions()])
      .then(([list, opts]) => {
        setItems(list);
        setOptions(opts);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleConsume(item: IngredientType) {
    // 목록에서 먼저 지워 반응성을 주고(낙관적), 되돌리기 배너를 띄운다.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setUndo({ id: item.id, name: item.name });
    await consumeIngredient(item.id);
  }

  async function handleUndo() {
    if (!undo) return;
    await restoreIngredient(undo.id);
    setUndo(null);
    load();
  }

  // 안 지난 것/지난 것을 나눠 지난 걸 위로 — "먼저 먹어야 할 것"이 눈에 먼저 들어오게.
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    [items],
  );

  return (
    <Screen scroll edges={['top']} contentClassName="gap-5 px-6 py-6">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-ink">내 냉장고</Text>
        <Text className="text-sm text-ink-soft">
          채팅으로 “계란 샀어”라고 말해도 여기 담겨요. 다 먹으면 눌러서 비워요.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#A78BFA" className="mt-8" />
      ) : (
        <>
          {undo ? <UndoBanner name={undo.name} onUndo={handleUndo} /> : null}

          {sorted.length === 0 ? (
            <Text className="mt-6 text-center text-ink-faint">
              아직 담긴 재료가 없어요.{'\n'}장 보고 와서 “뭐뭐 샀어”라고 말해보세요.
            </Text>
          ) : (
            <View className="gap-3">
              {sorted.map((item) => (
                <IngredientCard key={item.id} item={item} onConsume={() => handleConsume(item)} />
              ))}
            </View>
          )}

          {options ? <AddForm options={options} onAdded={load} /> : null}
        </>
      )}

      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
    </Screen>
  );
}
