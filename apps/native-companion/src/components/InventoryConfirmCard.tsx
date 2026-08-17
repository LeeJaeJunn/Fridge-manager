import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type {
  AddProposalItemType,
  ApplyProposalRequestType,
  ConsumeProposalItemType,
  InventoryProposalType,
} from '@companion/types';

import type { ProposalOutcomeType } from '@/lib/messages';
import { Button } from './Button';
import { Card } from './Card';

const PLACEHOLDER = '#A1A1AA';

/** 소비 항목 한 줄 — 남은 양 편집 + "다 먹음" 토글(누르면 remaining=null → 제거). */
function ConsumeRow({
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
 * 추가 항목 한 줄 — 확인-only(읽기전용). 이름·수량 + 추정 만료일.
 *
 * 이미 있던 재료면 **합산 근거를 한 줄 더** 보여준다(`기존 2개 → 추가 후 4개`). 최종 수량만 뜨면
 * 사용자는 그 숫자가 맞는지 판단할 근거가 없다 — 합산을 하는 건 서버가 아니라 모델이라
 * ("기존 5개 + 2개 → 7개") 틀릴 수 있고, 틀린 재고는 알아채기 어렵다. 스캔 확인 화면과 같은 이유·같은 문구다.
 */
function AddRow({ item }: { item: AddProposalItemType }) {
  const existing = item.merge?.existing;
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] text-ink">
          {item.name}
          {item.quantityNote ? <Text className="text-ink-faint"> {item.quantityNote}</Text> : null}
        </Text>
        {existing ? (
          <Text className="text-xs text-lavender">
            기존 {existing}
            {item.quantityNote ? ` · 추가 후 ${item.quantityNote}` : ''}
          </Text>
        ) : null}
      </View>
      <Text className="text-xs text-ink-faint">{formatExpiry(item)}</Text>
    </View>
  );
}

/** 추정 만료일 표기 — 추정치는 "쯤", 사용자가 준 날은 "까지". */
function formatExpiry(item: AddProposalItemType): string {
  const d = new Date(item.estimatedExpiry);
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return item.expirySource === 'ESTIMATED' ? `${label}쯤` : `${label}까지`;
}

/** 편집된 남은 양 정규화 — null(다 씀)은 그대로, 공백뿐이면 "다 씀"으로 본다. */
function normalizeRemaining(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 재고 변경 "제안" 확인 카드 — 채팅에서 LLM 이 만든 소비/추가 제안을 사용자가 확인 후 반영한다.
 * 미처리면 편집 UI(소비=남은 양 편집, 추가=확인-only), 처리됐으면 결과 칩만.
 *
 * 처리 여부는 카드가 스스로 알지 못한다 — 짝이 되는 툴 결과가 대화에 있는지로 정해지므로
 * 부모가 `outcome` 으로 알려준다(`outcomesByCallId` 참고).
 */
export function InventoryConfirmCard({
  proposal,
  outcome = null,
  onApply,
  onDismiss,
  busy = false,
}: {
  proposal: InventoryProposalType;
  /** 이미 처리됐으면 그 결과, 아직이면 null */
  outcome?: ProposalOutcomeType | null;
  onApply: (items: ApplyProposalRequestType['items']) => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const consume = proposal.consume ?? [];
  const add = proposal.add ?? [];

  // 소비 편집값: ingredientId → 남은 양(string) 또는 null(다 씀). 제안값으로 초기화.
  const [edits, setEdits] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(consume.map((it) => [it.ingredientId, it.remaining])),
  );

  if (outcome) {
    return (
      <View className="self-start rounded-full bg-sand px-3 py-1">
        <Text className="text-xs font-medium text-ink-soft">
          {outcome === 'applied' ? '✓ 재고에 반영했어요' : '취소했어요'}
        </Text>
      </View>
    );
  }

  // 추가는 확인-only 라 편집 없이 서버가 제안 그대로 반영한다 → onApply 는 소비 편집값만 보낸다.
  const submit = () =>
    onApply(
      consume.map((it) => ({
        ingredientId: it.ingredientId,
        remaining: normalizeRemaining(edits[it.ingredientId]),
      })),
    );

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <Text className="text-sm font-bold text-ink">🥗 이렇게 정리할까요?</Text>

      {consume.length > 0 ? (
        <View className="gap-3">
          {consume.map((it) => (
            <ConsumeRow
              key={it.ingredientId}
              item={it}
              value={edits[it.ingredientId] ?? null}
              onChange={(v) => setEdits((prev) => ({ ...prev, [it.ingredientId]: v }))}
            />
          ))}
        </View>
      ) : null}

      {add.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium text-ink-soft">➕ 냉장고에 넣기</Text>
          {add.map((it, i) => (
            <AddRow key={`${it.name}-${i}`} item={it} />
          ))}
        </View>
      ) : null}

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
