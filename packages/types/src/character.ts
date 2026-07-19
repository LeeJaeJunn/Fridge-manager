/**
 * 캐릭터(컴패니언) 관련 클라이언트↔서버 공유 계약.
 *
 * 유저당 캐릭터는 **하나**(1:1)다. 캐릭터는 "조언자 톤"의 얇은 페르소나로 축소됐다 —
 * 남는 설정은 **이름·말투·호칭**뿐이다. 성별·나이·관계·성격 같은 롤플레이 필드는 제거했다
 * (제품 방향: 나를 기억하는 의사결정 컴패니언, 루트 README 참고).
 *
 * 클라이언트가 보내는 건 **설정값**이고, 그걸 조립한 최종 `instruction`/`model` 은 서버 소유라
 * 노출하지 않는다(신뢰 경계). 관심사는 캐릭터가 아니라 **유저 취향** → 생성 시 장기 메모리(INTEREST)로 시드된다.
 *
 * 말투의 **값**은 아래 유니온으로 미러하고(컴파일 안전), 화면에 뿌릴 **라벨 목록**은
 * 서버가 `GET /characters/options` 로 내려준다(단일 진실원천, persona 코드 소유).
 */

export type SpeechStyleType = 'casual' | 'formal';

/** 선택지 한 항목 (값 + 표시 라벨) */
export interface CharacterOptionType {
  value: string;
  label: string;
}

/**
 * 입력 제한값 — 숫자의 출처는 **서버(persona.ts)** 한 곳이다.
 * 서버 DTO 검증과 클라 입력 제한이 같은 값을 쓰게 해서 한쪽만 고쳐 어긋나는 걸 막는다.
 * (클라는 이 값으로 미리 막아 UX 를 좋게 하고, 실제 방어는 언제나 서버 DTO)
 *
 * ⚠️ 이 값들을 공유 패키지에 상수로 두지 않는 이유: 이 패키지는 **타입 전용**이라
 * 런타임 엔트리가 없다. 값을 import 하면 tsc 는 통과하지만 서버가 부팅 때 죽는다
 * (ERR_PACKAGE_PATH_NOT_EXPORTED). 그래서 값은 API 로 내려준다.
 */
export interface CharacterLimitsType {
  nameMax: number;
  userNicknameMax: number;
  interestsMax: number;
}

/** GET /characters/options — 온보딩 폼이 렌더할 선택지 + 입력 제한 (표시용) */
export interface CharacterOptionsType {
  speechStyles: CharacterOptionType[];
  /** 유저 관심사(선택형, 다중) */
  interests: string[];
  limits: CharacterLimitsType;
}

/** 클라이언트에 내려주는 내 캐릭터 (표시용 — instruction/model 비노출) */
export interface CharacterType {
  id: string;
  name: string;
  speechStyle: SpeechStyleType | null;
  userNickname: string | null;
  createdAt: string;
}

/**
 * POST /characters — 캐릭터 생성.
 * 필수: name·speechStyle. 나머지는 선택.
 * interests 는 캐릭터에 저장되지 않고 장기 메모리(INTEREST)로 시드된다.
 */
export interface CreateCharacterRequestType {
  name: string;
  speechStyle: SpeechStyleType;
  userNickname?: string;
  interests?: string[];
}

/** PATCH /characters/me — 부분 수정 (보낸 필드만 갱신). interests 는 메모리 API 로 관리. */
export interface UpdateCharacterRequestType {
  name?: string;
  speechStyle?: SpeechStyleType;
  userNickname?: string | null;
}
