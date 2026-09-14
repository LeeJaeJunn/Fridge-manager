import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, IngredientEditDialog, Screen, Sheet, toPatch, type FormValues } from '@/components';
import { useInventory } from '@/context/inventory';
import { ADD_METHODS } from '@/lib/addMethods';
import { expiryLabel, freshness, FRESHNESS_STYLE } from '@/lib/expiry';
import type { IngredientType } from '@companion/types';

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

function IngredientCard({
  item,
  onConsume,
  onEdit,
  onDelete,
}: {
  item: IngredientType;
  onConsume: () => void;
  /** 편집 모달은 화면이 하나만 들고 있다 — 카드는 열어달라고만 요청한다(아래 FridgeScreen 참고). */
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  // 카드 안의 UI 상태는 카드가 소유한다(메뉴 열림 / 삭제 확인 중).
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 미설정이면 배지를 아예 안 그린다 — 회색 배지가 전 재료에 붙으면 "오늘까지"가 그 사이에 묻힌다.
  const level = freshness(item.expiresAt);
  const tint = level ? FRESHNESS_STYLE[level] : null;
  const label = expiryLabel(item);

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
          {tint && label ? (
            <View className={`self-start rounded-full px-2.5 py-0.5 ${tint.bg}`}>
              <Text className={`text-xs font-medium ${tint.text}`}>{label}</Text>
            </View>
          ) : null}
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
              onEdit();
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

/**
 * 재고 추가 방법 선택 바텀시트. + 를 누르면 올라온다.
 * 지금은 "직접 입력"만 동작하고 사진·영수증은 자리만 잡아둔다(레이아웃 최종형 → 나중엔 핸들러만).
 */
function AddMethodSheet({
  visible,
  onClose,
  onManual,
}: {
  visible: boolean;
  onClose: () => void;
  onManual: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="mb-3 gap-0.5 px-1">
        <Text className="text-lg font-bold text-ink">재고 추가</Text>
        <Text className="text-sm text-ink-soft">어떻게 넣을까요?</Text>
      </View>

      <View className="gap-2">
        {ADD_METHODS.map((m) => (
          <Pressable
            key={m.key}
            disabled={!m.ready}
            onPress={() => {
              if (m.key === 'manual') onManual();
            }}
            className={`flex-row items-center gap-3 rounded-2xl border border-line px-4 py-3.5 ${
              m.ready ? 'active:bg-sand' : 'opacity-55'
            }`}
          >
            <Text className="text-2xl">{m.emoji}</Text>
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-semibold text-ink">{m.label}</Text>
                {!m.ready ? (
                  <View className="rounded-full bg-sand px-2 py-0.5">
                    <Text className="text-[11px] font-medium text-ink-faint">준비 중</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs text-ink-faint">{m.desc}</Text>
            </View>
            {m.ready ? <Text className="text-lg text-lavender">›</Text> : null}
          </Pressable>
        ))}
      </View>

      {/* 주 입력은 채팅 — 상기시키는 힌트 */}
      <Text className="mt-4 text-center text-xs text-ink-faint">
        💬 채팅으로 “계란 샀어”라고 말해도 담겨요
      </Text>
    </Sheet>
  );
}

export default function FridgeScreen() {
  const router = useRouter();
  // 재고는 전역 진실원천 — 이 화면은 구독만 하고, mutation 도 Provider 함수로 위임한다.
  const { items, options, isLoading, error, consume, update, remove, restore } = useInventory();
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState<string>('ALL'); // 'ALL' | 카테고리 value
  // 추가 흐름: none → (+ 탭) picker(방법 선택 시트) → (직접 입력) /inventory/add 모달 라우트
  const [picking, setPicking] = useState(false);
  // 편집 중인 재료 — 모달은 **화면이 하나만** 들고 있다. 카드마다 두면 재료 수만큼 RN Modal 이
  // 마운트된다(30개면 30개). 카드는 `onEdit` 으로 열어달라고만 요청한다.
  const [editing, setEditing] = useState<IngredientType | null>(null);

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
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-2xl font-bold text-ink">내 냉장고</Text>
          <Text className="text-sm text-ink-soft">
            채팅으로 “계란 샀어”라고 말해도 여기 담겨요. ⋯ 를 눌러 수정·삭제해요.
          </Text>
        </View>
        {options ? (
          <Pressable
            onPress={() => setPicking(true)}
            hitSlop={8}
            accessibilityLabel="재고 추가"
            // className="h-10 w-10 items-center justify-center rounded-full bg-lavender active:bg-lavender-deep"
            className="items-center justify-center"
          >
            <Text className="text-2xl leading-none text-ink">+</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 추가 방법 선택 시트 (+ 탭) → "직접 입력" 고르면 모달 라우트로 이동 */}
      <AddMethodSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onManual={() => {
          setPicking(false);
          router.push('/inventory/add');
        }}
      />

      {isLoading ? (
        <ActivityIndicator color="#8B5CF6" className="mt-8" />
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
                      onConsume={() => handleConsume(item)}
                      onEdit={() => setEditing(item)}
                      onDelete={() => remove(item.id)}
                    />
                  ))
                : null}
            </View>
          )}
        </>
      )}

      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}

      {/* 재료 수정 모달 — 목록 위로 떠서 스크롤 위치를 흔들지 않는다. 채팅 확인 카드도 같은 모달을 연다.
          유통기한은 현재 값으로 시작한다(미설정/기본값/직접 중 지금 상태). `addedAt` 을 함께 넘기는 건
          "기본값"의 기준일이 **구입 시점**이어야 하기 때문이다 — 오늘 기준으로 재면 오래 둔 재료가
          방금 산 것처럼 계산된다. */}
      {options && editing ? (
        <IngredientEditDialog
          visible
          title="재료 수정"
          options={options}
          initial={{
            name: editing.name,
            category: editing.category,
            storage: editing.storage,
            quantityNote: editing.quantityNote ?? '',
            expiresAt: editing.expiresAt,
            expirySource: editing.expirySource,
            addedAt: editing.addedAt,
          }}
          onClose={() => setEditing(null)}
          onSubmit={(v: FormValues) => update(editing.id, toPatch(v))}
        />
      ) : null}
    </Screen>
  );
}
