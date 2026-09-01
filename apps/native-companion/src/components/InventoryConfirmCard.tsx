import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type {
  AddProposalItemType,
  ApplyProposalRequestType,
  ConsumeProposalItemType,
  InventoryOptionsType,
  InventoryProposalType,
} from '@companion/types';

import type { ProposalOutcomeType } from '@/lib/messages';
import { applyEdit, toAddInput } from '@/lib/proposal';
import { Button } from './Button';
import { Card } from './Card';
import { IngredientEditDialog } from './IngredientEditDialog';

const PLACEHOLDER = '#A1A1AA';

/**
 * 소비 항목 한 줄 — "다 먹음" 토글 + 남은 양 편집.
 *
 * 토글(`finished`)과 남은 양(`remaining`)은 **별개 값**이다. 예전엔 토글이 `remaining=null` 로
 * 인코딩돼 있어서, 남은 양을 비워두면(= 얼마인지 모름) 자동으로 "다 먹음"이 돼 재료가 사라졌다.
 * 이제 비워두면 **수량을 그대로 둔다**는 뜻이고, 제거는 토글을 켤 때만 일어난다.
 */
function ConsumeRow({
  item,
  finished,
  remaining,
  onChange,
}: {
  item: ConsumeProposalItemType;
  finished: boolean;
  remaining: string;
  onChange: (next: { finished: boolean; remaining: string }) => void;
}) {
  const usedUp = finished;
  const value = remaining;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-medium text-ink">{item.name}</Text>
        {/* "현재"가 아니라 "기존" — 입력칸이 **차감 후** 값이라, 위쪽을 "현재"라고 부르면
            둘 중 어느 게 지금 냉장고에 있는 양인지 읽는 사람이 헷갈린다. */}
        {item.currentQuantityNote ? (
          <Text className="text-xs text-ink-faint">기존 {item.currentQuantityNote}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        {/* 입력칸만 덜렁 있으면 **쓴 양인지 남은 양인지** 알 수가 없다 — 라벨이 그걸 가른다.
            placeholder 로는 부족하다: 값이 채워지는 순간 사라져서, 정작 확인해야 할 때 없다. */}
        <Text className="text-xs text-ink-soft">남은 양</Text>
        <TextInput
          className={`flex-1 rounded-xl px-3 py-2 text-sm ${
            usedUp ? 'bg-line text-ink-faint' : 'bg-sand text-ink'
          }`}
          editable={!usedUp}
          value={value}
          onChangeText={(v) => onChange({ finished, remaining: v })}
          // 비워두면 "수량을 그대로 둔다"는 뜻이다 — 제거는 오른쪽 토글로만 일어난다.
          placeholder="모르면 비워둬요"
          placeholderTextColor={PLACEHOLDER}
        />
        <Pressable
          onPress={() => onChange({ finished: !finished, remaining })}
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
function AddRow({
  item,
  editable,
  onEdit,
  onRemove,
}: {
  item: AddProposalItemType;
  /** options 를 아직 못 받았으면 편집 UI 를 숨긴다(분류·보관 칩을 그릴 수 없다) */
  editable: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const existing = item.merge?.existing;

  return (
    <View className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] text-ink">
            {item.name}
            {item.quantityNote ? (
              <Text className="text-ink-faint"> {item.quantityNote}</Text>
            ) : null}
          </Text>
          {existing ? (
            <Text className="text-xs text-lavender">
              기존 {existing}
              {item.quantityNote ? ` · 추가 후 ${item.quantityNote}` : ''}
            </Text>
          ) : null}
        </View>
        <Text className="text-xs text-ink-faint">{formatExpiry(item)}</Text>
        {editable ? (
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={10}
            accessibilityLabel={`${item.name} 수정·빼기`}
            className="h-6 w-6 items-center justify-center rounded-full active:bg-sand"
          >
            <Text className="text-base leading-none text-ink-soft">⋯</Text>
          </Pressable>
        ) : null}
      </View>

      {menuOpen ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              onEdit();
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

/** 추정 만료일 표기 — 추정치는 "쯤", 사용자가 준 날은 "까지". */
function formatExpiry(item: AddProposalItemType): string {
  const d = new Date(item.estimatedExpiry);
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return item.expirySource === 'ESTIMATED' ? `${label}쯤` : `${label}까지`;
}

/** 카드가 들고 있는 소비 편집값 — 토글과 입력칸이 각각 하나씩. */
type ConsumeEditType = { finished: boolean; remaining: string };

/**
 * 편집된 남은 양 정규화 — 공백뿐이면 `null`(**수량을 그대로 둔다**).
 *
 * ⚠️ 예전엔 공백을 "다 씀"으로 봤다. 그래서 남은 양을 모르는 채 확인하면 재료가 사라졌다.
 * 이제 제거는 `finished` 로만 일어난다.
 */
function normalizeRemaining(v: string): string | null {
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 재고 변경 "제안" 확인 카드 — 채팅에서 LLM 이 만든 소비/추가 제안을 사용자가 확인 후 반영한다.
 * 미처리면 편집 UI(소비=남은 양·다 먹음, 추가=`⋯` 로 수정·빼기), 처리됐으면 결과 칩만.
 *
 * **확인 시 보내는 값이 곧 반영되는 값이다** — 서버는 저장해둔 제안을 다시 읽지 않는다.
 * 모델이 잘못 뽑았을 때 사용자가 "그대로 확인 / 전체 취소" 두 갈래에 갇히지 않게 하려는 것이고,
 * 스캔 확인 화면이 지키는 원칙("오인식은 반드시 있다")과 같다.
 *
 * 처리 여부는 카드가 스스로 알지 못한다 — 짝이 되는 툴 결과가 대화에 있는지로 정해지므로
 * 부모가 `outcome` 으로 알려준다(`outcomesByCallId` 참고).
 */
export function InventoryConfirmCard({
  proposal,
  options,
  outcome = null,
  onApply,
  onDismiss,
  busy = false,
}: {
  proposal: InventoryProposalType;
  /** 분류·보관 선택지 — 추가 항목 수정 모달에 필요. 아직 못 받았으면 편집 UI 를 숨긴다 */
  options: InventoryOptionsType | null;
  /** 이미 처리됐으면 그 결과, 아직이면 null */
  outcome?: ProposalOutcomeType | null;
  onApply: (req: ApplyProposalRequestType) => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const consume = proposal.consume ?? [];

  // 소비 편집값: ingredientId → { 다 씀 여부, 남은 양 }. 제안값으로 초기화.
  // 빈 문자열은 "수량을 모르니 그대로 둔다"는 뜻이고, 제거는 finished 로만 일어난다.
  const [edits, setEdits] = useState<Record<string, ConsumeEditType>>(() =>
    Object.fromEntries(
      consume.map((it) => [
        it.ingredientId,
        { finished: it.finished, remaining: it.remaining ?? '' },
      ]),
    ),
  );
  // 추가 항목은 **목록 자체가 편집 대상**이라(수정·빼기) 값으로 들고 있는다.
  const [add, setAdd] = useState<AddProposalItemType[]>(() => proposal.add ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (outcome) {
    return (
      <View className="self-start rounded-full bg-sand px-3 py-1">
        <Text className="text-xs font-medium text-ink-soft">
          {outcome === 'applied' ? '✓ 재고에 반영했어요' : '취소했어요'}
        </Text>
      </View>
    );
  }

  // 서버는 **여기서 보낸 값만** 반영한다(저장해둔 제안을 다시 읽지 않는다).
  const submit = () =>
    onApply({
      consume: consume.map((it) => {
        const e = edits[it.ingredientId] ?? { finished: it.finished, remaining: '' };
        return {
          ingredientId: it.ingredientId,
          finished: e.finished,
          remaining: e.finished ? null : normalizeRemaining(e.remaining),
        };
      }),
      add: add.map(toAddInput),
    });

  // 추가를 다 빼고 소비도 없으면 반영할 게 없다 — 확인을 막아 "✓ 반영했어요" 가 거짓말이 되는 걸 방지.
  const nothingToApply = consume.length === 0 && add.length === 0;
  const editing = editingIndex === null ? undefined : add[editingIndex];

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <Text className="text-sm font-bold text-ink">🥗 이렇게 정리할까요?</Text>

      {consume.length > 0 ? (
        <View className="gap-3">
          {consume.map((it) => (
            <ConsumeRow
              key={it.ingredientId}
              item={it}
              finished={edits[it.ingredientId]?.finished ?? it.finished}
              remaining={edits[it.ingredientId]?.remaining ?? ''}
              onChange={(next) => setEdits((prev) => ({ ...prev, [it.ingredientId]: next }))}
            />
          ))}
        </View>
      ) : null}

      {add.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-medium text-ink-soft">
            ➕ 냉장고에 넣기{options ? ' · ⋯ 로 수정하거나 뺄 수 있어요' : ''}
          </Text>
          {add.map((it, i) => (
            <AddRow
              key={`${it.name}-${i}`}
              item={it}
              editable={Boolean(options)}
              onEdit={() => setEditingIndex(i)}
              onRemove={() => setAdd((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="취소" variant="secondary" onPress={onDismiss} disabled={busy} />
        </View>
        <View className="flex-1">
          <Button label="확인" onPress={submit} loading={busy} disabled={nothingToApply} />
        </View>
      </View>

      {/* 추가 항목 수정 — 채팅 스트림 한복판이라 인라인 폼 대신 모달로 띄운다(카드가 부풀며 스크롤이 튄다).
          냉장고 탭의 수정과 같은 모달·같은 폼이다. */}
      {options && editing ? (
        <IngredientEditDialog
          visible
          title={`${editing.name} 수정`}
          options={options}
          initial={{
            name: editing.name,
            category: editing.category,
            storage: editing.storage,
            quantityNote: editing.quantityNote ?? '',
            expiresAt: editing.estimatedExpiry,
            expirySource: editing.expirySource,
          }}
          submitLabel="확인"
          onClose={() => setEditingIndex(null)}
          onSubmit={(v) => {
            const at = editingIndex;
            if (at !== null) {
              setAdd((prev) => prev.map((it, j) => (j === at ? applyEdit(it, v) : it)));
            }
            return Promise.resolve();
          }}
        />
      ) : null}
    </Card>
  );
}
