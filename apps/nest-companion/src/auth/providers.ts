/**
 * 로그인 수단(`AuthIdentity.provider`) 어휘의 **단일 출처**.
 *
 * `shelf-life.ts`(재고 vocab)·`persona.ts`(캐릭터 vocab)와 같은 자리다 — DB 는 String 컬럼이라
 * 값을 강제하지 못하므로, 코드가 유일한 진실원천이고 DTO 검증도 여기서 가져다 쓴다.
 *
 * ⚠️ **`as const` 로 좁히지 않는다**(레포 방침). 문자열 리터럴 유니온으로 만들면 `===`/`!==`
 * 비교에서 `no-unsafe-enum-comparison` 이 걸린다 — `persona.ts` 의 vocab 과 같은 이유.
 *
 * 애플을 추가할 땐 여기에 `'APPLE'` 한 줄만 넣으면 된다. **마이그레이션이 필요 없다**
 * (DB enum 이 아니라 String 이라서). 기존 컬럼·행은 건드리지 않는다.
 */
export const PROVIDER_VALUES: string[] = ['LOCAL', 'KAKAO', 'NAVER', 'GOOGLE'];

/**
 * 이메일+비밀번호 가입. 외부 서비스가 없어서 `providerUserId` 가 null 이고,
 * 비밀번호는 `AuthIdentity` 가 아니라 `User.passwordHash` 가 들고 있다.
 */
export const LOCAL_PROVIDER = 'LOCAL';

/**
 * 소셜 provider 만 (LOCAL 제외) — OAuth 라우트 검증에 쓴다.
 * `/auth/social/:provider` 로 `local` 이 들어오면 비밀번호 없이 로그인되는 경로가 생기므로
 * 반드시 걸러야 한다.
 */
export const SOCIAL_PROVIDER_VALUES: string[] = PROVIDER_VALUES.filter((p) => p !== LOCAL_PROVIDER);
