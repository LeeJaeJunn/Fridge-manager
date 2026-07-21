import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createCharacter, fetchCharacterOptions } from '@/api/character';
import { Button, ChipGroup, Field, Screen } from '@/components';
import { useCharacter } from '@/context/character';
import type {
  CharacterOptionsType,
  CreateCharacterRequestType,
  SpeechStyleType,
} from '@companion/types';

const STEPS = [
  { title: '조언자를 정해줘', subtitle: '이름과 말투를 정하면 그 톤으로 대화해.' },
  { title: '이제 네 얘기를 해줘', subtitle: '관심사를 기억해뒀다가 추천에 반영할 거야.' },
];

type Form = {
  name: string;
  speechStyle: SpeechStyleType | null;
  userNickname: string;
  interests: string[];
};

const EMPTY: Form = {
  name: '',
  speechStyle: null,
  userNickname: '',
  interests: [],
};

const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';
const PLACEHOLDER = '#A1A1AA'; // ink-faint

/** 문자열 목록 → 칩 옵션 (관심사는 한국어 라벨 자체가 값이다) */
const toOptions = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export default function OnboardingScreen() {
  const { setCharacter } = useCharacter();
  const [options, setOptions] = useState<CharacterOptionsType | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택지(말투/관심사)는 서버가 소유한다 — 화면 진입 시 한 번 받아온다.
  // 이펙트 본문에서 동기 setState 를 하지 않도록(cascading render) 요청만 걸고 결과는 콜백에서 반영한다.
  const loadOptions = useCallback(() => {
    void fetchCharacterOptions()
      .then(setOptions)
      .catch((e: unknown) =>
        setOptionsError(e instanceof Error ? e.message : '선택지를 불러오지 못했습니다'),
      );
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  function retryLoadOptions() {
    setOptionsError(null); // 이벤트 핸들러라 동기 setState 가능 — 에러 화면을 즉시 걷는다
    loadOptions();
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const { speechStyle } = form;
    // 필수값 좁히기 — canProceed 로 이미 막지만 타입상 null 을 배제한다.
    if (submitting || !speechStyle) return;

    setSubmitting(true);
    setError(null);
    try {
      const body: CreateCharacterRequestType = {
        name: form.name.trim(),
        speechStyle,
        // 선택 항목은 비었으면 아예 빼서 보낸다 (서버가 없는 필드는 null 로 둔다)
        ...(form.userNickname.trim() ? { userNickname: form.userNickname.trim() } : {}),
        ...(form.interests.length > 0 ? { interests: form.interests } : {}),
      };
      const created = await createCharacter(body);
      // 게이트 guard 가 뒤집혀 자동으로 홈(탭)으로 전환된다.
      setCharacter(created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '캐릭터 생성에 실패했습니다');
      setSubmitting(false);
    }
  }

  if (optionsError) {
    return (
      <Screen edges={['top', 'bottom']} contentClassName="justify-center gap-4 px-6">
        <Text className="text-center text-ink-soft">{optionsError}</Text>
        <Button label="다시 시도" variant="secondary" onPress={retryLoadOptions} />
      </Screen>
    );
  }

  if (!options) {
    return (
      <Screen edges={['top', 'bottom']} contentClassName="items-center justify-center">
        <ActivityIndicator color="#A78BFA" />
      </Screen>
    );
  }

  // 제한값은 서버가 내려준 것만 쓴다 — 숫자를 여기 직접 쓰면 서버 DTO 와 어긋난다(persona.ts LIMITS 가 출처).
  const { limits } = options;

  const isLast = step === STEPS.length - 1;
  // 스텝별 필수값 — 채워야 '다음'이 열린다 (마지막 스텝은 전부 선택이라 항상 열림)
  const canProceed = [form.name.trim().length > 0 && Boolean(form.speechStyle), true][step];

  return (
    <Screen edges={['top', 'bottom']} contentClassName="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 뒤로 + 진행 표시 */}
        <View className="flex-row items-center gap-3 px-6 pb-4 pt-2">
          {step > 0 ? (
            <Pressable onPress={() => setStep(step - 1)} hitSlop={12}>
              <Text className="text-xl text-ink">←</Text>
            </Pressable>
          ) : (
            <View className="w-5" />
          )}
          <View className="flex-row gap-1.5">
            {STEPS.map((s, i) => (
              <View
                key={s.title}
                className={`h-1.5 rounded-full ${i === step ? 'w-5 bg-lavender' : 'w-1.5 bg-line'}`}
              />
            ))}
          </View>
        </View>

        <ScrollView contentContainerClassName="gap-6 px-6 pb-6" keyboardShouldPersistTaps="handled">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-ink">{STEPS[step].title}</Text>
            <Text className="text-ink-soft">{STEPS[step].subtitle}</Text>
          </View>

          {/* 1. 조언자 기본 — 이름·말투·호칭 */}
          {step === 0 && (
            <>
              <Field label="이름">
                <TextInput
                  className={INPUT}
                  value={form.name}
                  onChangeText={(v) => set('name', v)}
                  placeholder="예: 루나"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={limits.nameMax}
                  returnKeyType="done"
                />
              </Field>
              <Field label="말투">
                <ChipGroup
                  options={options.speechStyles}
                  value={form.speechStyle}
                  onChange={(v) => set('speechStyle', v as SpeechStyleType)}
                />
              </Field>
              <Field label="날 뭐라고 부를까? (선택)">
                <TextInput
                  className={INPUT}
                  value={form.userNickname}
                  onChangeText={(v) => set('userNickname', v)}
                  placeholder="예: ○○님, 오빠"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={limits.userNicknameMax}
                  returnKeyType="done"
                />
              </Field>
            </>
          )}

          {/* 2. 유저 관심사 → 컴패니언의 첫 기억 */}
          {step === 1 && (
            <Field label="관심사 (선택)" hint="고른 관심사를 컴패니언이 기억해둬.">
              <ChipGroup
                options={toOptions(options.interests)}
                values={form.interests}
                onChange={(v) => set('interests', v)}
                max={limits.interestsMax}
              />
            </Field>
          )}
        </ScrollView>

        <View className="gap-2 px-6 pb-4">
          {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
          {isLast ? (
            <Button label="시작하기" onPress={handleSubmit} loading={submitting} />
          ) : (
            <Button label="다음" onPress={() => setStep(step + 1)} disabled={!canProceed} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
