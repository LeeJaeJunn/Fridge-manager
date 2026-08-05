import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { scanImage } from '@/api/inventory';
import { Button, Card, Screen } from '@/components';
import { useInventory } from '@/context/inventory';
import { captureForScan, pickForScan } from '@/lib/scan';
import type { AddProposalItemType, ScanKindType } from '@companion/types';

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
 * 영수증·사진 인식 → **확인 후** 저장.
 *
 * 인식 결과를 바로 넣지 않는다 — 오인식이 반드시 있고, 잘못 들어간 재료는 사용자가 알아채기 어렵다
 * (채팅 확인 카드와 같은 방침). 여기선 **뺄 것만 고르고** 저장하며, 세부 수정은 냉장고 화면에서 한다.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { add } = useInventory();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: ScanKindType = params.kind === 'photo' ? 'photo' : 'receipt';
  const copy = COPY[kind];

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AddProposalItemType[] | null>(null);
  /** 제외한 항목의 인덱스 — 이름이 겹칠 수 있어 인덱스로 잡는다 */
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  async function run(source: 'camera' | 'library') {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const image = source === 'camera' ? await captureForScan(kind) : await pickForScan(kind);
      if (!image) return; // 취소했거나 권한 거부 — 조용히 원상태

      const res = await scanImage(kind, image);
      setItems(res.items);
      setExcluded(new Set());
      if (res.items.length === 0) {
        setError('식재료를 찾지 못했어요. 더 밝은 곳에서 다시 찍어보거나 직접 입력해 주세요.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '인식에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  const selected = (items ?? []).filter((_, i) => !excluded.has(i));

  async function save() {
    if (saving || selected.length === 0) return;
    setSaving(true);
    try {
      await add(
        selected.map((it) => ({
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

      {items && items.length > 0 ? (
        <View className="gap-3">
          <Text className="text-sm font-medium text-ink-soft">
            찾은 재료 {items.length}개 · 뺄 것을 눌러서 제외하세요
          </Text>

          <Card className="gap-1 px-2 py-2">
            {items.map((item, i) => {
              const off = excluded.has(i);
              return (
                <Pressable
                  key={`${item.name}-${i}`}
                  onPress={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`flex-row items-center justify-between rounded-2xl px-3 py-3 ${
                    off ? 'bg-sand' : 'bg-white'
                  }`}
                >
                  <View className="flex-1 gap-0.5">
                    <Text
                      className={`text-[15px] font-medium ${off ? 'text-ink-faint line-through' : 'text-ink'}`}
                    >
                      {item.name}
                      {item.quantityNote ? (
                        <Text className="font-normal text-ink-faint"> {item.quantityNote}</Text>
                      ) : null}
                    </Text>
                    <Text className="text-xs text-ink-faint">{expiryLabel(item)}</Text>
                  </View>
                  <Text className={`text-lg ${off ? 'text-ink-faint' : 'text-lavender'}`}>
                    {off ? '＋' : '✓'}
                  </Text>
                </Pressable>
              );
            })}
          </Card>

          <Button
            label={`${selected.length}개 냉장고에 넣기`}
            onPress={() => void save()}
            loading={saving}
            disabled={selected.length === 0}
          />
        </View>
      ) : null}
    </Screen>
  );
}
