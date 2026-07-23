import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateCharacterRequestType, SpeechStyleType } from '@companion/types';
import { LIMITS, SPEECH_STYLE_VALUES, TAG_VALUES } from '../persona';

/**
 * POST /characters 요청 본문 — 캐릭터 생성.
 * 필수: name·speechStyle. 나머지는 선택. (조언자 톤으로 축소돼 이름·말투·호칭만 받는다)
 * 선택지 값(@IsIn)과 제한값(@MaxLength 등)은 모두 persona.ts 가 소유한다 — 숫자를 여기 직접 쓰지 말 것.
 * 클라도 `GET /characters/options` 로 같은 값을 받아 쓰므로 한쪽만 바뀌어 어긋날 일이 없다.
 */
export class CreateCharacterDto implements CreateCharacterRequestType {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.nameMax)
  name!: string;

  @IsIn(SPEECH_STYLE_VALUES)
  speechStyle!: SpeechStyleType;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.userNicknameMax)
  userNickname?: string;

  // 개수 상한은 두지 않는다 — @IsIn 이 값을 고정 vocab 으로 묶으므로 고를 수 있는 종류가 이미 유한하고,
  // 같은 값이 반복돼도 서비스가 중복을 제거한다.
  @IsOptional()
  @IsString({ each: true })
  @IsIn(TAG_VALUES, { each: true })
  tags?: string[];
}
