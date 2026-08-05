import type {
  ChatMessageType,
  ChatResType,
  ChatRoleType,
  StructuredResType,
} from '@companion/types';
import type { ZodType } from 'zod';

/**
 * LLM 에 보낼 대화 아이템 — 말풍선뿐 아니라 **툴 호출·결과까지** 표현한다.
 * OpenAI Responses 의 input 아이템과 같은 모양이고, 각 provider 가 자기 벤더 형태로 조립한다
 * (OpenAI `function_call_output` ↔ Gemini `function_result` 처럼 이름이 다른 건 provider 가 흡수).
 *
 * 클라이언트는 이 타입을 볼 일이 없어서 `@companion/types` 가 아니라 여기 둔다
 * (`LlmTool`/`TerminalToolCall` 과 같은 자리 = 서버 내부 LLM 배관).
 */
export interface LlmTextItemType {
  type: 'text';
  role: ChatRoleType;
  content: string;
}

export interface LlmFunctionCallItemType {
  type: 'function_call';
  /** 벤더가 준 호출 식별자 — 결과 아이템과 짝을 맞추는 유일한 키 */
  callId: string;
  name: string;
  /** 파싱된 인자. OpenAI 로 보낼 땐 provider 가 JSON 문자열로 되돌린다 */
  arguments: Record<string, unknown>;
}

export interface LlmFunctionOutputItemType {
  type: 'function_call_output';
  callId: string;
  /** Gemini 의 function_result 가 이름을 요구해서 함께 담는다 (OpenAI 는 안 씀) */
  name: string;
  output: Record<string, unknown>;
}

export type LlmInputItemType =
  | LlmTextItemType
  | LlmFunctionCallItemType
  | LlmFunctionOutputItemType;

/** 벤더 중립 툴 정의 — 호출자(Conversation 등)가 벤더 타입을 모르게 한다. parameters 는 JSON Schema. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /**
   * 종결 툴 — 모델이 이 툴을 부르면 실행·재호출하지 않고 그 호출을 그대로 상위로 올린다(루프 중단).
   * 실제 처리(확인 카드 등)를 호출자가 하고 싶을 때. false/미지정이면 executors 로 실행하고 결과를 재주입한다.
   */
  terminal?: boolean;
}

/** 툴 실행기 — LLM 이 준 인자(JSON)를 받아 결과를 반환. 결과는 직렬화돼 모델에 재주입된다. */
export type LlmToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * 모델에 함께 넘길 이미지 — provider 가 자기 벤더 포맷으로 변환한다.
 *
 * `detail` 이 정확도와 비용을 동시에 좌우한다: 영수증처럼 **작은 글자를 읽어야 하면 `'high'`**,
 * 냉장고 사진처럼 사물만 알아보면 되면 `'auto'`/`'low'` 로 토큰을 아낀다.
 */
export type LlmImageType = {
  /** base64 data URL (`data:image/jpeg;base64,...`) */
  dataUrl: string;
  detail?: 'low' | 'high' | 'auto';
};

/**
 * `structured()` 요청 — 인자가 6개라 **위치가 아니라 이름**으로 받는다.
 * `instructions`/`input`/`schemaName` 이 전부 string 이라 위치 인자로 두면 뒤바뀌어도 컴파일러가 못 잡는다.
 */
export interface StructuredReqType<T> {
  instructions: string;
  /** 텍스트 입력. 이미지만 보낼 땐 빈 문자열이어도 된다(영수증은 여기에 OCR 텍스트가 들어간다). */
  input: string;
  /** 함께 볼 이미지들. 지원 여부는 provider 마다 다르다(현재 OpenAI 만). */
  images?: LlmImageType[];
  schema: ZodType<T>;
  schemaName: string;
  model: string;
}

/**
 * 종결 툴 호출 한 건 — 실행하지 않고 상위로 올린 모델의 함수 호출.
 * `callId` 를 반드시 함께 올린다 — 나중에 결과(`function_call_output`)를 이 값으로 짝지어
 * 히스토리에 재생하므로, 여기서 잃어버리면 대화를 되살릴 수 없다.
 */
export interface TerminalToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * `chatWithTools` 반환 — 텍스트 응답 + 종결 툴이 불렸으면 그 호출들.
 * 모델은 **텍스트와 툴 호출을 같이 낼 수 있어서** 둘 다 채워질 수 있다(예: "맛있었겠다!" + update_inventory).
 * 호출자는 있는 것만 저장하면 된다.
 */
export type ToolChatResType = ChatResType & { terminalCalls?: TerminalToolCall[] };

/**
 * 한 LLM 벤더의 구현 계약. OpenAiLlmProvider / GeminiLlmProvider 가 이걸 구현하고,
 * LlmService(라우터)가 모델 이름으로 골라 위임한다. 세 메서드는 전부 벤더 중립 타입만 주고받는다.
 */
export interface LlmProvider {
  /** 한 번의 요청 → 정리된 응답 */
  chat(instructions: string, messages: ChatMessageType[], model: string): Promise<ChatResType>;

  /**
   * 구조화(JSON) 출력 — zod 스키마에 맞는 검증된 객체 강제.
   * `images` 를 지원하지 않는 벤더는 예외를 던진다(계약상 선택 기능).
   */
  structured<T>(req: StructuredReqType<T>): Promise<StructuredResType<T>>;

  /**
   * 툴(function calling) 대화 — 모델이 툴을 부르면 실행기로 실행해 재주입, 최종 텍스트 반환.
   * 단 `terminal` 툴을 부르면 실행하지 않고 `terminalCalls` 로 올려 루프를 끊는다.
   *
   * `items` 에는 지난 턴의 툴 호출·결과도 그대로 들어온다(재생) — 그래야 모델이 "그 호출은
   * 이미 처리됐다"를 벤더가 의도한 방식으로 안다.
   */
  chatWithTools(
    instructions: string,
    items: LlmInputItemType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds?: number,
  ): Promise<ToolChatResType>;
}
