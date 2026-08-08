import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { scanImage } from '@/api/inventory';
import { Button, Card, IngredientForm, Screen, toPatch, type FormValues } from '@/components';
import { useInventory } from '@/context/inventory';
import { captureForScan, pickForScan } from '@/lib/scan';
import type { AddProposalItemType, InventoryOptionsType, ScanKindType } from '@companion/types';

const COPY: Record<ScanKindType, { title: string; hint: string; capture: string }> = {
  receipt: {
    title: '영수증으로 넣기',
    hint: '장 본 영수증을 찍으면 식재료만 골라 담을게요.',
    capture: '영수증 찍기',
  },
  photo: {
    title: '사진으로 넣기',
    hint: '냉장고 안을 찍으면 보이는 재료를 담을게요.',
    capture: '사진 찍기',
  },
};

/** 만료일 표시 — 추정치는 "쯤"으로 흐린다(서버 expirySource 를 그대로 따른다). */
function expiryLabel(item: AddProposalItemType): string {
  const d = new Date(item.estimatedExpiry);
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return item.expirySource === 'ESTIMATED' ? `${label}쯤` : `${label}까지`;
}

/**
 * 큰 글씨에 쓸 수량 — **이번에 산 양**.
 * 확인 화면의 목적이 "영수증에서 제대로 읽었나" 검증이라 합계보다 구매량이 주인공이다.
 * (실제 저장되는 건 `quantityNote`(합계)이고, 그 근거는 아래 작은 글씨가 설명한다)
 */
function purchasedLabel(item: AddProposalItemType): string | undefined {
  return item.merge?.added ?? item.quantityNote;
}

/** 이미 있는 재료일 때만 — "기존 4개 · 추가 후 14개" */
function mergeLabel(item: AddProposalItemType): string | null {
  const existing = item.merge?.existing;
  if (!existing) return null;
  return item.quantityNote ? `기존 ${existing} · 추가 후 ${item.quantityNote}` : `기존 ${existing}`;
}

