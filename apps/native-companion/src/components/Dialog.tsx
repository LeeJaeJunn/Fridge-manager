import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

const ICON_COLOR = '#716865'; // ink-soft — Ionicons 는 className 으로 색을 못 받는다

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 화면 **가운데에 떠오르는** 모달. 내용은 호출자가 채운다.
 *
 * `Sheet`(바텀시트)와 역할이 다르다 — 시트는 "무엇을 할지 고르는" 목록에 맞고(아래에서 올라와
 * 손가락 가까이 붙는다), 이 모달은 **지금 하던 것을 멈추고 한 건을 고쳐야 할 때** 쓴다.
 * 화면 한가운데 뜨는 편집 폼은 원래 화면의 스크롤 위치를 흔들지 않는다는 게 요점이다
 * (채팅 스트림 한복판에서 카드가 부풀어 스크롤이 튀는 걸 막으려고 이 형태를 골랐다).
 *
 * 입력 폼을 담는 게 주 용도라 두 가지를 여기가 떠안는다:
 *  - `KeyboardAvoidingView` — 키보드가 올라오면 폼 아래쪽(저장 버튼)이 가려진다.
 *  - `ScrollView` + `max-h-[85%]` — 내용이 길면(분류·보관 칩 + 유통기한 피커) 화면을 넘긴다.
 *    85%로 묶어 **배경이 늘 조금 보이게** 한다. 전체를 덮으면 모달이 아니라 화면으로 읽힌다.
 *
 * ⚠️ `keyboardShouldPersistTaps="handled"` 가 없으면 키보드가 떠 있을 때 첫 탭이 키보드를 내리는 데만
 * 쓰이고 버튼에 닿지 않는다(= "저장이 한 번에 안 눌림"). 폼을 담는 모달에선 필수다.
 */
export function Dialog({ visible, onClose, children }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      // 가운데 모달은 슬라이드가 아니라 페이드로 뜬다(위치가 안 바뀌므로 미끄러질 방향이 없다).
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-center bg-black/40 px-6"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 배경 — 본체보다 먼저 그려서 뒤에 깔린다. 본체 탭은 여기 닿지 않아 전파 흡수가 필요 없다.
            명시적 닫기 버튼과 라벨이 겹치지 않도록 접근성 트리에서만 숨기며, 배경 탭 동작은 유지한다. */}
        <Pressable className="absolute inset-0" onPress={onClose} accessible={false} />

        <View className="max-h-[85%] rounded-3xl bg-white px-5 py-5">
          {/* 닫기는 ScrollView 밖이다 — 안에 두면 긴 폼(재료 수정)에서 함께 스크롤돼 사라지고,
              절대 위치로 띄우면 내용이 아이콘 아래로 지나가며 겹쳐 읽힌다. */}
          <View className="mb-1 flex-row justify-end">
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="닫기"
            >
              <Ionicons name="close" size={22} color={ICON_COLOR} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="always"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
