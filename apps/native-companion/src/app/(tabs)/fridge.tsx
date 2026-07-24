import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Card, ChipGroup, Field, Screen } from '@/components';
import { useInventory } from '@/context/inventory';
import { expiryLabel, freshness, FRESHNESS_STYLE } from '@/lib/expiry';
import type { IngredientType, InventoryOptionsType } from '@companion/types';

/** FormValues → 서버 patch (문자열 값을 도메인 타입으로 좁힌다). */
const toPatch = (v: FormValues) => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  // 빈 문자열이면 서버가 미변경으로 처리 — v1 은 수량 비우기를 지원하지 않는다.
  quantityNote: v.quantityNote,
});

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

/** 폼이 돌려주는 값 — 추가·수정이 같은 모양을 쓴다(유통기한은 v1 편집 대상 아님). */
type FormValues = {
  name: string;
  category: string;
  storage: string;
  quantityNote: string;
};

/** 재료 입력 필드 묶음 — 직접 추가와 수정이 공유한다. */
function IngredientForm({
  options,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  options: InventoryOptionsType;
  initial?: Partial<FormValues>;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'ETC');
  const [storage, setStorage] = useState(initial?.storage ?? 'FRIDGE');
  const [quantityNote, setQuantityNote] = useState(initial?.quantityNote ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), category, storage, quantityNote: quantityNote.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-4">
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
          <Button label="취소" variant="secondary" onPress={onCancel} />
        </View>
        <View className="flex-1">
          <Button label={submitLabel} onPress={submit} loading={saving} disabled={!name.trim()} />
        </View>
      </View>
    </View>
  );
}

function IngredientCard({
  item,
  options,
  onConsume,
  onUpdate,
  onDelete,
}: {
  item: IngredientType;
  options: InventoryOptionsType;
  onConsume: () => void;
  onUpdate: (v: FormValues) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  // 카드 안의 UI 상태는 카드가 소유한다(메뉴 열림 / 편집 중 / 삭제 확인 중).
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tint = FRESHNESS_STYLE[freshness(item.expiresAt)];

  const closeAll = () => {
    setMenuOpen(false);
    setEditing(false);
    setConfirmDelete(false);
  };

  if (editing) {
    return (
      <Card radius="3xl" className="gap-4 px-5 py-5">
        <Text className="text-sm font-semibold text-ink">{item.name} 수정</Text>
        <IngredientForm
          options={options}
          initial={{
            name: item.name,
            category: item.category,
            storage: item.storage,
            quantityNote: item.quantityNote ?? '',
          }}
          submitLabel="저장"
          onCancel={closeAll}
          onSubmit={async (v) => {
            await onUpdate(v);
            closeAll();
          }}
        />
      </Card>
    );
  }

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <View className="flex-row items-center gap-3">
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
          onPress={() => {
            setMenuOpen((v) => !v);
            setConfirmDelete(false);
          }}
          hitSlop={10}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-sand"
        >
          <Text className="text-lg leading-none text-ink-soft">⋯</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View className="flex-row gap-2 border-t border-line pt-3">
          <MenuButton label="다 먹음" onPress={onConsume} />
          <MenuButton
            label="수정"
            onPress={() => {
              setEditing(true);
              setMenuOpen(false);
            }}
          />
          {confirmDelete ? (
            <MenuButton label="정말 삭제" danger onPress={onDelete} />
          ) : (
            <MenuButton label="삭제" danger onPress={() => setConfirmDelete(true)} />
          )}
        </View>
      ) : null}
    </Card>
  );
}

