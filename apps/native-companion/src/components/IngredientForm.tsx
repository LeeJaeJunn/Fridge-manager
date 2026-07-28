import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import type { IngredientType, InventoryOptionsType } from '@companion/types';

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

/** FormValues → 서버 patch (문자열 값을 도메인 타입으로 좁힌다). expiresAt 은 add 경로에서 별도 처리. */
export const toPatch = (v: FormValues) => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  // 빈 문자열이면 서버가 미변경으로 처리 — v1 은 수량 비우기를 지원하지 않는다.
  quantityNote: v.quantityNote,
});

/** "YYYY년 M월 D일" — 연도까지 항상 표시. */
function formatKoreanDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 날짜만 의미 있으므로 정오로 고정해 UTC 변환 시 날짜가 밀리는 것을 막는다. */
function toDateOnlyIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
}

/** 재료 입력 필드 묶음 — 직접 추가(모달 라우트)와 수정(카드 인라인)이 공유한다. */
export function IngredientForm({
  options,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  showExpiry = false,
}: {
  options: InventoryOptionsType;
  initial?: Partial<FormValues>;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel: () => void;
  /** 유통기한 섹션(기본값 체크 + 날짜 선택)을 노출할지 — 추가 폼에서만 true. */
  showExpiry?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'ETC');
  const [storage, setStorage] = useState(initial?.storage ?? 'FRIDGE');
  const [quantityNote, setQuantityNote] = useState(initial?.quantityNote ?? '');
  const [saving, setSaving] = useState(false);

  // 유통기한 — 기본값(자동 추정) 켜짐이 기본. 끄면 사용자가 날짜를 직접 고른다.
  const [useDefaultExpiry, setUseDefaultExpiry] = useState(true);
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false); // Android 다이얼로그 토글

  // 서버 추정과 같은 표로 기본 소비기한 일수 → 만료일 미리 계산 (분류·보관이 바뀌면 갱신).
  const estimateDays = options.shelfLife.days[storage]?.[category] ?? options.shelfLife.defaultDays;
  const estimatedDate = useMemo(() => {
    const base = new Date(); // 정오 고정으로 UTC 변환 시 날짜 밀림 방지
    base.setHours(12, 0, 0, 0);
    return new Date(base.getTime() + estimateDays * MS_PER_DAY);
  }, [estimateDays]);
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
        expiresAt: showExpiry && !useDefaultExpiry ? toDateOnlyIso(effectiveDate) : undefined,
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

      {showExpiry ? (
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
      ) : null}

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
