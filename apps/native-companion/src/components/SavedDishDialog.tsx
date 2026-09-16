import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { SAVED_DISH_INPUT_LIMITS, type SavedDishDraftType } from '@/lib/saved-dish';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

const PLACEHOLDER = '#A1A1AA'; // ink-faint — TextInput 은 className 으로 placeholder 색을 못 받는다
const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';

type Props = {
  visible: boolean;
  initial: SavedDishDraftType;
  /** 이미 저장된 요리를 열었으면 그 id — null 이면 아직 저장 전이다. */
  savedId: string | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (draft: SavedDishDraftType) => Promise<void>;
  onUnsave: () => Promise<void>;
};

function SavedDishDialogForm({
  initial,
  savedId,
  busy = false,
  onSave,
  onUnsave,
}: Omit<Props, 'visible' | 'onClose'>) {
  const [editing, setEditing] = useState(false);
  const [dishName, setDishName] = useState(initial.dishName);
  const [servingsText, setServingsText] = useState(String(initial.servings));
  const [cookMinutesText, setCookMinutesText] = useState(
    initial.cookMinutes === null ? '' : String(initial.cookMinutes),
  );
  const [ingredients, setIngredients] = useState(() =>
    initial.ingredients.map((ingredient) => ({ ...ingredient })),
  );
  const [steps, setSteps] = useState(() => [...initial.steps]);

  const namedIngredients = ingredients.filter((ingredient) => ingredient.name.trim());
  const saveDisabled = !dishName.trim() || namedIngredients.length === 0;

  async function submit() {
    if (saveDisabled || busy) return;

    const parsedServings = Number.parseInt(servingsText, 10);
    const parsedCookMinutes = Number.parseInt(cookMinutesText, 10);
    await onSave({
      dishName: dishName.trim(),
      servings: Math.max(1, Number.isNaN(parsedServings) ? initial.servings : parsedServings),
      cookMinutes:
        !cookMinutesText.trim() || Number.isNaN(parsedCookMinutes) ? null : parsedCookMinutes,
      ingredients: namedIngredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        amount: ingredient.amount.trim(),
      })),
      steps: steps.map((step) => step.trim()).filter(Boolean),
    });
  }

  if (!editing) {
    return (
      <View className="gap-5">
        <View className="gap-1">
          <Text className="text-xl font-bold text-ink">{dishName}</Text>
          <Text className="text-sm text-ink-soft">
            {servingsText || initial.servings}인분
            {cookMinutesText ? ` · 약 ${cookMinutesText}분` : ''}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-bold text-ink">재료</Text>
          {ingredients.map((ingredient, index) => (
            <View key={`${ingredient.name}-${index}`} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-sm text-ink">{ingredient.name}</Text>
              <Text className="text-sm text-ink-soft">{ingredient.amount}</Text>
            </View>
          ))}
        </View>

        {steps.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-bold text-ink">만드는 법</Text>
            {steps.map((step, index) => (
              <View key={`${step}-${index}`} className="flex-row gap-2">
                <Text className="w-5 text-sm font-semibold text-lavender-deep">{index + 1}.</Text>
                <Text className="flex-1 text-sm leading-5 text-ink">{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="flex-row gap-2">
          {savedId === null ? (
            <>
              <View className="flex-1">
                <Button label="저장" onPress={submit} loading={busy} disabled={saveDisabled} />
              </View>
              <View className="flex-1">
                <Button
                  label="수정"
                  variant="secondary"
                  onPress={() => setEditing(true)}
                  disabled={busy}
                />
              </View>
            </>
          ) : (
            <>
              <View className="flex-1">
                <Button
                  label="수정"
                  variant="secondary"
                  onPress={() => setEditing(true)}
                  disabled={busy}
                />
              </View>
              <View className="flex-1">
                <Button label="저장 해제" variant="danger" onPress={onUnsave} loading={busy} />
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-5">
      <Field label="요리명">
        <TextInput
          value={dishName}
          onChangeText={setDishName}
          maxLength={SAVED_DISH_INPUT_LIMITS.dishNameMax}
          placeholder="요리명"
          placeholderTextColor={PLACEHOLDER}
          className={INPUT}
        />
      </Field>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="인분">
            <TextInput
              value={servingsText}
              onChangeText={setServingsText}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={PLACEHOLDER}
              className={INPUT}
            />
          </Field>
        </View>
        <View className="flex-1">
          <Field label="조리시간(분)">
            <TextInput
              value={cookMinutesText}
              onChangeText={setCookMinutesText}
              keyboardType="number-pad"
              placeholder="미설정"
              placeholderTextColor={PLACEHOLDER}
              className={INPUT}
            />
          </Field>
        </View>
      </View>

      <Field label="재료">
        <View className="gap-2">
          {ingredients.map((ingredient, index) => (
            <View key={index} className="flex-row items-center gap-2">
              <TextInput
                value={ingredient.name}
                onChangeText={(name) =>
                  setIngredients((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name } : item,
                    ),
                  )
                }
                maxLength={SAVED_DISH_INPUT_LIMITS.ingredientNameMax}
                placeholder="재료명"
                placeholderTextColor={PLACEHOLDER}
                className={`${INPUT} flex-1`}
              />
              <TextInput
                value={ingredient.amount}
                onChangeText={(amount) =>
                  setIngredients((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, amount } : item,
                    ),
                  )
                }
                maxLength={SAVED_DISH_INPUT_LIMITS.amountMax}
                placeholder="양"
                placeholderTextColor={PLACEHOLDER}
                className={`${INPUT} w-24`}
              />
              <Pressable
                hitSlop={8}
                onPress={() =>
                  setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
                accessibilityLabel={`${ingredient.name || '빈 재료'} 삭제`}
              >
                <Text className="px-1 text-lg text-ink-faint">✕</Text>
              </Pressable>
            </View>
          ))}
          {ingredients.length < SAVED_DISH_INPUT_LIMITS.ingredientsMax ? (
            <Pressable
              onPress={() => setIngredients((current) => [...current, { name: '', amount: '' }])}
              className="self-start py-1"
            >
              <Text className="text-sm font-semibold text-lavender-deep">+ 재료 추가</Text>
            </Pressable>
          ) : null}
        </View>
      </Field>

      <Field label="만드는 법">
        <View className="gap-2">
          {steps.map((step, index) => (
            <View key={index} className="flex-row items-start gap-2">
              <Text className="w-5 pt-3 text-sm font-semibold text-lavender-deep">
                {index + 1}.
              </Text>
              <TextInput
                value={step}
                onChangeText={(value) =>
                  setSteps((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? value : item)),
                  )
                }
                maxLength={SAVED_DISH_INPUT_LIMITS.stepMax}
                multiline
                placeholder="조리 순서"
                placeholderTextColor={PLACEHOLDER}
                className={`${INPUT} flex-1`}
              />
              <Pressable
                hitSlop={8}
                onPress={() =>
                  setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
                accessibilityLabel={`${index + 1}번 순서 삭제`}
              >
                <Text className="px-1 pt-3 text-lg text-ink-faint">✕</Text>
              </Pressable>
            </View>
          ))}
          {steps.length < SAVED_DISH_INPUT_LIMITS.stepsMax ? (
            <Pressable
              onPress={() => setSteps((current) => [...current, ''])}
              className="self-start py-1"
            >
              <Text className="text-sm font-semibold text-lavender-deep">+ 순서 추가</Text>
            </Pressable>
          ) : null}
        </View>
      </Field>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="저장" onPress={submit} loading={busy} disabled={saveDisabled} />
        </View>
        <View className="flex-1">
          <Button
            label="취소"
            variant="secondary"
            onPress={() => setEditing(false)}
            disabled={busy}
          />
        </View>
      </View>
    </View>
  );
}

/** 저장 전 카드와 저장본을 같은 표면에서 확인·편집하는 모달. */
export function SavedDishDialog({ visible, onClose, ...formProps }: Props) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      {/* initial 은 useState 초깃값으로만 읽으므로, 다른 카드를 열 때마다 폼을 새로 마운트한다. */}
      {visible ? <SavedDishDialogForm {...formProps} /> : null}
    </Dialog>
  );
}
