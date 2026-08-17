import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import type {
  AddIngredientInputType,
  ExpirySourceType,
  IngredientType,
  InventoryOptionsType,
  UpdateIngredientRequestType,
} from '@companion/types';

import { Button } from './Button';
import { ChipGroup } from './ChipGroup';
import { Field } from './Field';

const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';
const PLACEHOLDER = '#A1A1AA';
const MS_PER_DAY = 86_400_000;

/** 폼이 돌려주는 값 — 추가·수정이 같은 모양을 쓴다. */
export type FormValues = {
  name: string;
  category: string;
  storage: string;
  quantityNote: string;
  /** 사용자가 "기본값"을 끄고 직접 고른 만료일(ISO). 기본값이면 undefined → 서버가 추정한다. */
  expiresAt?: string;
};

/**
 * 폼 초기값 — 값(FormValues)에 더해 **만료일 UI 를 어떻게 시작할지** 정하는 두 필드를 받는다.
 * 수정 경로에서만 의미가 있고, 추가 경로는 통째로 비운다.
 */
export type FormInitialType = Partial<FormValues> & {
  /** 현재 만료일의 출처. `USER` 면 "기본값" 체크를 꺼둔 채 그 날짜로 시작한다 */
  expirySource?: ExpirySourceType;
  /**
   * 추정 기준일(ISO) — 비우면 오늘.
   * 서버는 수정 시 **등록일(addedAt) 기준**으로 재추정하므로(`inventory.service.update`),
   * 여기서도 같은 기준을 써야 화면의 "기본값" 날짜와 실제 저장값이 어긋나지 않는다.
   */
  addedAt?: string;
};

/**
 * FormValues → `PATCH /inventory/:id` 본문.
 * 사용자가 날짜를 직접 골랐을 때만 `expiresAt` 을 싣는다 — 서버가 그때 `USER` 로 승격한다.
 */
export const toPatch = (v: FormValues): UpdateIngredientRequestType => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  // 빈 문자열이면 서버가 미변경으로 처리 — v1 은 수량 비우기를 지원하지 않는다.
  quantityNote: v.quantityNote,
  ...(v.expiresAt ? { expiresAt: v.expiresAt } : {}),
});

/**
 * FormValues → `POST /inventory` 항목.
 * patch 와 달리 **빈 값은 아예 빼고 보낸다** — 추가는 "미변경" 이라는 개념이 없어서,
 * 빈 문자열을 실어 보내면 없는 수량 메모가 빈 값으로 저장된다.
 */
export const toAddInput = (v: FormValues): AddIngredientInputType => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  ...(v.quantityNote ? { quantityNote: v.quantityNote } : {}),
  ...(v.expiresAt ? { expiresAt: v.expiresAt } : {}),
});

/** "YYYY년 M월 D일" — 연도까지 항상 표시. */
function formatKoreanDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 날짜만 의미 있으므로 정오로 고정해 UTC 변환 시 날짜가 밀리는 것을 막는다. */
function toDateOnlyIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
}

/**
 * 재료 입력 필드 묶음 — **추가·수정·스캔 확인이 모두 이 한 벌을 쓴다.**
 *
 * 껍데기(전체 화면 라우트 / 모달 / 인라인)만 호출자가 고르고 안의 필드는 여기 하나뿐이다.
 * 예전엔 `showExpiry` 로 유통기한 섹션을 추가 경로에서만 켰는데, 그 결과 같은 "재료 한 건"을
 * 다루면서 화면마다 고칠 수 있는 것이 달랐다(수정에서는 유통기한을 못 고침). 지금은 항상 노출하고,
 * 수정 경로는 현재 값(`initial.expiresAt`/`expirySource`)으로 시작한다.
 */
export function IngredientForm({
  options,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  options: InventoryOptionsType;
  initial?: FormInitialType;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'ETC');
  const [storage, setStorage] = useState(initial?.storage ?? 'FRIDGE');
  const [quantityNote, setQuantityNote] = useState(initial?.quantityNote ?? '');
  const [saving, setSaving] = useState(false);

  // 유통기한 — 기본값(자동 추정) 켜짐이 기본. 끄면 사용자가 날짜를 직접 고른다.
  // 단 이미 사용자가 확정한 값(USER)을 고치는 중이면, 그 날짜를 그대로 이어받아 체크를 꺼둔 채 시작한다
  // (켜둔 채 시작하면 화면이 "추정으로 되돌리겠다"는 뜻이 돼 저장 시 사용자가 정한 날짜가 사라진다).
  const pickedExpiry = initial?.expirySource === 'USER' ? initial.expiresAt : undefined;
  const [useDefaultExpiry, setUseDefaultExpiry] = useState(!pickedExpiry);
  const [customDate, setCustomDate] = useState<Date | null>(
    pickedExpiry ? new Date(pickedExpiry) : null,
  );
  const [showPicker, setShowPicker] = useState(false); // Android 다이얼로그 토글

  // 서버 추정과 같은 표로 기본 소비기한 일수 → 만료일 미리 계산 (분류·보관이 바뀌면 갱신).
  const estimateDays = options.shelfLife.days[storage]?.[category] ?? options.shelfLife.defaultDays;
  const estimateBase = initial?.addedAt;
  const estimatedDate = useMemo(() => {
    // 등록일 기준(수정) 또는 오늘(추가) — 서버가 재추정할 때 쓰는 기준과 같아야 한다.
    const base = estimateBase ? new Date(estimateBase) : new Date();
    base.setHours(12, 0, 0, 0); // 정오 고정으로 UTC 변환 시 날짜 밀림 방지
    return new Date(base.getTime() + estimateDays * MS_PER_DAY);
  }, [estimateDays, estimateBase]);
  const effectiveDate = customDate ?? estimatedDate;

  function onChangeDate(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event.type === 'set' && date) setCustomDate(date);
  }

  async function submit() {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        storage,
        quantityNote: quantityNote.trim(),
        expiresAt: useDefaultExpiry ? undefined : toDateOnlyIso(effectiveDate),
      });
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

      <Field label="유통기한">
        <Pressable
          onPress={() => setUseDefaultExpiry((v) => !v)}
          hitSlop={6}
          className="flex-row items-center gap-2 py-1"
        >
          <View
            className={`h-5 w-5 items-center justify-center rounded-md border ${
              useDefaultExpiry ? 'border-lavender bg-lavender' : 'border-line bg-white'
            }`}
          >
            {useDefaultExpiry ? (
              <Text className="text-xs font-bold leading-none text-white">✓</Text>
            ) : null}
          </View>
          <Text className="text-sm text-ink">기본값 ({estimateDays}일)</Text>
        </Pressable>

        {useDefaultExpiry ? (
          <Text className="text-sm text-ink-faint">{formatKoreanDate(estimatedDate)}</Text>
        ) : Platform.OS === 'ios' ? (
          <View className="items-start">
            <DateTimePicker
              value={effectiveDate}
              mode="date"
              locale="ko-KR"
              onChange={onChangeDate}
            />
          </View>
        ) : (
          <>
            <Pressable onPress={() => setShowPicker(true)} className={INPUT}>
              <Text className="text-base text-ink">{formatKoreanDate(effectiveDate)}</Text>
            </Pressable>
            {showPicker ? (
              <DateTimePicker value={effectiveDate} mode="date" onChange={onChangeDate} />
            ) : null}
          </>
        )}
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
