import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';

import { sendSignupCode, verifySignupCode } from '@/api/auth';
import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

/** 눈 아이콘 색 — `tailwind.config.js` 의 `ink.soft`. 아이콘은 className 으로 색을 못 받는다. */
const ICON_COLOR = '#6E6E78';

type Mode = 'login' | 'signup';

/**
 * 회원가입 3단계. **인증 후 가입**이라 코드를 맞춘 사람만 3단계에 도달한다.
 * (미인증 유저가 DB 에 안 쌓이는 대신 가입 화면이 길어지는 절충 — 서버 설계와 짝이다)
 */
type Step = 'email' | 'code' | 'password';

const STEP_TITLE: Record<Step, string> = {
  email: '회원가입',
  code: '인증번호 확인',
  password: '거의 다 됐어요',
};

/** 로그인 / 회원가입 화면. 성공하면 _layout 게이트가 자동으로 다음 화면으로 보낸다. */
export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  /**
   * 가입 시 비밀번호 확인. **서버로 보내지 않는다** — 두 값이 같은지는 앱만 알면 되고,
   * 서버가 받아봐야 검증할 의미가 없다(공격자는 같은 값 두 개를 보낸다).
   *
   * 지금 **비밀번호 재설정 흐름이 없어서** 가입 때 오타를 내면 그 계정은 영구히 못 들어간다
   * (이메일도 이미 선점돼 재가입 불가). 그래서 확인란이 편의가 아니라 방어선이다.
   */
  const [passwordConfirm, setPasswordConfirm] = useState('');
  /**
   * 마스킹 해제 — **오타를 실제로 잡는 건 두 번 치는 것보다 눈으로 보는 것**이다.
   *
   * 토글이 아니라 **누르고 있는 동안만** 풀린다. 손을 떼면 바로 가려지니 화면을 켜둔 채
   * 자리를 비워도 비밀번호가 남지 않는다.
   */
  const [showPassword, setShowPassword] = useState(false);

  /** verify 가 준 증표 — 이게 있어야 가입이 된다 */
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

  const isSignup = mode === 'signup';

  // 1초마다 감소. effect 본문이 아니라 타이머 콜백에서 setState 하므로 cascading-render 규칙에 안 걸린다.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /** 실패해도 화면이 멈추지 않게 공통으로 감싼다 */
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setSubmitting(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '문제가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 1단계: 이메일 → 인증번호 발송 ──
  // 이미 가입된 이메일이면 서버가 409 를 주고, 그 메시지가 아래 빨간 글씨로 그대로 뜬다.
  const requestCode = () =>
    run(async () => {
      const res = await sendSignupCode({ email });
      setCodeDigits(res.codeDigits);
      setCooldown(res.retryAfterSec);
      setCode('');
      setStep('code');
    });

  // ── 2단계: 코드 확인 → 증표 획득 ──
  const submitCode = (value: string) =>
    run(async () => {
      const res = await verifySignupCode({ email, code: value });
      setVerificationToken(res.verificationToken);
      setStep('password');
    });

  // 다 채우면 바로 확인한다 (버튼을 한 번 더 누르게 하지 않는다)
  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    setCode(digits);
    if (digits.length === codeDigits && !submitting) void submitCode(digits);
  };

  // ── 3단계: 비밀번호 → 가입 ──
  const submitSignup = () =>
    run(async () => {
      await signup({ email, password, verificationToken });
    });

  const submitLogin = () => run(async () => login({ email, password }));

  /** 모드 전환 — 진행 중이던 인증 상태를 전부 버린다(옛 증표가 남으면 헷갈린다) */
  const toggleMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setStep('email');
    setCode('');
    setPassword('');
    setPasswordConfirm('');
    setShowPassword(false);
    setVerificationToken('');
    setCooldown(0);
    setError(null);
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  /** 확인란이 비었으면 아직 안 알려준다 — 치는 중에 빨간 글씨가 뜨면 거슬린다 */
  const mismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  const canSubmit = (() => {
    if (submitting) return false;
    if (!isSignup) return email.trim().length > 0 && password.length > 0;
    if (step === 'email') return email.trim().length > 0;
    if (step === 'code') return code.length === codeDigits;
    return password.length > 0 && password === passwordConfirm;
  })();

  return (
    <Screen contentClassName="justify-center gap-6 px-6">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">
          {isSignup ? STEP_TITLE[step] : '로그인'}
        </Text>
        <Text className="text-ink-soft">
          {!isSignup
            ? '다시 만나서 반가워요.'
            : step === 'email'
              ? '이메일로 인증번호를 보내드릴게요.'
              : step === 'code'
                ? `${email} 로 보낸 번호를 입력해 주세요.`
                : '비밀번호만 정하면 끝이에요.'}
        </Text>
      </View>

      <View className="gap-3">
        {/* 이메일 — 인증이 끝난 뒤에는 잠근다(바꾸려면 뒤로 가야 증표와 어긋나지 않는다) */}
        {(!isSignup || step === 'email') && (
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

        {isSignup && step === 'code' && (
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

        {(!isSignup || step === 'password') && (
          <Field
            label="비밀번호"
            // 눈은 가입에만 붙인다 — 로그인은 이미 아는 값을 치는 거라 볼 이유가 적고,
            // 어깨너머로 노출될 여지만 는다.
            onHoldReveal={isSignup ? setShowPassword : undefined}
            value={password}
            onChangeText={setPassword}
            placeholder="8자 이상"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!isSignup || !showPassword}
            autoFocus={isSignup}
          />
        )}

        {isSignup && step === 'password' && (
          <>
            <Field
              label="비밀번호 확인"
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
            {mismatch && <Text className="text-sm text-red-500">비밀번호가 일치하지 않아요.</Text>}
          </>
        )}
      </View>

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <View className="gap-3">
        <Button
          label={
            !isSignup
              ? '로그인'
              : step === 'email'
                ? '인증번호 받기'
                : step === 'code'
                  ? '확인'
                  : '가입하기'
          }
          loading={submitting}
          disabled={!canSubmit}
          onPress={
            !isSignup
              ? submitLogin
              : step === 'email'
                ? requestCode
                : step === 'code'
                  ? () => void submitCode(code)
                  : submitSignup
          }
        />
        <Button
          variant="secondary"
          label={isSignup ? '이미 계정이 있어요' : '계정 만들기'}
          disabled={submitting}
          onPress={toggleMode}
        />
      </View>
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
