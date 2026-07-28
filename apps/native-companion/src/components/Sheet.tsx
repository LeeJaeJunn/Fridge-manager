import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 하단에서 올라오는 바텀시트 — 배경(backdrop)을 누르면 닫힌다.
 * RN Modal 기반이라 별도 의존성 없이 슬라이드 인 한다. 내용은 호출자가 채운다.
 * 시트 본체는 흰 표면(카드와 같은 "떠오른" 층), 그 위 배경은 어둡게 깐다.
 */
export function Sheet({ visible, onClose, children }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* 배경 탭 → 닫기 */}
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* 본체 탭은 배경으로 전파되지 않게 흡수한다 */}
        <Pressable className="rounded-t-3xl bg-white px-5 pb-8 pt-3" onPress={() => {}}>
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-line" />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
