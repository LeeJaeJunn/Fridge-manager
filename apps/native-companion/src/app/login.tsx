import { useState } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';

import { Button, Screen } from '@/components';
import { useAuth } from '@/context/auth';

type Mode = 'login' | 'signup';

/** 로그인 / 회원가입 화면. 성공하면 _layout 게이트가 자동으로 다음 화면으로 보낸다. */
export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const canSubmit = loginId.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup({ loginId: loginId.trim(), password, name: name.trim() || undefined });
      } else {
        await login({ loginId: loginId.trim(), password });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '문제가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
  };

  return (
    <Screen contentClassName="justify-center gap-6 px-6">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">{isSignup ? '회원가입' : '로그인'}</Text>
        <Text className="text-ink-soft">
          {isSignup ? '나를 기억하는 AI 친구를 만들어요.' : '다시 만나서 반가워요.'}
        </Text>
      </View>

      <View className="gap-3">
        <Field
          label="아이디"
          value={loginId}
          onChangeText={setLoginId}
          placeholder="영문/숫자/밑줄 4~20자"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="비밀번호"
          value={password}
          onChangeText={setPassword}
          placeholder="8자 이상"
          autoCapitalize="none"
          secureTextEntry
        />
        {isSignup && (
          <Field
            label="이름 (선택)"
            value={name}
            onChangeText={setName}
            placeholder="AI가 부를 이름"
          />
        )}
      </View>

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <View className="gap-3">
        <Button
          label={isSignup ? '가입하기' : '로그인'}
          loading={submitting}
          disabled={!canSubmit}
          onPress={submit}
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

/** 라벨 + 입력 한 쌍 (settings/character 의 입력 스타일과 통일) */
function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm text-ink-soft">{label}</Text>
      <TextInput
        className="rounded-xl bg-sand px-4 py-3 text-base text-ink"
        placeholderTextColor="#A1A1AA"
        {...props}
      />
    </View>
  );
}
