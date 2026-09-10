import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  LlmImageType,
  LlmInputItemType,
  LlmProvider,
  LlmTool,
  LlmToolExecutor,
  StructuredReqType,
  ToolChatResType,
} from './llm-provider.interface';
import { OPENAI_CLIENT } from './llm.constants';

/**
 * 텍스트(+이미지) → `responses.parse` 의 input.
 *
 * 이미지가 없으면 **문자열 그대로** 넘긴다(기존 동작 유지). 있으면 content part 배열로 감싼다.
 * `detail` 은 SDK 타입상 필수라 기본값 `'auto'` 를 채운다 — 영수증처럼 작은 글자를 읽어야 하면
 * 호출자가 `'high'` 를 준다(정확도·토큰이 여기서 갈린다).
 */
function toStructuredInput(
  text: string,
  images?: LlmImageType[],
): string | OpenAI.Responses.ResponseInput {
  if (!images?.length) return text;

  const content: OpenAI.Responses.ResponseInputMessageContentList = [];
  // 이미지만 보내는 경우(냉장고 사진) 빈 텍스트 파트를 만들지 않는다.
  if (text.trim().length > 0) content.push({ type: 'input_text', text });
  for (const image of images) {
    content.push({
      type: 'input_image',
      image_url: image.dataUrl,
      detail: image.detail ?? 'auto',
    });
  }
  return [{ role: 'user', content }];
}

/**
 * 한 응답에 툴을 **하나만** 부르게 강제한다 (벤더 기본값은 `true` = 병렬 허용).
 *
 * 끈 이유: 도메인이 여러 호출을 합칠 방법이 없다. `pickInventoryCall` 은 첫 `update_inventory`
 * 하나만 채택하고 나머지를 **버리는데**, 실측에서 모델이 한 턴에 두 번 불러 뒤 호출이 통째로
 * 유실되는 걸 확인했다(`ignored` 경고). 합치는 안은 이미 접었다 — 뒤 호출이 앞 판단과 어긋나고
 * (같은 재료가 add·consume 양쪽에), 확인 카드에 같은 재고 행이 두 줄 올라와 key 가 충돌했다.
 * 재고 유실은 **조용한 데이터 손실**이라 눈에 보이는 불편보다 나쁘다.
 *
 * ⚠️ **대가**: 한 턴에 `update_inventory` 와 `search_recipes` 를 같이 못 부른다. 레시피를 종결
 * 툴로 둔 장점 중 하나가 "재고 툴과 같은 턴에 불려도 둘 다 살아남는다" 였는데 그게 사라진다.
 * 되살리고 싶어지면 이 값을 되돌리기 **전에** 여러 호출을 병합하는 규칙부터 정할 것.
 *
 * ⚠️ Gemini 엔 대응 옵션이 없다 — 그래서 `pickInventoryCall` 의 방어와 경고 로그는 그대로 둔다.
 */
const PARALLEL_TOOL_CALLS = false;

/** function_call 인자(JSON 문자열)를 안전하게 파싱한다. 손상되면 빈 객체로 흘려보낸다(크래시 방지). */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 저장된 대화 아이템 → OpenAI Responses input 아이템.
 *
 * `function_call` 은 `{type, call_id, name, arguments}` 4개면 충분하다 — SDK 타입상 `id`/`status`
 * 는 옵셔널이고 "응답으로 돌려받을 때 채워지는" 필드라 재전송에 필요 없다. 그래서 우리는 그 둘을
 * 저장하지도, 보내지도 않는다. `arguments`/`output` 은 문자열이어야 해서 여기서 직렬화한다.
 */
function toInputItem(item: LlmInputItemType): OpenAI.Responses.ResponseInputItem {
  switch (item.type) {
    case 'function_call':
      return {
        type: 'function_call',
        call_id: item.callId,
        name: item.name,
        arguments: JSON.stringify(item.arguments),
      };
    case 'function_call_output':
      return {
        type: 'function_call_output',
        call_id: item.callId,
        output: JSON.stringify(item.output),
      };
    default:
      return { role: item.role, content: item.content };
  }
}

/**
 * OpenAI 벤더 구현. LlmService(라우터)가 모델 이름이 'gemini' 가 아닐 때 이 provider 로 위임한다.
 * `openai` import(및 `openai/helpers/zod`)는 이 파일 안에만 둔다 (벤더 캡슐화).
 */
