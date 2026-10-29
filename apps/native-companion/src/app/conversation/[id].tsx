import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  applyProposal,
  cookDish,
  cookPreview,
  dismissProposal,
  fetchConversation,
  searchDishRecipes,
  sendMessage,
  startConversation,
} from '@/api/conversation';
import { deleteSavedDish, fetchSavedDishes, saveDish, updateSavedDish } from '@/api/saved-dish';
import {
  Bubble,
  Button,
  Dialog,
  DishCard,
  InventoryConfirmCard,
  RecipeResultCard,
  SavedDishDialog,
  Screen,
} from '@/components';
import { useInventory } from '@/context/inventory';
import {
  lastUserIndex,
  outcomesByCallId,
  searchedDishIds,
  toDishProposal,
  toInventoryProposal,
  toRecipeResult,
} from '@/lib/messages';
import {
  EMPTY_SAVED_DISH_DRAFT,
  draftFromDish,
  draftFromSaved,
  toSaveRequest,
  toUpdateRequest,
  type SavedDishDraftType,
} from '@/lib/saved-dish';
import type {
  ApplyProposalRequestType,
  DishProposalType,
  InventoryProposalType,
  MessageType,
  SavedDishType,
} from '@companion/types';

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [conversationId, setConversationId] = useState<string | null>(isNew ? null : id);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null); // 확인/취소 진행 중인 제안 메시지
  /**
   * "만들었어요" 확인 대기 중인 제안. **대화 아이템이 아니라 화면 상태다** —
   * 소비는 대화에 아무것도 남기지 않기로 했으므로(토큰 때문) 확인 UI 도 메시지가 아니라
   * 모달로 뜬다. 취소하면 흔적 없이 사라진다.
   */
  const [cookTarget, setCookTarget] = useState<{
    messageId: string;
    proposal: InventoryProposalType;
  } | null>(null);
  /** 저장한 요리 — 출처 메시지 id → 저장본. 별을 채울지와 모달 초깃값을 둘 다 여기서 읽는다. */
  const [savedDishes, setSavedDishes] = useState<Map<string, SavedDishType>>(new Map());
  const [saveTarget, setSaveTarget] = useState<{
    messageId: string;
    draft: SavedDishDraftType;
    savedId: string | null;
  } | null>(null);
  const [savingDish, setSavingDish] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // 채팅으로 재료가 추가·차감됐을 수 있다(서버 tool-use). 화면을 나갈 때 한 번만 전역 재고를 새로고침한다
  // — 채팅 중엔 냉장고·홈이 안 보이니 매 메시지 갱신은 불필요하다. 실제로 대화했을 때만(dirty) 갱신한다.
  // refresh 는 Provider 에서 useCallback 으로 안정화돼 있어 effect 가 재등록되지 않는다(언마운트 시 1회 cleanup).
  const { refresh, options } = useInventory();
  const dirtyRef = useRef(false);
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void refresh();
    };
  }, [refresh]);

  // 기존 대화면 메시지 로드 (새 대화는 빈 화면)
  useEffect(() => {
    if (!conversationId) return;
    fetchConversation(conversationId)
      .then((c) => setMessages(c.messages))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
    // 마운트 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 대화도 첫 턴에 요리 카드가 나올 수 있으므로 대화 유무와 무관하게 저장 상태를 복원한다.
  useEffect(() => {
    fetchSavedDishes()
      .then((list) => setSavedDishes(new Map(list.map((saved) => [saved.sourceMessageId, saved]))))
      // 실패를 삼키면 "저장했는데 빈 별"이 원인 없이 보인다. 채팅 자체는 계속 쓸 수 있다.
      .catch(() => setError('저장한 요리를 불러오지 못했어요'));
  }, []);

  // 임의 텍스트를 전송하는 코어. 지금은 입력창 전송만 쓰지만, 카드 안 버튼("다른 레시피 보여줘" 등)이
  // 사용자가 타이핑한 것처럼 메시지를 보내야 할 때 같이 쓰라고 handleSend 와 분리해 둔다.
  async function send(content: string) {
    if (!content || sending) return;
    setError(null);
    setSending(true);

    // 낙관적: 유저 메시지를 즉시 표시
    const optimistic: MessageType = {
      id: `tmp-${Date.now()}`,
      type: 'TEXT',
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      if (!conversationId) {
        // 새 대화: 첫 메시지로 생성 → 서버가 준 전체 메시지로 교체
        const convo = await startConversation({ content });
        setConversationId(convo.id);
        setMessages(convo.messages);
      } else {
        // 한 턴에 말풍선 + 확인 카드가 함께 올 수 있어 배열로 받는다
        const res = await sendMessage(conversationId, { content });
        setMessages((prev) => [...prev, ...res.messages]);
      }
      dirtyRef.current = true; // 대화가 오갔으니 나갈 때 재고를 다시 확인한다
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '전송에 실패했습니다');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  // 제안 확정 — 편집값으로 반영. 서버가 만든 아이템(툴 결과 등)을 **뒤에 덧붙인다**.
  // 카드 자체는 그대로 두고, 결과 아이템이 생기면서 자동으로 "반영했어요" 칩으로 바뀐다.
  async function handleApply(messageId: string, req: ApplyProposalRequestType) {
    if (!conversationId || resolvingId) return;
    setResolvingId(messageId);
    try {
      const res = await applyProposal(conversationId, messageId, req);
      setMessages((prev) => [...prev, ...res.messages]);
      void refresh(); // 냉장고·홈에 즉시 반영
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '반영에 실패했어요');
    } finally {
      setResolvingId(null);
    }
  }

  // 제안 취소 — 재고는 그대로 두고 "취소됨" 결과 아이템만 덧붙는다.
  async function handleDismiss(messageId: string) {
    if (!conversationId || resolvingId) return;
    setResolvingId(messageId);
    try {
      const res = await dismissProposal(conversationId, messageId);
      setMessages((prev) => [...prev, ...res.messages]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '취소에 실패했어요');
    } finally {
      setResolvingId(null);
    }
  }

  // 요리 카드의 "자세한 레시피" — 서버가 검색해 결과 카드를 덧붙인다(LLM 없음).
  // 재고가 안 바뀌므로 apply 와 달리 `refresh()` 를 부르지 않는다.
  async function handleSearchRecipes(messageId: string) {
    if (!conversationId || resolvingId) return;
    setResolvingId(messageId);
    try {
      const res = await searchDishRecipes(conversationId, messageId);
      setMessages((prev) => [...prev, ...res.messages]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '레시피를 찾지 못했어요');
    } finally {
      setResolvingId(null);
    }
  }

  // "만들었어요" 1단계 — 제안만 받아 모달을 연다. 서버는 아직 아무것도 안 쓴다.
  async function handleCookPreview(messageId: string) {
    if (!conversationId || resolvingId) return;
    setResolvingId(messageId);
    try {
      const proposal = await cookPreview(conversationId, messageId);
      setCookTarget({ messageId, proposal });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '재고를 계산하지 못했어요');
    } finally {
      setResolvingId(null);
    }
  }

  // 2단계 — 확인한 값으로 반영. 새 아이템이 아니라 **요리 카드 자체가 바뀌므로** 교체한다.
  async function handleCook(messageId: string, req: ApplyProposalRequestType) {
    if (!conversationId) return;
    setResolvingId(messageId);
    try {
      const res = await cookDish(conversationId, messageId, { consume: req.consume });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
      setCookTarget(null);
      void refresh(); // 냉장고·홈에 즉시 반영
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '반영에 실패했어요');
    } finally {
      setResolvingId(null);
    }
  }

  function handlePressStar(messageId: string, dish: DishProposalType) {
    setSaveError(null);
    const saved = savedDishes.get(messageId);
    setSaveTarget({
      messageId,
      draft: saved ? draftFromSaved(saved) : draftFromDish(dish),
      savedId: saved?.id ?? null,
    });
  }

  async function handleSaveDish(draft: SavedDishDraftType) {
    if (!saveTarget || savingDish) return;
    setSavingDish(true);
    setSaveError(null);
    try {
      const saved = saveTarget.savedId
        ? await updateSavedDish(saveTarget.savedId, toUpdateRequest(draft))
        : await saveDish(toSaveRequest(draft, saveTarget.messageId));
      setSavedDishes((prev) => new Map(prev).set(saved.sourceMessageId, saved));
      setSaveTarget(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했어요');
    } finally {
      setSavingDish(false);
    }
  }

  async function handleUnsaveDish() {
    if (!saveTarget?.savedId || savingDish) return;
    setSavingDish(true);
    setSaveError(null);
    try {
      await deleteSavedDish(saveTarget.savedId);
      setSavedDishes((prev) => {
        const next = new Map(prev);
        next.delete(saveTarget.messageId);
        return next;
      });
      setSaveTarget(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '저장 해제에 실패했어요');
    } finally {
      setSavingDish(false);
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    void send(content);
  }

  // 어떤 제안이 이미 처리됐는지 — 짝이 되는 툴 결과 아이템으로 판정한다(서버와 같은 규칙).
  const outcomes = outcomesByCallId(messages);
  // 요리 카드의 "레시피 찾기"를 아직 열어둘지. 상태를 따로 안 들고 **대화에서 파생**한다
  // (앱을 껐다 켜도 같은 답이 나온다 — 로컬 state 로 잠그면 그게 안 된다).
  const searchedDishes = searchedDishIds(messages);
  const lastUserIdx = lastUserIndex(messages);

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 (전역 headerShown:false 라 직접 둠) */}
        <View className="flex-row items-center gap-3 border-b border-line px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-2xl leading-6 text-ink-soft">‹</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-ink">대화</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#C94B55" />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            overScrollMode="always"
            className="flex-1 px-4"
            contentContainerClassName="gap-3 py-4"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <Text className="mt-8 text-center text-ink-faint">
                메시지를 보내 대화를 시작하세요
              </Text>
            )}
            {messages.map((m, i) => {
              // 툴 결과를 어디에 그리는지는 툴마다 다르다:
              //  - 재고: 호출이 "확인 대기 중인 제안"이라 FUNCTION_CALL 에 카드를 그리고,
              //          결과는 그 카드의 상태(반영/취소)로만 드러난다 → 여기선 아무것도 안 그림
              //  - 레시피: 서버가 이미 실행했고 **결과가 곧 내용**이라 결과에 카드를 그린다
              if (m.type === 'FUNCTION_CALL_OUTPUT') {
                const recipes = toRecipeResult(m);
                if (recipes) return <RecipeResultCard key={m.id} result={recipes} />;
                return null;
              }

              if (m.type === 'FUNCTION_CALL') {
                // 요리 카드도 **호출** 쪽이다 — 서버가 재고 매칭까지 끝내 `resolved` 에 담아두므로,
                // 결과 아이템(`{ shown: true }`)은 "이미 보여줬다"는 표시일 뿐 화면을 안 만든다.
                const dish = toDishProposal(m);
                if (dish)
                  return (
                    <DishCard
                      key={m.id}
                      dish={dish}
                      saved={savedDishes.has(m.id)}
                      onPressStar={() => handlePressStar(m.id, dish)}
                      // 한 번 검색했거나 대화가 이미 넘어갔으면 버튼을 감춘다 —
                      // 같은 카드를 계속 눌러 네이버 쿼터를 태우는 걸 막는다.
                      canSearch={i > lastUserIdx && !searchedDishes.has(m.id)}
                      searching={resolvingId === m.id && cookTarget === null}
                      cooking={resolvingId === m.id && cookTarget === null}
                      onSearchRecipes={() => void handleSearchRecipes(m.id)}
                      onCook={() => void handleCookPreview(m.id)}
                    />
                  );

                const proposal = toInventoryProposal(m);
                // 앱이 모르는 툴이면 조용히 건너뛴다 (백엔드에 툴이 늘어도 안 깨지게).
                // 레시피 호출도 여기서 걸러진다 — 카드는 위 결과 쪽에서 그리므로 중복이 안 생긴다.
                if (!proposal) return null;
                return (
                  <InventoryConfirmCard
                    key={m.id}
                    proposal={proposal}
                    options={options}
                    outcome={outcomes.get(m.payload.callId) ?? null}
                    busy={resolvingId === m.id}
                    onApply={(req) => void handleApply(m.id, req)}
                    onDismiss={() => void handleDismiss(m.id)}
                  />
                );
              }

              if (!m.content) return null;
              return <Bubble key={m.id} role={m.role} content={m.content} />;
            })}
            {sending && <Bubble role="assistant" pending />}
          </ScrollView>
        )}

        {error && <Text className="px-4 pb-1 text-sm text-red-500">{error}</Text>}

        <View className="flex-row items-center gap-2 border-t border-line px-4 py-3">
          <TextInput
            className="flex-1 rounded-full bg-sand px-4 py-2 text-ink"
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#A79C98"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={!sending}
            returnKeyType="send"
          />
          <Button
            label="전송"
            size="sm"
            className="px-5"
            onPress={handleSend}
            disabled={sending || !input.trim()}
          />
        </View>
      </KeyboardAvoidingView>

      {/* "만들었어요" 확인 — **모달인 게 의도다.** 소비는 대화에 아이템을 안 남기므로
          (재고는 매 턴 프롬프트로 새로 주입되니 실을 이유가 없다) 확인 UI 도 메시지가 아니다.
          카드 자체는 `InventoryConfirmCard` 를 그대로 쓴다 — 채팅 경로와 **같은 화면에서**
          고치게 해야 "말로 했을 때랑 버튼으로 했을 때가 다르다"가 안 생긴다. */}
      <Dialog visible={cookTarget !== null} onClose={() => setCookTarget(null)}>
        {cookTarget && (
          <InventoryConfirmCard
            proposal={cookTarget.proposal}
            options={options}
            busy={resolvingId === cookTarget.messageId}
            onApply={(req) => void handleCook(cookTarget.messageId, req)}
            // 취소는 서버에 알리지 않는다 — 아직 아무것도 저장한 게 없다.
            onDismiss={() => setCookTarget(null)}
          />
        )}
      </Dialog>

      <SavedDishDialog
        visible={saveTarget !== null}
        initial={saveTarget?.draft ?? EMPTY_SAVED_DISH_DRAFT}
        savedId={saveTarget?.savedId ?? null}
        busy={savingDish}
        error={saveError}
        onClose={() => {
          setSaveError(null);
          setSaveTarget(null);
        }}
        onSave={handleSaveDish}
        onUnsave={handleUnsaveDish}
      />
    </Screen>
  );
}
