import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, useWindowDimensions, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 하단에서 올라오는 바텀시트 — 배경(backdrop)을 누르면 닫힌다.
 * RN Modal의 배경은 즉시 표시하고, 시트 본체만 아래에서 슬라이드 인 한다.
 * 시트 본체는 흰 표면(카드와 같은 "떠오른" 층), 그 위 배경은 어둡게 깐다.
 */
export function Sheet({ visible, onClose, children }: Props) {
  const { height } = useWindowDimensions();
  const [translateY] = useState(() => new Animated.Value(height));

  useEffect(() => {
    translateY.setValue(height);
    if (!visible) return;
    const animation = Animated.timing(translateY, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, height, translateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <Animated.View style={{ transform: [{ translateY }] }}>
          <View className="rounded-t-3xl bg-white px-5 pb-8 pt-3">
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-line" />
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
