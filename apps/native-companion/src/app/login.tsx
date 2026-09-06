import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';

import {
  resetPassword,
  sendResetCode,
  sendSignupCode,
  verifyResetCode,
  verifySignupCode,
} from '@/api/auth';
import { SocialCancelledError } from '@/api/social';
import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/**
 * 카카오 심볼(말풍선). 원본이 652×600 이라 작게 그려도 안 뭉갠다.
 *
 * **버튼 자체는 공용 `Button` 이 그린다**(`variant="kakao"`). 예전엔 카카오가 배포한 버튼
 * 이미지를 통째로 썼는데, 가로를 늘리면 **흐릿하게 깨졌고** 옆의 "이메일로 시작하기" 버튼과
 * 높이·글자 크기가 안 맞았다. 가이드가 요구하는 건 컨테이너 색·라벨 색·심볼·문구지 이미지
 * 파일 자체가 아니라, 직접 그리면 둘 다 풀린다.
 * https://developers.kakao.com/docs/ko/kakaologin/design-guide
 */
const KAKAO_SYMBOL = require('../../assets/images/kakao_login/kakao_symbol.png') as number;

/**
 * 랜딩의 두 버튼 높이. `size="sm"`(`py-2`)보다 크고 `md`(`py-4`)보다 작은 자리라 여기서 덮어쓴다.
 * **두 버튼이 반드시 같아야 해서 상수로 둔다** — 한쪽만 고치면 나란히 선 둘이 어긋난다.
 */
const LANDING_BUTTON = 'py-3.5';

/** 눈 아이콘 색 — `tailwind.config.js` 의 `ink.soft`. 아이콘은 className 으로 색을 못 받는다. */
const ICON_COLOR = '#6E6E78';

/**
 * `landing` = 로그인 수단을 고르는 첫 화면.
 *
 * 예전엔 이메일 폼이 곧 첫 화면이었는데, 그러면 **이메일이 기본이고 카카오는 곁다리**로 보인다.
 * 둘은 대등한 선택지라 고르는 단계를 앞에 둔다. 소셜을 더 붙일 때도 여기만 늘어난다.
 */
type Mode = 'landing' | 'login' | 'signup' | 'reset';

/**
 * 이메일 인증을 거치는 3단계. **가입과 비밀번호 재설정이 이 구조를 공유**한다 —
 * 서버에서도 둘이 같은 `EmailVerification` 흐름(발송 → 확인 → 증표)을 타고 `purpose` 만 다르다.
 * 화면도 같은 이유로 한 벌이고, 문구와 마지막 호출만 갈린다.
 */
type Step = 'email' | 'code' | 'password';

/** 3단계를 타는 모드 = 가입·재설정. `login` 은 한 화면에 다 있다. */
type SteppedMode = 'signup' | 'reset';

const STEP_TITLE: Record<SteppedMode, Record<Step, string>> = {
  signup: { email: '회원가입', code: '인증번호 확인', password: '거의 다 됐어요' },
  reset: { email: '비밀번호 재설정', code: '인증번호 확인', password: '새 비밀번호' },
};

const STEP_HINT: Record<SteppedMode, Record<Step, string>> = {
  signup: {
    email: '이메일로 인증번호를 보내드릴게요.',
    code: '', // 이메일 주소를 넣어야 해서 렌더에서 만든다
    password: '비밀번호만 정하면 끝이에요.',
  },
  reset: {
    email: '가입하신 이메일로 인증번호를 보내드릴게요.',
    code: '',
    password: '새로 쓸 비밀번호를 정해 주세요.',
  },
};

