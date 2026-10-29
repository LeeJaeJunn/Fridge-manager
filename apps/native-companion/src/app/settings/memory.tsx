import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { ApiError } from '@/api/errors';
import {
  createMemory,
  deleteMemory,
  fetchMemories,
  fetchMemoryOptions,
  updateMemory,
} from '@/api/memory';
import { Card, MemoryEditDialog, Screen } from '@/components';
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/memory';
import type { MemoryCategoryType, MemoryOptionsType, MemoryType } from '@companion/types';

const PRIMARY = '#C94B55'; // primary — Ionicons·ActivityIndicator 는 className 색을 못 받는다

/** createdAt → "N일 전"(수정해도 처음 기억한 시점은 유지) */
function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days}일 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours}시간 전`;
  const mins = Math.floor(diff / 60_000);
  if (mins >= 1) return `${mins}분 전`;
  return '방금';
}

/** 필터 칩 — 전체 + 데이터에 존재하는 카테고리만 (빈 필터 방지) */
type Filter = 'ALL' | MemoryCategoryType;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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

function MemoryCard({
  memory,
  onEdit,
  onDelete,
  disabled,
}: {
  memory: MemoryType;
  onEdit?: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const meta = CATEGORY_META[memory.category];
  return (
    <Card radius="3xl" className="flex-row items-start gap-3 px-5 py-4">
      <Pressable
        onPress={onEdit}
        disabled={disabled || !onEdit}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={onEdit ? `${meta.label} 기억 수정` : undefined}
        className="flex-1 flex-row gap-3"
      >
        <View className={`h-10 w-10 items-center justify-center rounded-xl ${meta.iconBg}`}>
          <Text className="text-lg">{meta.emoji}</Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">{meta.label}</Text>
          <Text className="text-[15px] leading-5 text-ink-soft">{memory.content}</Text>
          <Text className="mt-1 text-xs text-ink-faint">{timeAgo(memory.createdAt)}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="기억 삭제"
      >
        <Text className="text-base text-ink-faint">✕</Text>
      </Pressable>
    </Card>
  );
}

export default function MemoryScreen() {
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [options, setOptions] = useState<MemoryOptionsType | null>(null);
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; memory: MemoryType } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchMemories(), fetchMemoryOptions()])
      .then(([nextMemories, nextOptions]) => {
        setMemories(nextMemories);
        setOptions(nextOptions);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete(m: MemoryType) {
    if (saving) return;
    Alert.alert('기억 삭제', `"${m.content}"\n\n이 기억을 지울까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void deleteMemory(m.id).then(load);
        },
      },
    ]);
  }

  function closeDialog() {
    if (saving) return;
    setDialog(null);
    setSaveError(null);
  }

  async function saveMemory(value: { category: MemoryCategoryType; content: string }) {
    if (!dialog || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (dialog.mode === 'create') {
        const created = await createMemory(value);
        setMemories((current) => [created, ...current]);
        if (filter !== 'ALL' && filter !== created.category) setFilter('ALL');
      } else {
        const updated = await updateMemory(dialog.memory.id, {
          ...(value.category !== dialog.memory.category ? { category: value.category } : {}),
          ...(value.content !== dialog.memory.content.trim() ? { content: value.content } : {}),
        });
        setMemories((current) =>
          current.map((memory) => (memory.id === updated.id ? updated : memory)),
        );
      }
      setDialog(null);
    } catch (e: unknown) {
      setSaveError(e instanceof ApiError ? e.message : '저장에 실패했어요');
    } finally {
      setSaving(false);
    }
  }

  // 존재하는 카테고리만 칩으로 (표시 순서 유지)
  const presentCategories = CATEGORY_ORDER.filter((c) => memories.some((m) => m.category === c));
  // 마지막 항목의 삭제·분류 변경으로 사라진 필터는 전체로 보정한다.
  const activeFilter = filter === 'ALL' || presentCategories.includes(filter) ? filter : 'ALL';
  const visible = (
    activeFilter === 'ALL' ? memories : memories.filter((m) => m.category === activeFilter)
  )
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-4 px-6 pb-6 pt-2">
      {options ? (
        <View className="flex-row justify-end">
          <Pressable
            onPress={() => {
              setSaveError(null);
              setDialog({ mode: 'create' });
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="기억 추가"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-sand"
          >
            <Ionicons name="add" size={24} color={PRIMARY} />
          </Pressable>
        </View>
      ) : null}

      {presentCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerClassName="items-center gap-2 pr-6"
        >
          <Chip label="전체" active={activeFilter === 'ALL'} onPress={() => setFilter('ALL')} />
          {presentCategories.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_META[c].label}
              active={activeFilter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color={PRIMARY} />
      ) : memories.length === 0 ? (
        <Text className="mt-8 text-center text-ink-faint">
          아직 기억하는 게 없어요.{'\n'}위의 + 버튼으로 직접 알려주세요.
        </Text>
      ) : (
        <View className="gap-3">
          {visible.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              disabled={saving}
              onEdit={
                options
                  ? () => {
                      setSaveError(null);
                      setDialog({ mode: 'edit', memory: m });
                    }
                  : undefined
              }
              onDelete={() => confirmDelete(m)}
            />
          ))}
        </View>
      )}

      {error && <Text className="text-sm text-red-500">{error}</Text>}
      {options ? (
        <MemoryEditDialog
          visible={dialog !== null}
          mode={dialog?.mode ?? 'create'}
          initial={
            dialog?.mode === 'edit'
              ? { category: dialog.memory.category, content: dialog.memory.content }
              : { category: null, content: '' }
          }
          options={options}
          busy={saving}
          error={saveError}
          onClose={closeDialog}
          onSubmit={saveMemory}
        />
      ) : null}
    </Screen>
  );
}