function MenuButton({
  label,
  danger = false,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-xl border py-2 active:opacity-70 ${
        danger ? 'border-peach-soft bg-peach-soft' : 'border-line bg-sand'
      }`}
    >
      <Text className={`text-sm font-medium ${danger ? 'text-peach' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

/** 카테고리 필터 칩 — 전체 + 데이터에 존재하는 분류만 (settings/memory 화면과 같은 패턴). */
function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${active ? 'bg-lavender' : 'border border-line bg-white'}`}
    >
      <Text className={`text-sm ${active ? 'font-semibold text-white' : 'text-ink-soft'}`}>
        {label}
      </Text>
    </Pressable>
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
function AddForm({ options, onAdd }: { options: InventoryOptionsType; onAdd: AddHandler }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button label="+ 재료 직접 추가" variant="secondary" onPress={() => setOpen(true)} />;
  }

  return (
    <Card radius="3xl" className="px-5 py-5">
      <IngredientForm
        options={options}
        submitLabel="추가"
        onCancel={() => setOpen(false)}
        onSubmit={async (v) => {
          const patch = toPatch(v);
          await onAdd([
            {
              name: patch.name,
              category: patch.category,
              storage: patch.storage,
              ...(patch.quantityNote ? { quantityNote: patch.quantityNote } : {}),
            },
          ]);
          setOpen(false);
        }}
      />
    </Card>
  );
}

type AddHandler = ReturnType<typeof useInventory>['add'];

export default function FridgeScreen() {
  // 재고는 전역 진실원천 — 이 화면은 구독만 하고, mutation 도 Provider 함수로 위임한다.
  const { items, options, isLoading, error, consume, update, remove, restore, add } =
    useInventory();
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState<string>('ALL'); // 'ALL' | 카테고리 value

  async function handleConsume(item: IngredientType) {
    setUndo({ id: item.id, name: item.name });
    await consume(item.id);
  }

  async function handleUndo() {
    if (!undo) return;
    const { id } = undo;
    setUndo(null);
    await restore(id);
  }

  // 데이터에 실제로 있는 분류만 칩으로 (options 순서 유지 — 빈 필터 방지).
  const presentCategories = useMemo(() => {
    const have = new Set(items.map((i) => i.category));
    return (options?.categories ?? []).filter((c) =>
      have.has(c.value as IngredientType['category']),
    );
  }, [items, options]);

  // 필터 중이던 분류를 다 비우면(소비·삭제) 칩이 사라진다 — 그 땐 전체로 취급해 빈 화면을 막는다.
  // 상태(filter)를 직접 되돌리지 않고 파생값으로만 처리한다(effect 내 setState 금지 규칙 준수).
  const activeFilter =
    filter === 'ALL' || presentCategories.some((c) => c.value === filter) ? filter : 'ALL';
  // items 는 Provider 가 이미 임박순으로 유지한다.
  const visible = activeFilter === 'ALL' ? items : items.filter((i) => i.category === activeFilter);

  return (
    <Screen scroll edges={['top']} contentClassName="gap-5 px-6 py-6">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-ink">내 냉장고</Text>
        <Text className="text-sm text-ink-soft">
          채팅으로 “계란 샀어”라고 말해도 여기 담겨요. ⋯ 를 눌러 수정·삭제해요.
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#A78BFA" className="mt-8" />
      ) : (
        <>
          {undo ? <UndoBanner name={undo.name} onUndo={handleUndo} /> : null}

          {/* 분류 필터 — 재료가 두 종류 이상일 때만 (한 종류면 필터가 무의미) */}
          {presentCategories.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 pr-6"
            >
              <FilterChip
                label="전체"
                active={activeFilter === 'ALL'}
                onPress={() => setFilter('ALL')}
              />
              {presentCategories.map((c) => (
                <FilterChip
                  key={c.value}
                  label={`${CATEGORY_EMOJI[c.value] ?? ''} ${c.label}`.trim()}
                  active={activeFilter === c.value}
                  onPress={() => setFilter(c.value)}
                />
              ))}
            </ScrollView>
          ) : null}

          {items.length === 0 ? (
            <Text className="mt-6 text-center text-ink-faint">
              아직 담긴 재료가 없어요.{'\n'}장 보고 와서 “뭐뭐 샀어”라고 말해보세요.
            </Text>
          ) : (
            <View className="gap-3">
              {options
                ? visible.map((item) => (
                    <IngredientCard
                      key={item.id}
                      item={item}
                      options={options}
                      onConsume={() => handleConsume(item)}
                      onUpdate={(v) => update(item.id, toPatch(v))}
                      onDelete={() => remove(item.id)}
                    />
                  ))
                : null}
            </View>
          )}

          {options ? <AddForm options={options} onAdd={add} /> : null}
        </>
      )}

      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
    </Screen>
  );
}