/** 로그인 / 회원가입 / 비밀번호 재설정. 성공하면 _layout 게이트가 자동으로 다음 화면으로 보낸다. */
export default function LoginScreen() {
  const { login, signup, loginWithKakao } = useAuth();
  const [mode, setMode] = useState<Mode>('landing');
  const [step, setStep] = useState<Step>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  /**
   * 비밀번호 확인. **서버로 보내지 않는다** — 두 값이 같은지는 앱만 알면 되고,
   * 서버가 받아봐야 검증할 의미가 없다(공격자는 같은 값 두 개를 보낸다).
   *
   * 재설정 흐름이 생긴 뒤로도 남겨둔다. 오타를 내면 그 비밀번호로는 못 들어가고,
   * 재설정을 한 번 더 돌아야 한다 — 그 왕복을 막는 게 이 칸이다.
   */
  const [passwordConfirm, setPasswordConfirm] = useState('');
  /**
   * 마스킹 해제 — **오타를 실제로 잡는 건 두 번 치는 것보다 눈으로 보는 것**이다.
   *
   * 토글이 아니라 **누르고 있는 동안만** 풀린다. 손을 떼면 바로 가려지니 화면을 켜둔 채
   * 자리를 비워도 비밀번호가 남지 않는다.
   */
  const [showPassword, setShowPassword] = useState(false);

  /** verify 가 준 증표 — 이게 있어야 가입·재설정이 된다 */
  const [verificationToken, setVerificationToken] = useState('');
  /**
   * 재전송까지 남은 초. **서버가 준 `retryAfterSec` 로 시작한다** — 앱이 60을 박아두면
   * 서버 정책을 바꿨을 때 어긋나서 "재전송 가능"으로 보이는데 429 를 맞는다.
   */
  const [cooldown, setCooldown] = useState(0);
  /** 코드 자리수도 서버가 준다 (입력칸 maxLength + 자동 제출 기준) */
  const [codeDigits, setCodeDigits] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 실패가 아닌 안내 (예: 재설정 완료 → 새 비밀번호로 로그인하라는 말) */
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  /** 3단계를 타는 중인가 — 화면 구조 분기는 전부 이걸 본다(문구만 위 둘로 가른다) */
  const isStepped = isSignup || isReset;

  // 1초마다 감소. effect 본문이 아니라 타이머 콜백에서 setState 하므로 cascading-render 규칙에 안 걸린다.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /** 실패해도 화면이 멈추지 않게 공통으로 감싼다 */
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await fn();
    } catch (e) {
      // 소셜 로그인 취소는 실패가 아니라 사용자의 선택이다 — 빨간 글씨를 띄우지 않는다.
      if (e instanceof SocialCancelledError) return;
      setError(e instanceof Error ? e.message : '문제가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 1단계: 이메일 → 인증번호 발송 ──
  // 서버가 조건을 반대로 본다: 가입은 **이미 있으면** 409, 재설정은 **없으면** 404 ·
  // 카카오 계정이면 409. 어느 쪽이든 그 메시지가 아래 빨간 글씨로 그대로 뜬다.
  const requestCode = () =>
    run(async () => {
      const res = await (isReset ? sendResetCode({ email }) : sendSignupCode({ email }));
      setCodeDigits(res.codeDigits);
      setCooldown(res.retryAfterSec);
      setCode('');
      setStep('code');
    });

  // ── 2단계: 코드 확인 → 증표 획득 ──
  // ⚠️ 용도가 갈린 엔드포인트를 쓴다 — 가입용 코드로 비밀번호를 바꾸지 못하게 서버가 `purpose`
  //    로 막고 있어서, 여기서 잘못 부르면 "코드가 맞는데 안 된다"가 된다.
  const submitCode = (value: string) =>
    run(async () => {
      const res = await (isReset
        ? verifyResetCode({ email, code: value })
        : verifySignupCode({ email, code: value }));
      setVerificationToken(res.verificationToken);
      setStep('password');
    });

  // 다 채우면 바로 확인한다 (버튼을 한 번 더 누르게 하지 않는다)
  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    setCode(digits);
    if (digits.length === codeDigits && !submitting) void submitCode(digits);
  };

  /** 폼 초기화 + 모드 전환. 진행 중이던 인증 상태를 전부 버린다(옛 증표가 남으면 어긋난다). */
  // 아래 뒤로가기 effect 가 부르므로 참조를 고정한다 — 안 그러면 렌더마다 리스너가 재등록된다.
  // ⚠️ `email` 은 일부러 남긴다 — 재설정을 마치고 로그인으로 돌아올 때 다시 치게 하지 않는다.
  const resetForm = useCallback((next: Mode) => {
    setMode(next);
    setStep('email');
    setCode('');
    setPassword('');
    setPasswordConfirm('');
    setShowPassword(false);
    setVerificationToken('');
    setCooldown(0);
    setError(null);
    setNotice(null);
  }, []);

  // ── 3단계: 비밀번호 → 가입 또는 재설정 ──
  const submitFinal = () =>
    run(async () => {
      if (isReset) {
        await resetPassword({ email, password, verificationToken });
        // ⚠️ **재설정은 세션을 주지 않는다**(서버가 204). 로그인 화면으로 되돌려 새 비밀번호로
        // 직접 들어가게 하는 게 의도다 — 방금 정한 값이 실제로 통하는지 그 자리에서 확인된다.
        resetForm('login');
        setNotice('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.');
        return;
      }
      await signup({ email, password, verificationToken });
    });

  const submitLogin = () => run(async () => login({ email, password }));

  /**
   * 카카오 로그인 — **가입/로그인 모드와 무관하다.** 서버가 신원을 보고 로그인·연결·가입 중
   * 하나로 알아서 처리하므로, 어느 모드에서 눌렀든 결과가 같다.
   */
  const submitKakao = () => run(async () => loginWithKakao());

  const backToEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setError(null);
  }, []);

  /**
   * 한 칸 뒤로. **좌상단 버튼과 안드로이드 하드웨어 버튼이 이 함수 하나를 공유한다** —
   * 예전엔 둘이 따로 있어서 "눈에 보이는 길과 하드웨어 버튼이 같아야 한다"가 지켜지길
   * 바라는 수밖에 없었는데, 이제 구조적으로 같다.
   *
   * 인증번호·비밀번호 단계에서는 랜딩까지 나가지 않고 **이메일 단계로만** 물러난다 —
   * 실수로 눌렀다고 방금 받은 인증까지 날리면 처음부터 다시 해야 한다.
   */
  const goBack = useCallback(() => {
    if (mode !== 'login' && step !== 'email') backToEmail();
    else resetForm('landing');
  }, [mode, step, backToEmail, resetForm]);

  /**
   * 안드로이드 하드웨어 뒤로가기.
   *
   * ⚠️ **이 화면은 라우트가 하나뿐이라 기본 동작이 "앱 종료"다.** 단계 이동을 라우터가 아니라
   * 화면 안 상태(`mode`/`step`)로 하고 있어서, 뒤로가기도 우리가 직접 되돌려 줘야 한다
   * (실제로 "이메일로 시작하기" 후 뒤로가기를 누르면 앱이 꺼졌다).
   * landing 에서는 `false` 를 돌려줘 기본 동작(앱 종료)에 맡긴다.
   */
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'landing') return false;
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [mode, goBack]),
  );

  /** 확인란이 비었으면 아직 안 알려준다 — 치는 중에 빨간 글씨가 뜨면 거슬린다 */
  const mismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  /**
   * 주 버튼 위에 놓이는 **보조 이동 링크**들.
   *
   * ⚠️ 로그인이 아닌 모드에도 "로그인" 하나는 반드시 남긴다 — 예전엔 "이미 계정이 있어요"
   * 버튼이 그 길이었는데, 그걸 없애면서 링크가 대신 받는다. 없으면 가입 도중에 마음이 바뀌었을 때
   * 좌상단 뒤로가기로 랜딩까지 나갔다 다시 들어와야 한다.
   */
  const links =
    mode === 'login'
      ? [
          { label: '회원가입', onPress: () => resetForm('signup') },
          { label: '비밀번호 재설정', onPress: () => resetForm('reset') },
        ]
      : [{ label: '로그인', onPress: () => resetForm('login') }];

  const canSubmit = (() => {
    if (submitting) return false;
    if (!isStepped) return email.trim().length > 0 && password.length > 0;
    if (step === 'email') return email.trim().length > 0;
    if (step === 'code') return code.length === codeDigits;
    return password.length > 0 && password === passwordConfirm;
  })();

  // ── 수단 고르는 첫 화면 ──
  // 폼이 아예 없어서 아래 본 화면과 구조가 많이 다르다 — 한 return 안에서 분기하면 조건이
  // 겹겹이 쌓이므로 여기서 끊는다. (훅은 위에서 전부 호출된 뒤라 조건부 훅이 아니다)
  if (mode === 'landing') {
    return (
      <Screen contentClassName="justify-center gap-10 px-6">
        <View className="items-center gap-2">
          <Text className="text-3xl font-bold text-ink">Companion</Text>
          <Text className="text-center text-ink-soft">냉장고에 뭐가 있는지 기억해 드릴게요.</Text>
        </View>

        <View className="gap-3">
          <Button
            label="이메일로 시작하기"
            radius="soft"
            size="sm"
            className={LANDING_BUTTON}
            disabled={submitting}
            onPress={() => setMode('login')}
          />
          <Button
            label="카카오로 시작하기"
            variant="kakao"
            icon={KAKAO_SYMBOL}
            radius="soft"
            size="sm"
            className={LANDING_BUTTON}
            disabled={submitting}
            onPress={submitKakao}
          />
          {error && <Text className="text-center text-sm text-red-500">{error}</Text>}
        </View>
      </Screen>
    );
  }

  const steppedMode: SteppedMode = isReset ? 'reset' : 'signup';

  return (
    <Screen>
      {/* 헤더 — 채팅 화면(`conversation/[id]`)과 같은 자리·같은 높이지만 **제목이 가운데**다.
          제목이 여기 올라오면서 본문은 위에서부터 흐른다(예전엔 세로 중앙 정렬이었다). */}

      <View className="flex-row items-center px-4 pb-2 pt-6">
        <Pressable
          onPress={goBack}
          // 아이콘만 있는 버튼은 손가락보다 작다 — 여백을 눌러도 눌리게 hitSlop 을 준다.
          hitSlop={12}
          className="w-10 py-1"
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Ionicons name="chevron-back" size={24} color={ICON_COLOR} />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-semibold text-ink">
          {isStepped ? STEP_TITLE[steppedMode][step] : '로그인'}
        </Text>
        {/* 오른쪽 균형추 — 뒤로가기와 **같은 폭**이라야 제목이 진짜 화면 가운데에 온다.
            없으면 제목이 뒤로가기 폭만큼 오른쪽으로 밀린다. */}
        <View className="w-10" />
      </View>

      <View className="gap-6 px-6 pt-2">
        <Text className="text-ink-soft">
          {!isStepped
            ? '다시 만나서 반가워요.'
            : step === 'code'
              ? `${email} 로 보낸 번호를 입력해 주세요.`
              : STEP_HINT[steppedMode][step]}
        </Text>

        <View className="gap-3">
          {/* 이메일 — 인증이 끝난 뒤에는 감춘다(바꾸려면 뒤로 가야 증표와 어긋나지 않는다) */}
          {(!isStepped || step === 'email') && (
            <Field
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          {isStepped && step === 'code' && (
            <>
              <Field
                label="인증번호"
                value={code}
                onChangeText={onCodeChange}
                placeholder={'0'.repeat(codeDigits)}
                keyboardType="number-pad"
                maxLength={codeDigits}
                autoFocus
              />
              <View className="flex-row justify-between">
                <Text className="text-sm text-ink-faint" onPress={backToEmail}>
                  이메일 다시 입력
                </Text>
                <Text
                  className={cooldown > 0 ? 'text-sm text-ink-faint' : 'text-sm text-lavender'}
                  onPress={cooldown > 0 || submitting ? undefined : requestCode}
                >
                  {cooldown > 0 ? `${cooldown}초 후 재전송` : '인증번호 재전송'}
                </Text>
              </View>
            </>
          )}

          {(!isStepped || step === 'password') && (
            <Field
              label={isReset ? '새 비밀번호' : '비밀번호'}
              // 눈은 새로 정하는 자리에만 붙인다 — 로그인은 이미 아는 값을 치는 거라 볼 이유가 적고,
              // 어깨너머로 노출될 여지만 는다.
              onHoldReveal={isStepped ? setShowPassword : undefined}
              value={password}
              onChangeText={setPassword}
              placeholder="8자 이상"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!isStepped || !showPassword}
              autoFocus={isStepped}
            />
          )}

          {isStepped && step === 'password' && (
            <>
              <Field
                label={isReset ? '새 비밀번호 확인' : '비밀번호 확인'}
                // ⚠️ 어느 쪽 눈을 누르든 **두 칸이 함께** 풀린다. 이 칸의 존재 이유가 "두 값이
                // 같은가"를 확인하는 것이라, 하나만 보이면 기억에 의존해 비교해야 해서 반쪽이 된다.
                // 잠깐만 보이는 방식이라 이렇게 해도 노출 위험은 거의 안 는다.
                onHoldReveal={setShowPassword}
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="한 번 더 입력해 주세요"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
              />
              {mismatch && (
                <Text className="text-sm text-red-500">비밀번호가 일치하지 않아요.</Text>
              )}
            </>
          )}

          {/* 모드 전환은 **버튼이 아니라 링크**다. 예전엔 "계정 만들기"가 secondary 버튼이라
            "로그인"과 나란히 서서 둘이 대등해 보였는데, 지금 하려는 일은 로그인 하나뿐이고
            나머지는 곁길이다. 링크로 낮추면 주 버튼이 혼자 남는다. */}
          <View className="flex-row items-center justify-end gap-3">
            {links.map((l, i) => (
              <Fragment key={l.label}>
                {/* 세로 구분선 — 두 링크가 한 덩어리로 읽히지 않게 가른다 */}
                {i > 0 && <View className="h-3 w-px bg-line" />}
                <Text
                  className="text-sm text-ink-faint"
                  onPress={submitting ? undefined : l.onPress}
                >
                  {l.label}
                </Text>
              </Fragment>
            ))}
          </View>
        </View>

        {notice && <Text className="text-sm text-lavender">{notice}</Text>}
        {error && <Text className="text-sm text-red-500">{error}</Text>}

        <Button
          label={
            !isStepped
              ? '로그인'
              : step === 'email'
                ? '인증번호 받기'
                : step === 'code'
                  ? '확인'
                  : isReset
                    ? '비밀번호 변경'
                    : '가입하기'
          }
          loading={submitting}
          disabled={!canSubmit}
          onPress={
            !isStepped
              ? submitLogin
              : step === 'email'
                ? requestCode
                : step === 'code'
                  ? () => void submitCode(code)
                  : submitFinal
          }
        />
      </View>

      {/* 카카오는 여기 없다 — 수단 고르는 화면에만 둔다. 이메일 가입을 진행 중인 자리에
          다른 수단이 보이면 "하던 걸 버려라"로 읽혀서 헷갈린다.
          랜딩으로 돌아가는 길은 좌상단 뒤로가기가 맡는다. */}
    </Screen>
  );
}

