import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type {
  ApplyProposalRequestType,
  ConsumeProposalItemType,
  InventoryProposalType,
} from '@companion/types';

import { Button } from './Button';
import { Card } from './Card';

const PLACEHOLDER = '#A1A1AA';

/** 소비 항목 한 줄 — 남은 양 편집 + "다 먹음" 토글(누르면 remaining=null → 제거). */
function ConfirmItemRow({
  item,
  value,
  onChange,
}: {
  item: ConsumeProposalItemType;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const usedUp = value === null;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-medium text-ink">{item.name}</Text>
        {item.currentQuantityNote ? (
          <Text className="text-xs text-ink-faint">현재 {item.currentQuantityNote}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        <TextInput
          className={`flex-1 rounded-xl px-3 py-2 text-sm ${
            usedUp ? 'bg-line text-ink-faint' : 'bg-sand text-ink'
          }`}
          editable={!usedUp}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder="남은 양 (예: 2개)"
          placeholderTextColor={PLACEHOLDER}
        />
        <Pressable
          onPress={() => onChange(usedUp ? '' : null)}
          className={`rounded-xl border px-3 py-2 ${
            usedUp ? 'border-lavender bg-lavender-soft' : 'border-line bg-white'
          }`}
        >
          <Text
            className={`text-xs font-medium ${usedUp ? 'text-lavender-deep' : 'text-ink-soft'}`}
          >
            다 먹음
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * 소비 "제안" 확인 카드 — 채팅에서 LLM 이 만든 소비 제안을 사용자가 확인·편집 후 반영한다.
 * pending 이면 편집 UI, applied/dismissed 면 결과 칩만. 각 줄은 남은 양을 고치거나 "다 먹음"으로 뺄 수 있다.
 */
export function InventoryConfirmCard({
  proposal,
  onApply,
  onDismiss,
  busy = false,
}: {
  proposal: InventoryProposalType;
  onApply: (items: ApplyProposalRequestType['items']) => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  // 편집값: ingredientId → 남은 양(string) 또는 null(다 씀). 제안값으로 초기화.
  const [edits, setEdits] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(proposal.items.map((it) => [it.ingredientId, it.remaining])),
  );

  if (proposal.status !== 'pending') {
    return (
      <View className="self-start rounded-full bg-sand px-3 py-1">
        <Text className="text-xs font-medium text-ink-soft">
          {proposal.status === 'applied' ? '✓ 재고에 반영했어요' : '취소했어요'}
        </Text>
      </View>
    );
  }

  const submit = () =>
    onApply(
      proposal.items.map((it) => ({
        ingredientId: it.ingredientId,
        // 빈 문자열은 "다 씀"이 아니라 미입력이므로, 안전하게 기존 남은 양 또는 null 로 흐르지 않게 트림 처리
        remaining: normalizeRemaining(edits[it.ingredientId]),
      })),
    );

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <Text className="text-sm font-bold text-ink">🥗 이렇게 정리할까요?</Text>
      <View className="gap-3">
        {proposal.items.map((it) => (
          <ConfirmItemRow
            key={it.ingredientId}
            item={it}
            value={edits[it.ingredientId] ?? null}
            onChange={(v) => setEdits((prev) => ({ ...prev, [it.ingredientId]: v }))}
          />
        ))}
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="취소" variant="secondary" onPress={onDismiss} disabled={busy} />
        </View>
        <View className="flex-1">
          <Button label="확인" onPress={submit} loading={busy} />
        </View>
      </View>
    </Card>
  );
}

/** 편집된 남은 양 정규화 — null(다 씀)은 그대로, 공백뿐이면 "다 씀"으로 본다. */
function normalizeRemaining(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
