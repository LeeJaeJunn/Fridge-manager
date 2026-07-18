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
  GenderType,
  RelationshipType,
  SpeechStyleType,
} from '@companion/types';

const STEPS = [
  { title: '누군지 알려줘', subtitle: '함께할 친구의 이름과 모습을 정해줘.' },
  { title: '나랑 어떤 사이야?', subtitle: '관계에 따라 말투와 거리감이 달라져.' },
  { title: '어떤 성격이야?', subtitle: '성격이 대화의 톤을 만들어.' },
  { title: '이제 네 얘기를 해줘', subtitle: '관심사를 기억해뒀다가 먼저 꺼내줄 거야.' },
];

type Form = {
  name: string;
  gender: GenderType | null;
  /** TextInput 이라 문자열로 받고 제출할 때 숫자로 바꾼다 */
  age: string;
  relationship: RelationshipType | null;
  speechStyle: SpeechStyleType | null;
  userNickname: string;
  personality: string[];
  job: string;
  actingRule: string;
  interests: string[];
};

const EMPTY: Form = {
  name: '',
  gender: null,
  age: '',
  relationship: null,
  speechStyle: null,
  userNickname: '',
  personality: [],
  job: '',
  actingRule: '',
  interests: [],
};

const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';
const PLACEHOLDER = '#A1A1AA'; // ink-faint

/** 문자열 목록 → 칩 옵션 (성격·관심사는 한국어 라벨 자체가 값이다) */
const toOptions = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export default function OnboardingScreen() {
  const { setCharacter } = useCharacter();
  const [options, setOptions] = useState<CharacterOptionsType | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택지(성별/관계/말투/성격/관심사)는 서버가 소유한다 — 화면 진입 시 한 번 받아온다.
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
    const { gender, relationship, speechStyle } = form;
    // 필수값 좁히기 — canProceed 로 이미 막지만 타입상 null 을 배제한다.
    if (submitting || !gender || !relationship || !speechStyle) return;

    setSubmitting(true);
    setError(null);
    try {
      const age = Number(form.age);
      const body: CreateCharacterRequestType = {
        name: form.name.trim(),
        gender,
        relationship,
        speechStyle,
        personality: form.personality,
        // 선택 항목은 비었으면 아예 빼서 보낸다 (서버가 없는 필드는 null 로 둔다)
        ...(Number.isFinite(age) && age > 0 ? { age } : {}),
        ...(form.job.trim() ? { job: form.job.trim() } : {}),
        ...(form.actingRule.trim() ? { actingRule: form.actingRule.trim() } : {}),
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

  // 나이는 선택이라 비어도 되지만, 채웠다면 서버와 같은 범위여야 한다.
  const ageNum = Number(form.age);
  const ageValid =
    form.age.length === 0 ||
    (Number.isInteger(ageNum) && ageNum >= limits.ageMin && ageNum <= limits.ageMax);

  const isLast = step === STEPS.length - 1;
  // 스텝별 필수값 — 채워야 '다음'이 열린다 (마지막 스텝은 전부 선택이라 항상 열림)
  const canProceed = [
    form.name.trim().length > 0 && Boolean(form.gender) && ageValid,
    Boolean(form.relationship) && Boolean(form.speechStyle),
    form.personality.length > 0,
    true,
  ][step];

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

          {/* 1. 정체성 */}
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
              <Field label="성별">
                <ChipGroup
                  options={options.genders}
                  value={form.gender}
                  onChange={(v) => set('gender', v as GenderType)}
                />
              </Field>
              <Field
                label="나이 (선택)"
                error={ageValid ? undefined : `${limits.ageMin}~${limits.ageMax} 사이로 입력해줘`}
              >
                <TextInput
                  className={INPUT}
                  value={form.age}
                  onChangeText={(v) => set('age', v.replace(/[^0-9]/g, ''))}
                  placeholder="예: 24"
                  placeholderTextColor={PLACEHOLDER}
                  keyboardType="number-pad"
                  maxLength={String(limits.ageMax).length}
                />
              </Field>
            </>
          )}

          {/* 2. 관계 */}
          {step === 1 && (
            <>
              <Field label="관계">
                <ChipGroup
                  options={options.relationships}
                  value={form.relationship}
                  onChange={(v) => set('relationship', v as RelationshipType)}
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
                  placeholder="예: 오빠, ○○님, 자기야"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={limits.userNicknameMax}
                  returnKeyType="done"
                />
              </Field>
            </>
          )}

          {/* 3. 성격 */}
          {step === 2 && (
            <>
              <Field
                label="성격"
                hint={`최대 ${limits.personalityMax}개 (${form.personality.length}/${limits.personalityMax})`}
              >
                <ChipGroup
                  options={toOptions(options.personalityTraits)}
                  values={form.personality}
                  onChange={(v) => set('personality', v)}
                  max={limits.personalityMax}
                />
              </Field>
              <Field label="직업 (선택)">
                <TextInput
                  className={INPUT}
                  value={form.job}
                  onChangeText={(v) => set('job', v)}
                  placeholder="예: 디자이너"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={limits.jobMax}
                  returnKeyType="done"
                />
              </Field>
              <Field
                label="행동 규칙 (선택)"
                hint={`${form.actingRule.length}/${limits.actingRuleMax}`}
              >
                <TextInput
                  className={`${INPUT} h-24`}
                  value={form.actingRule}
                  onChangeText={(v) => set('actingRule', v)}
                  placeholder="예: 내 하루를 자주 물어봐줘"
                  placeholderTextColor={PLACEHOLDER}
                  maxLength={limits.actingRuleMax}
                  multiline
                  textAlignVertical="top"
                />
              </Field>
            </>
          )}

          {/* 4. 유저 관심사 → 컴패니언의 첫 기억 */}
          {step === 3 && (
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