/** 제안 한 줄 — 냉장고 카드와 같은 ⋯ 메뉴(수정/빼기) 패턴. UI 상태는 행이 소유한다. */
function ProposalRow({
  item,
  options,
  onEdit,
  onRemove,
}: {
  item: AddProposalItemType;
  options: InventoryOptionsType;
  onEdit: (v: FormValues) => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const merge = mergeLabel(item);

  if (editing) {
    return (
      <View className="gap-3 border-b border-line px-3 py-4">
        <Text className="text-sm font-semibold text-ink">{item.name} 수정</Text>
        <IngredientForm
          options={options}
          initial={{
            name: item.name,
            category: item.category,
            storage: item.storage,
            quantityNote: item.quantityNote ?? '',
          }}
          submitLabel="확인"
          onCancel={() => setEditing(false)}
          onSubmit={(v) => {
            onEdit(v);
            setEditing(false);
            return Promise.resolve();
          }}
        />
      </View>
    );
  }

  return (
    <View className="border-b border-line px-3 py-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-medium text-ink">
            {item.name}
            {purchasedLabel(item) ? (
              <Text className="font-normal text-ink-faint"> {purchasedLabel(item)}</Text>
            ) : null}
          </Text>
          {merge ? <Text className="text-xs text-lavender">{merge}</Text> : null}
          <Text className="text-xs text-ink-faint">{expiryLabel(item)}</Text>
        </View>

        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          hitSlop={10}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-sand"
        >
          <Text className="text-lg leading-none text-ink-soft">⋯</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View className="flex-row gap-2 pt-3">
          <Pressable
            onPress={() => {
              setEditing(true);
              setMenuOpen(false);
            }}
            className="flex-1 items-center rounded-xl bg-sand py-2"
          >
            <Text className="text-xs font-medium text-ink-soft">수정</Text>
          </Pressable>
          <Pressable onPress={onRemove} className="flex-1 items-center rounded-xl bg-sand py-2">
            <Text className="text-xs font-medium text-red-500">빼기</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 영수증·사진 인식 → **확인 후** 저장.
 *
 * 인식 결과를 바로 넣지 않는다 — 오인식이 반드시 있고, 잘못 들어간 재료는 사용자가 알아채기 어렵다
 * (채팅 확인 카드와 같은 방침). 여기서 빼거나 고친 뒤 저장한다.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { add, options } = useInventory();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: ScanKindType = params.kind === 'photo' ? 'photo' : 'receipt';
  const copy = COPY[kind];

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AddProposalItemType[] | null>(null);

  async function run(source: 'camera' | 'library') {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const image = source === 'camera' ? await captureForScan(kind) : await pickForScan(kind);
      if (!image) return; // 취소했거나 권한 거부 — 조용히 원상태

      const res = await scanImage(kind, image);
      setItems(res.items);
      if (res.items.length === 0) {
        setError('식재료를 찾지 못했어요. 더 밝은 곳에서 다시 찍어보거나 직접 입력해 주세요.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '인식에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  /**
   * 수정 — 사용자가 고친 값이 곧 저장될 값이다.
   * 수량을 직접 고쳤으면 합산 근거(`merge`)는 더 이상 그 숫자를 설명하지 못하므로 함께 지운다.
   */
  function editAt(index: number, v: FormValues) {
    const patch = toPatch(v);
    setItems((prev) =>
      (prev ?? []).map((it, i) =>
        i === index
          ? {
              ...it,
              name: patch.name ?? it.name,
              category: patch.category ?? it.category,
              storage: patch.storage ?? it.storage,
              quantityNote: patch.quantityNote,
              merge: undefined,
            }
          : it,
      ),
    );
  }

  const list = items ?? [];

  async function save() {
    if (saving || list.length === 0) return;
    setSaving(true);
    try {
      await add(
        list.map((it) => ({
          name: it.name,
          category: it.category,
          storage: it.storage,
          ...(it.quantityNote ? { quantityNote: it.quantityNote } : {}),
          // 사용자가 준 표기일(USER)만 그대로 넘긴다. 추정치는 서버가 다시 추정한다.
          ...(it.expirySource === 'USER' ? { expiresAt: it.estimatedExpiry } : {}),
        })),
      );
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요');
      setSaving(false);
    }
  }

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-4 px-6 py-6">
      <View className="gap-1">
        <Text className="text-xl font-bold text-ink">{copy.title}</Text>
        <Text className="text-sm text-ink-soft">{copy.hint}</Text>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label={copy.capture} onPress={() => void run('camera')} disabled={busy} />
        </View>
        <View className="flex-1">
          <Button
            label="앨범에서 고르기"
            variant="secondary"
            onPress={() => void run('library')}
            disabled={busy}
          />
        </View>
      </View>

      {busy ? (
        <Card className="items-center gap-2 py-8">
          <ActivityIndicator color="#8B5CF6" />
          <Text className="text-sm text-ink-soft">재료를 읽는 중이에요…</Text>
        </Card>
      ) : null}

      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}

      {options && list.length > 0 ? (
        <View className="gap-3">
          <Text className="text-sm font-medium text-ink-soft">
            찾은 재료 {list.length}개 · ⋯ 로 수정하거나 뺄 수 있어요
          </Text>

          <Card className="px-2 py-1">
            {list.map((item, i) => (
              <ProposalRow
                key={`${item.name}-${i}`}
                item={item}
                options={options}
                onEdit={(v) => editAt(i, v)}
                onRemove={() => setItems((prev) => (prev ?? []).filter((_, j) => j !== i))}
              />
            ))}
          </Card>

          <Button
            label={`${list.length}개 냉장고에 넣기`}
            onPress={() => void save()}
            loading={saving}
          />
        </View>
      ) : null}
    </Screen>
  );
}