/**
 * 라벨 + 입력 한 쌍 (settings/character 의 입력 스타일과 통일).
 *
 * `onHoldReveal` 을 주면 입력칸 안쪽 오른쪽에 눈 버튼이 붙는다 — **누르고 있는 동안만** true 를
 * 넘겨주고 떼면 false 다. 토글이 아니라서 손을 떼는 순간 다시 가려진다.
 *
 */
function Field({
  label,
  onHoldReveal,
  ...props
}: { label: string; onHoldReveal?: (holding: boolean) => void } & TextInputProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm text-ink-soft">{label}</Text>
      <View>
        <TextInput
          className={`rounded-xl bg-sand px-4 py-3 text-base text-ink ${onHoldReveal ? 'pr-12' : ''}`}
          placeholderTextColor="#A1A1AA"
          {...props}
        />
        {onHoldReveal && (
          <Pressable
            className="absolute bottom-0 right-0 top-0 justify-center px-4"
            onPressIn={() => onHoldReveal(true)}
            onPressOut={() => onHoldReveal(false)}
            // 손가락이 살짝 미끄러져도 안 꺼지게 여유를 준다
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="비밀번호 보기 (누르고 있는 동안)"
          >
            {/* 아이콘은 className 으로 색을 못 받아서 토큰 값을 직접 준다
                (`placeholderTextColor` 를 하드코딩한 것과 같은 사정) — tailwind.config 의 ink.soft */}
            <Ionicons name="eye-outline" size={20} color={ICON_COLOR} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
