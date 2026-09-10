import { Text } from 'react-native';

import type { InventoryOptionsType } from '@companion/types';

import { Dialog } from './Dialog';
import { IngredientForm, type FormInitialType, type FormValues } from './IngredientForm';

/**
 * 재료 한 건을 고치는 모달 — `Dialog` + `IngredientForm` 조합.
 *
 * **편집 UI 를 여기 한 곳에 모으는 게 목적**이다. 지금은 냉장고 탭이 쓰고, 다음 단계에서 채팅
 * 확인 카드(`InventoryConfirmCard`)의 `add` 줄이 같은 모달을 연다 — 지금 채팅에선 모델이 잘못
 * 뽑은 재료를 **그대로 확인하거나 전체 취소**하는 두 선택지뿐이라, 스캔 화면이 지키는 원칙
 * ("오인식은 반드시 있다")이 채팅에서만 안 지켜지고 있다.
 *
 * 폼이 **열 때마다 새로 마운트**되도록 `visible` 로 감싼다. `IngredientForm` 은 `initial` 을
 * useState 초기값으로만 읽어서, 마운트를 유지하면 다른 재료를 열었을 때 이전 편집값이 남는다.
 */
export function IngredientEditDialog({
  visible,
  title,
  options,
  initial,
  submitLabel = '저장',
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /**
   * 모달 제목 — **무엇을 하는 중인지**(예: "재료 수정")이지 무엇을 고치는 중인지가 아니다.
   * 재료 이름은 `IngredientForm` 이 상단에 크게 들고 있으므로, 여기에 이름을 또 넣으면
   * 같은 이름이 두 줄로 겹친다.
   */
  title: string;
  options: InventoryOptionsType;
  initial?: FormInitialType;
  submitLabel?: string;
  onClose: () => void;
  /** 저장 성공 후 닫는 건 호출자 몫이 아니다 — 여기서 onClose 를 부른다. */
  onSubmit: (v: FormValues) => Promise<void>;
}) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text className="mb-4 text-base font-bold text-ink">{title}</Text>
      {visible ? (
        <IngredientForm
          options={options}
          initial={initial}
          submitLabel={submitLabel}
          onCancel={onClose}
          onSubmit={async (v) => {
            await onSubmit(v);
            onClose();
          }}
        />
      ) : null}
    </Dialog>
  );
}