@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(@Inject(OPENAI_CLIENT) private readonly client: OpenAI) {}

  /** 한 번의 요청 → 정리된 응답(ChatResType) 반환 */
  async chat(
    instructions: string,
    messages: ChatMessageType[],
    model: string,
  ): Promise<ChatResType> {
    try {
      const res = await this.client.responses.create({
        model,
        instructions,
        input: messages,
      });

      return {
        id: res.id,
        model: res.model,
        status: res.status ?? 'failed',
        text: res.output_text ?? '',
        usage: res.usage
          ? {
              inputTokens: res.usage.input_tokens,
              outputTokens: res.usage.output_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`LLM 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 응답 생성에 실패했습니다.');
    }
  }

  /**
   * 구조화(JSON) 출력 호출 — Structured Outputs 로 스키마에 맞는 객체를 강제한다.
   * 메모리 추출처럼 "정해진 모양의 데이터"가 필요한 작업에서 chat() 대신 쓴다.
   */
  async structured<T>({
    instructions,
    input,
    images,
    schema,
    schemaName,
    model,
  }: StructuredReqType<T>): Promise<StructuredResType<T>> {
    try {
      const res = await this.client.responses.parse({
        model,
        instructions,
        input: toStructuredInput(input, images),
        text: { format: zodTextFormat(schema, schemaName) },
      });

      if (!res.output_parsed) {
        // 모델 거절·미완성 등으로 파싱 결과가 없는 경우
        throw new Error('구조화 출력이 비어 있습니다.');
      }
      return {
        id: res.id,
        model: res.model,
        status: res.status ?? 'failed',
        parsed: res.output_parsed, // zod 로 검증된 T (캐스팅 없음)
        usage: res.usage
          ? {
              inputTokens: res.usage.input_tokens,
              outputTokens: res.usage.output_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`구조화 LLM 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 처리에 실패했습니다.');
    }
  }

  /**
   * 툴(function calling) 을 붙여 대화한다. 모델이 툴을 부르면 → 넘겨받은 실행기로 실행 →
   * 결과를 대화에 재주입해 다시 호출 → 최종 텍스트를 얻는다. openai 루프는 여기 안에만 있다.
   */
  async chatWithTools(
    instructions: string,
    items: LlmInputItemType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds = 3,
  ): Promise<ToolChatResType> {
    try {
      const toolParams: OpenAI.Responses.Tool[] = tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: false,
      }));
      // 종결 툴: 이 툴이 불리면 실행하지 않고 그 호출을 그대로 상위로 올린다(루프 중단).
      const terminalNames = new Set(tools.filter((t) => t.terminal).map((t) => t.name));

      // 지난 턴의 툴 호출·결과까지 그대로 되살린다 — 모델이 "그 호출은 이미 끝났다"를 안다.
      const input: OpenAI.Responses.ResponseInput = items.map(toInputItem);

      // 여러 왕복의 토큰을 누적한다 (마지막 호출만이 아니라 총합)
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let sawUsage = false;
      const accumulate = (u?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      }) => {
        if (!u) return;
        sawUsage = true;
        inputTokens += u.input_tokens;
        outputTokens += u.output_tokens;
        totalTokens += u.total_tokens;
      };

      let res = await this.client.responses.create({
        model,
        instructions,
        input,
        tools: toolParams,
        parallel_tool_calls: PARALLEL_TOOL_CALLS,
      });
      accumulate(res.usage);

      // 모델이 툴을 더 안 부를 때까지(또는 상한까지) 반복
      for (let round = 0; round < maxRounds; round++) {
        const calls = res.output.filter(
          (o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call',
        );
        if (calls.length === 0) break;

        // 종결 툴이 하나라도 불렸으면 실행·재호출 없이 그 호출들을 올리고 끝낸다.
        // 같은 응답에 텍스트가 함께 왔으면 그것도 넘긴다 — 버리면 모델의 말("맛있었겠다!")이 사라진다.
        const terminal = calls.filter((c) => terminalNames.has(c.name));
        if (terminal.length > 0) {
          return {
            id: res.id,
            model: res.model,
            status: res.status ?? 'failed',
            text: res.output_text ?? '',
            terminalCalls: terminal.map((c) => ({
              callId: c.call_id,
              name: c.name,
              arguments: parseArgs(c.arguments),
            })),
            usage: sawUsage ? { inputTokens, outputTokens, totalTokens } : undefined,
          };
        }

        // 모델의 function_call 아이템들을 대화에 이어붙인다 (다음 호출이 맥락을 갖도록).
        // res.output 전체가 아니라 function_call 만 넣는다 (다른 출력 타입은 입력에 부적합).
        input.push(...calls);

        for (const call of calls) {
          let output: string;
          try {
            const executor = executors[call.name];
            const args = JSON.parse(call.arguments) as Record<string, unknown>;
            const result = executor
              ? await executor(args)
              : { error: `unknown tool: ${call.name}` };
            output = JSON.stringify(result);
          } catch (e) {
            this.logger.error(`툴 실행 실패 (${call.name})`, e as Error);
            output = JSON.stringify({ error: '도구 실행에 실패했습니다.' });
          }
          input.push({ type: 'function_call_output', call_id: call.call_id, output });
        }

        // 마지막 라운드에선 tool_choice:'none' 으로 툴을 막아 반드시 텍스트 답을 받는다.
        // (상한에 걸렸는데 모델이 또 function_call 만 내면 output_text 가 비는 걸 방지)
        const lastRound = round === maxRounds - 1;
        res = await this.client.responses.create({
          model,
          instructions,
          input,
          tools: toolParams,
          tool_choice: lastRound ? 'none' : 'auto',
          parallel_tool_calls: PARALLEL_TOOL_CALLS,
        });
        accumulate(res.usage);
      }

      return {
        id: res.id,
        model: res.model,
        status: res.status ?? 'failed',
        text: res.output_text ?? '',
        usage: sawUsage ? { inputTokens, outputTokens, totalTokens } : undefined,
      };
    } catch (err) {
      this.logger.error(`툴 대화 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 응답 생성에 실패했습니다.');
    }
  }
}
