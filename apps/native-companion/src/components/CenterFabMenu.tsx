import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ADD_METHODS, type AddMethod } from '@/lib/addMethods';

const FAB_SHADOW = {
  shadowColor: '#7C3AED',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
} as const;

// FAB 바닥 오프셋(insets.bottom 에 더함) — 탭바 위로 살짝 튀어나오게. 기기별 미세조정 지점.
const FAB_BOTTOM = 20;

// 아치 배치 순서 — 가운데(직접 입력)를 가장 높게, 양옆(사진·영수증)을 아래로.
const ARC_ORDER: AddMethod[] = (['photo', 'manual', 'receipt'] as const)
  .map((k) => ADD_METHODS.find((m) => m.key === k))
  .filter((m): m is AddMethod => Boolean(m));

/**
 * 탭바 가운데에 고정된 큰 FAB + 스피드다이얼.
 * +/× 는 **같은 요소 하나**라 열고 닫을 때 위치가 항상 일치한다(별도 × 버튼을 두지 않는다).
 * 열리면 화면을 어둡게 깔고 추가 방법 3개를 아치로 띄운다 — "직접 입력"만 동작(→ /inventory/add).
 * 탭바 가운데 슬롯(quickadd)은 빈 자리만 잡고, 이 오버레이가 그 위에 FAB 를 그린다.
 */
export function CenterFabMenu({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 열려 있을 때 안드로이드 뒤로가기로 닫기 (Modal 의 onRequestClose 대체)
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  return (
    <View pointerEvents="box-none" className="absolute inset-0">
      {open ? <Pressable className="absolute inset-0 bg-black/55" onPress={onClose} /> : null}

      {/* 아치형 3개 — FAB 바로 위에 뜬다 */}
      {open ? (
        <View
          pointerEvents="box-none"
          style={{ bottom: insets.bottom + FAB_BOTTOM + 68 }}
          className="absolute inset-x-0 items-center"
        >
          <View pointerEvents="box-none" className="flex-row items-center gap-8">
            {ARC_ORDER.map((m, i) => (
              <Pressable
                key={m.key}
                disabled={!m.ready}
                onPress={() => {
                  if (!m.ready) return;
                  onClose();
                  if (m.key === 'manual') router.push('/inventory/add');
                  else router.push(`/inventory/scan?kind=${m.key}`);
                }}
                className="w-20 items-center gap-1.5"
                style={{ transform: [{ translateY: i === 1 ? -28 : 6 }] }}
              >
                <View
                  className={`h-14 w-14 items-center justify-center rounded-full ${
                    m.ready ? 'bg-white' : 'bg-white/60'
                  }`}
                  style={FAB_SHADOW}
                >
                  <Text className="text-2xl">{m.emoji}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  className={`text-xs font-medium ${m.ready ? 'text-white' : 'text-white/60'}`}
                >
                  {m.label}
                </Text>
                {m.ready ? null : <Text className="text-[10px] text-white/50">준비 중</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* 항상 같은 자리의 FAB — +/× 토글 (열림 여부와 무관하게 한 요소라 위치가 일치) */}
      <View
        pointerEvents="box-none"
        style={{ bottom: insets.bottom + FAB_BOTTOM }}
        className="absolute inset-x-0 items-center"
      >
        <Pressable
          onPress={onToggle}
          accessibilityLabel={open ? '닫기' : '재고 추가'}
          className="h-14 w-14 items-center justify-center rounded-full bg-lavender"
          style={FAB_SHADOW}
        >
          <Text className="text-3xl leading-none text-white">{open ? '×' : '+'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
