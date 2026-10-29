import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { IngredientEditDialog, Screen, Sheet, toPatch, type FormValues } from '@/components';
import { useInventory } from '@/context/inventory';
import { ADD_METHODS, type AddMethod } from '@/lib/addMethods';
import { expiryLabel, freshness, FRESHNESS_STYLE } from '@/lib/expiry';
import type { IngredientType } from '@companion/types';

const PLACEHOLDER = '#A79C98'; // ink-faint — TextInput 은 placeholder 색을 별도로 받는다
const ICON_COLOR = '#716865'; // ink-soft — Ionicons 는 className 으로 색을 못 받는다

const SHEET_SHADOW = {
  shadowColor: '#2B2726',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: -4 },
  elevation: 6,
};

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

/** 검색 비교용 — 대소문자·공백 무시. */
function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function IngredientRow({
  item,
  isFirst,
  onConsume,
  onEdit,
  onDelete,
}: {
  item: IngredientType;
  isFirst: boolean;
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
    <View
      style={{
        paddingVertical: 14,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: '#F4F0ED', // sand — 흰 시트 위의 옅은 구분선
      }}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-sand">
          <Text className="text-lg">{CATEGORY_EMOJI[item.category] ?? '📦'}</Text>
        </View>

        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">{item.name}</Text>
          {item.quantityNote ? (
            <Text className="text-sm text-ink-faint">{item.quantityNote}</Text>
          ) : null}
        </View>
        {tint && label ? (
          <View className={`rounded-full px-2.5 py-0.5 ${tint.bg}`}>
            <Text className={`text-xs font-medium ${tint.text}`}>{label}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            setMenuOpen((v) => !v);
            setConfirmDelete(false);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 메뉴`}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-sand"
        >
          <Text className="text-lg leading-none text-ink-soft">⋯</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View className="mt-3 flex-row gap-2">
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
    </View>
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
      className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : 'border border-line bg-white'}`}
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
        <Text className="text-sm font-semibold text-primary-soft">되돌리기</Text>
      </Pressable>
    </View>
  );
}

/**
 * 재고 추가 방법 선택 바텀시트. + 를 누르면 올라온다.
 * 하단 중앙 FAB 와 같은 세 경로(사진·영수증·직접 입력)를 연다.
 */
function AddMethodSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (method: AddMethod) => void;
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
            onPress={() => onSelect(m)}
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
            {m.ready ? <Text className="text-lg text-primary">›</Text> : null}
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
  const [query, setQuery] = useState('');
  // 추가 흐름: none → (+ 탭) picker(방법 선택 시트) → (직접 입력) /inventory/add 모달 라우트
  const [picking, setPicking] = useState(false);
  // 편집 중인 재료 — 모달은 **화면이 하나만** 들고 있다. 카드마다 두면 재료 수만큼 RN Modal 이
  // 마운트된다(30개면 30개). 카드는 `onEdit` 으로 열어달라고만 요청한다.
  const [editing, setEditing] = useState<IngredientType | null>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [coverHeight, setCoverHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [sheetHeaderHeight, setSheetHeaderHeight] = useState(0);

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
  const needle = normalizeQuery(query);
  const byCategory =
    activeFilter === 'ALL' ? items : items.filter((i) => i.category === activeFilter);
  const visible = needle
    ? byCategory.filter((i) => normalizeQuery(i.name).includes(needle))
    : byCategory;

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-6">
        <Text className="text-2xl font-bold text-ink">내 냉장고</Text>
        {options ? (
          <Pressable
            onPress={() => setPicking(true)}
            hitSlop={8}
            accessibilityLabel="재고 추가"
            className="items-center justify-center"
          >
            <Text className="text-2xl leading-none text-ink">+</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        className="flex-1"
        overScrollMode="always"
        stickyHeaderIndices={[1]}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        snapToOffsets={coverHeight > 0 ? [0, coverHeight] : undefined}
        snapToEnd={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      >
        <Animated.View
          onLayout={(event) => setCoverHeight(event.nativeEvent.layout.height)}
          style={{ transform: [{ translateY: scrollY }] }}
        >
          <View className="gap-3 px-6" style={{ paddingBottom: 32 }}>
            {items.length > 0 ? (
              <View className="flex-row items-center gap-2 rounded-xl bg-sand px-4 py-3">
                <Ionicons name="search" size={18} color={ICON_COLOR} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="재료 검색"
                  placeholderTextColor={PLACEHOLDER}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="재료 검색"
                  className="flex-1 text-base text-ink"
                />
                {query ? (
                  <Pressable
                    onPress={() => setQuery('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="검색어 지우기"
                    className="active:opacity-60"
                  >
                    <Ionicons name="close-circle" size={18} color={ICON_COLOR} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* 분류 필터 — 재료가 두 종류 이상일 때만 (한 종류면 필터가 무의미) */}
            {presentCategories.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
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
          </View>
        </Animated.View>
        <View
          onLayout={(event) => setSheetHeaderHeight(event.nativeEvent.layout.height)}
          className="rounded-t-3xl bg-white px-6 pb-2 pt-3"
          style={SHEET_SHADOW}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
          <Text className="text-sm text-ink-soft">
            재료 <Text className="font-semibold text-ink">{visible.length}</Text>개
          </Text>
        </View>
        <View
          className="bg-white px-6 pb-8"
          style={{ minHeight: Math.max(0, viewportHeight - sheetHeaderHeight) }}
        >
          {undo ? (
            <View className="mb-3">
              <UndoBanner name={undo.name} onUndo={handleUndo} />
            </View>
          ) : null}
          {isLoading ? (
            <ActivityIndicator color="#C94B55" className="mt-8" />
          ) : (
            <>
              {items.length === 0 ? (
                <Text className="mt-6 text-center text-ink-faint">
                  아직 담긴 재료가 없어요.{'\n'}장 보고 와서 “뭐뭐 샀어”라고 말해보세요.
                </Text>
              ) : visible.length === 0 ? (
                <Text className="mt-6 text-center text-ink-faint">
                  {needle ? `‘${query.trim()}’에 맞는 재료가 없어요` : '이 분류에 재료가 없어요'}
                </Text>
              ) : (
                <View>
                  {options
                    ? visible.map((item, index) => (
                        <IngredientRow
                          key={item.id}
                          item={item}
                          isFirst={index === 0}
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
        </View>
      </Animated.ScrollView>

      <AddMethodSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(method) => {
          setPicking(false);
          if (method.key === 'manual') router.push('/inventory/add');
          else router.push(`/inventory/scan?kind=${method.key}`);
        }}
      />

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
