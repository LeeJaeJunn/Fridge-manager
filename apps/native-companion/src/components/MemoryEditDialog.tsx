import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/memory';
import type { MemoryCategoryType, MemoryOptionsType } from '@companion/types';

import { Button } from './Button';
import { Chip } from './Chip';
import { Dialog } from './Dialog';

const PLACEHOLDER = '#A79C98'; // ink-faint — TextInput 은 placeholder 색을 className 으로 못 받는다
const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: { category: MemoryCategoryType | null; content: string };
  options: MemoryOptionsType;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: { category: MemoryCategoryType; content: string }) => Promise<void>;
};

function MemoryEditForm({
  mode,
  initial,
  options,
  busy,
  error,
  onSubmit,
}: Omit<Props, 'visible' | 'onClose'>) {
  const [category, setCategory] = useState(initial.category);
  const [content, setContent] = useState(initial.content);
  const meta = category ? CATEGORY_META[category] : null;
  const examples = category ? options.examples[category] : [];
  const contentChanged = mode === 'create' || content.trim() !== initial.content.trim();
  const contentError =
    contentChanged && content.trim().length > options.limits.contentMax
      ? `${options.limits.contentMax}자 이내로 입력해 주세요.`
      : undefined;
  const disabled =
    !category ||
    !content.trim() ||
    !!contentError ||
    (mode === 'edit' && category === initial.category && content.trim() === initial.content.trim());

  function selectCategory(next: MemoryCategoryType) {
    if (busy || next === category) return;
    // 직접 적은 내용은 유지하되, 이전 분류의 예시가 잘못 저장되지 않게 비운다.
    if (category && options.examples[category].includes(content)) setContent('');
    setCategory(next);
  }

  async function submit() {
    if (busy || disabled || !category) return;
    await onSubmit({ category, content: content.trim() });
  }

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text className="text-xl font-bold text-ink">
          {mode === 'create' ? '기억 추가' : '기억 수정'}
        </Text>
        {mode === 'create' ? (
          <Text className="text-sm text-ink-soft">AI가 추천할 때 참고할 정보를 알려 주세요</Text>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        {CATEGORY_ORDER.map((value) => {
          const tile = CATEGORY_META[value];
          const selected = category === value;
          return (
            <Pressable
              key={value}
              onPress={() => selectCategory(value)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={tile.label}
              style={{ height: 44 }}
              className={`w-[48%] flex-row items-center gap-2 rounded-xl border px-3 ${
                selected ? 'border-primary bg-primary-soft' : 'border-line bg-white active:bg-sand'
              }`}
            >
              <Text className="text-base">{tile.emoji}</Text>
              <Text
                className={`flex-1 text-sm ${selected ? 'font-semibold text-primary-deep' : 'text-ink'}`}
              >
                {tile.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {meta ? (
        <>
          <View className="gap-3">
            <View className="gap-2">
              <Text className="text-sm font-medium text-ink">{meta.label}</Text>
              <Text className="text-xs text-ink-faint">{meta.hint}</Text>
            </View>
            {examples.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {examples.map((example) => (
                  <Chip
                    key={example}
                    label={example}
                    size="sm"
                    selected={content.trim() === example}
                    disabled={busy}
                    onPress={() => setContent(example)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View className="gap-2">
            <Text className="text-xs text-ink-faint">직접 입력</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              editable={!busy}
              className={INPUT}
              maxLength={
                mode === 'edit'
                  ? Math.max(options.limits.contentMax, initial.content.length)
                  : options.limits.contentMax
              }
              placeholder={meta.placeholder}
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="기억할 내용"
            />
            <Text className={`text-xs ${contentError ? 'text-red-500' : 'text-ink-faint'}`}>
              {contentError ?? `${content.length}/${options.limits.contentMax}`}
            </Text>
          </View>

          {category === 'ALLERGY' ? (
            <View className="flex-row gap-2 rounded-xl bg-peach-soft px-4 py-3">
              <Text className="text-sm">⚠️</Text>
              <Text className="flex-1 text-sm text-ink">
                여기 적은 재료는 요리 추천에서 항상 빠져요. 정도의 문제라면 ‘식성’에 적어 주세요.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
      <Button
        label={mode === 'create' ? '저장' : '변경 저장'}
        onPress={submit}
        loading={busy}
        disabled={disabled}
      />
    </View>
  );
}

/** 열 때마다 initial 로 시작하며, 저장 중에는 입력과 닫기를 잠근다. */
export function MemoryEditDialog({ visible, onClose, ...formProps }: Props) {
  return (
    <Dialog
      visible={visible}
      onClose={() => {
        if (!formProps.busy) onClose();
      }}
    >
      {visible ? <MemoryEditForm {...formProps} /> : null}
    </Dialog>
  );
}
