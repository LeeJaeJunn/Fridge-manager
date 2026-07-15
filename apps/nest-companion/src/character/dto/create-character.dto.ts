import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  CreateCharacterRequestType,
  GenderType,
  RelationshipType,
  SpeechStyleType,
} from '@companion/types';
import {
  GENDER_VALUES,
  INTEREST_VALUES,
  LIMITS,
  PERSONALITY_VALUES,
  RELATIONSHIP_VALUES,
  SPEECH_STYLE_VALUES,
} from '../persona';

/**
 * POST /characters 요청 본문 — 캐릭터 상세 생성.
 * 필수: name·gender·relationship·personality·speechStyle. 나머지는 선택.
 * 선택지 값(@IsIn)과 제한값(@MaxLength 등)은 모두 persona.ts 가 소유한다 — 숫자를 여기 직접 쓰지 말 것.
 * 클라도 `GET /characters/options` 로 같은 값을 받아 쓰므로 한쪽만 바뀌어 어긋날 일이 없다.
 */
export class CreateCharacterDto implements CreateCharacterRequestType {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.nameMax)
  name!: string;

  @IsIn(GENDER_VALUES)
  gender!: GenderType;

  @IsIn(RELATIONSHIP_VALUES)
  relationship!: RelationshipType;

  @IsString({ each: true })
  @IsIn(PERSONALITY_VALUES, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.personalityMax)
  personality!: string[];

  @IsIn(SPEECH_STYLE_VALUES)
  speechStyle!: SpeechStyleType;

  @IsOptional()
  @IsInt()
  @Min(LIMITS.ageMin)
  @Max(LIMITS.ageMax)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.jobMax)
  job?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.actingRuleMax)
  actingRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.userNicknameMax)
  userNickname?: string;

  @IsOptional()
  @IsString({ each: true })
  @IsIn(INTEREST_VALUES, { each: true })
  @ArrayMaxSize(LIMITS.interestsMax)
  interests?: string[];
}
