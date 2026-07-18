import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { deleteMyCharacter, fetchCharacterOptions, updateCharacter } from '@/api/character';
import { Button, ChipGroup, Field, Screen } from '@/components';
import { useCharacter } from '@/context/character';
import type {
  CharacterOptionsType,
  GenderType,
  RelationshipType,
  SpeechStyleType,
  UpdateCharacterRequestType,
} from '@companion/types';

const INPUT = 'rounded-xl bg-sand px-4 py-3 text-base text-ink';
const PLACEHOLDER = '#A1A1AA'; // ink-faint

const toOptions = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const trimOrNull = (s: string): string | null => s.trim() || null;
/** 성격은 순서가 아니라 구성이 같으면 동일하다고 본다 */
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export default function CharacterSettingsScreen() {
  const router = useRouter();
  const { character, setCharacter } = useCharacter();

  const [options, setOptions] = useState<CharacterOptionsType | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 현재 캐릭터로 폼을 초기화한다 (문자열 입력은 전부 string 으로). 캐릭터는 이 화면 진입 시 고정.
  const [name, setName] = useState(character?.name ?? '');
  const [age, setAge] = useState(character?.age != null ? String(character.age) : '');
  const [gender, setGender] = useState<GenderType | null>(character?.gender ?? null);
  const [relationship, setRelationship] = useState<RelationshipType | null>(
    character?.relationship ?? null,
  );
  const [speechStyle, setSpeechStyle] = useState<SpeechStyleType | null>(
    character?.speechStyle ?? null,
  );
  const [personality, setPersonality] = useState<string[]>(character?.personality ?? []);
  const [job, setJob] = useState(character?.job ?? '');
  const [actingRule, setActingRule] = useState(character?.actingRule ?? '');
  const [userNickname, setUserNickname] = useState(character?.userNickname ?? '');

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
    setOptionsError(null);
    loadOptions();
  }

  async function handleSave() {
    if (!character || saving || !gender || !relationship || !speechStyle) return;
    setSaving(true);
    setError(null);
    try {
      const body: UpdateCharacterRequestType = {
        name: name.trim(),
        gender,
        relationship,
        speechStyle,
        personality,
        age: age ? Number(age) : null,
        job: trimOrNull(job),
        actingRule: trimOrNull(actingRule),
        userNickname: trimOrNull(userNickname),
      };
      const updated = await updateCharacter(body);
      setCharacter(updated); // 홈 인사·프로필 등 전역 즉시 반영
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '수정에 실패했습니다');
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMyCharacter();
      setCharacter(null); // 게이트가 온보딩으로 전환됨
    } catch (e: unknown) {
      Alert.alert('삭제 실패', e instanceof Error ? e.message : '오류');
      setDeleting(false);
    }
  }

  if (optionsError) {
    return (
      <Screen edges={['bottom']} contentClassName="justify-center gap-4 px-6">
        <Text className="text-center text-ink-soft">{optionsError}</Text>
        <Button label="다시 시도" variant="secondary" onPress={retryLoadOptions} />
      </Screen>
    );
  }
  if (!options || !character) {
    return (
      <Screen edges={['bottom']} contentClassName="items-center justify-center">
        <ActivityIndicator color="#A78BFA" />
      </Screen>
    );
  }

  const { limits } = options;
  const ageNum = Number(age);
  const ageValid =
    age.length === 0 ||
    (Number.isInteger(ageNum) && ageNum >= limits.ageMin && ageNum <= limits.ageMax);

  // 바뀐 게 있고, 필수값이 유효할 때만 저장을 연다.
  const changed =
    name.trim() !== character.name ||
    (age ? Number(age) : null) !== character.age ||
    gender !== character.gender ||
    relationship !== character.relationship ||
    speechStyle !== character.speechStyle ||
    trimOrNull(job) !== character.job ||
    trimOrNull(actingRule) !== character.actingRule ||
    trimOrNull(userNickname) !== character.userNickname ||
    !sameSet(personality, character.personality);
  const canSave = changed && name.trim().length > 0 && personality.length > 0 && ageValid;

  return (
    <Screen edges={['bottom']} contentClassName="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="gap-6 px-6 py-6" keyboardShouldPersistTaps="handled">
          <Field label="이름">
            <TextInput
              className={INPUT}
              value={name}
              onChangeText={setName}
              placeholder="예: 루나"
              placeholderTextColor={PLACEHOLDER}
              maxLength={limits.nameMax}
              returnKeyType="done"
            />
          </Field>

          <Field
            label="나이"
            error={ageValid ? undefined : `${limits.ageMin}~${limits.ageMax} 사이로 입력해줘`}
          >
            <TextInput
              className={INPUT}
              value={age}
              onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
              placeholder="비워두면 나이 없음"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="number-pad"
              maxLength={String(limits.ageMax).length}
            />
          </Field>

          <Field label="성별">
            <ChipGroup
              options={options.genders}
              value={gender}
              onChange={(v) => setGender(v as GenderType)}
            />
          </Field>

          <Field label="관계">
            <ChipGroup
              options={options.relationships}
              value={relationship}
              onChange={(v) => setRelationship(v as RelationshipType)}
            />
          </Field>

          <Field label="말투">
            <ChipGroup
              options={options.speechStyles}
              value={speechStyle}
              onChange={(v) => setSpeechStyle(v as SpeechStyleType)}
            />
          </Field>

          <Field
            label="성격"
            hint={`최대 ${limits.personalityMax}개 (${personality.length}/${limits.personalityMax})`}
          >
            <ChipGroup
              options={toOptions(options.personalityTraits)}
              values={personality}
              onChange={setPersonality}
              max={limits.personalityMax}
            />
          </Field>

          <Field label="직업">
            <TextInput
              className={INPUT}
              value={job}
              onChangeText={setJob}
              placeholder="비워두면 직업 없음"
              placeholderTextColor={PLACEHOLDER}
              maxLength={limits.jobMax}
              returnKeyType="done"
            />
          </Field>

          <Field label="행동 규칙" hint={`${actingRule.length}/${limits.actingRuleMax}`}>
            <TextInput
              className={`${INPUT} h-24`}
              value={actingRule}
              onChangeText={setActingRule}
              placeholder="예: 내 하루를 자주 물어봐줘"
              placeholderTextColor={PLACEHOLDER}
              maxLength={limits.actingRuleMax}
              multiline
              textAlignVertical="top"
            />
          </Field>

          <Field label="날 부르는 호칭">
            <TextInput
              className={INPUT}
              value={userNickname}
              onChangeText={setUserNickname}
              placeholder="예: 오빠, ○○님, 자기야"
              placeholderTextColor={PLACEHOLDER}
              maxLength={limits.userNicknameMax}
              returnKeyType="done"
            />
          </Field>

          {/* 관심사는 캐릭터가 아니라 "나에 대한 기억"이라 메모리 화면에서 관리한다 */}
          <Text className="text-xs text-ink-faint">
            관심사는 프로필 &gt; AI 메모리 관리에서 바꿀 수 있어.
          </Text>

          {error ? <Text className="text-sm text-red-500">{error}</Text> : null}

          {/* ⚠️ 테스트용: 캐릭터를 지워 온보딩을 다시 보기 위함 */}
          <Button
            label="캐릭터 삭제 (테스트용)"
            variant="danger"
            className="mt-2"
            onPress={handleDelete}
            loading={deleting}
          />
        </ScrollView>

        <View className="px-6 pb-4">
          <Button label="저장" onPress={handleSave} disabled={!canSave} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
