import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import type {
  AddIngredientInputType,
  ExpirySourceType,
  IngredientType,
  InventoryOptionsType,
  UpdateIngredientRequestType,
} from '@companion/types';

import { Button } from './Button';
import { ChipGroup } from './ChipGroup';

const PLACEHOLDER = '#A1A1AA'; // ink-faint
const ICON_COLOR = '#6E6E78'; // ink-soft — Ionicons 는 className 으로 색을 못 받는다
const INK = '#27272A'; // ink — 네이티브 휠도 className 을 못 받아 색을 직접 넘긴다
const MS_PER_DAY = 86_400_000;

/**
 * 날짜 휠의 위아래 한계. 막아 두면 굴릴 거리가 줄고 2199년 같은 값이 실수로 들어가지 않는다.
 *
 * ⚠️ **절대 연도(2026~2050)를 박지 않는다** — 해가 지나면 그대로 틀린 범위가 된다(2050년에
 * 열면 고를 수 있는 해가 하나뿐이다). 오늘을 기준으로 잡으면 그 문제가 아예 생기지 않는다.
 * 과거를 1년 열어두는 건 **이미 지난 소비기한도 기록·교정할 수 있어야** 하기 때문이다
 * (냉장고 화면과 홈 "먼저 먹어요"는 이미 지난 재료를 보여주는 걸 전제로 한다).
 */
const WHEEL_PAST_YEARS = 1;
const WHEEL_FUTURE_YEARS = 25;

function shiftYears(base: Date, years: number): Date {
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * 행 하나의 공통 리듬 — 라벨은 왼쪽, 값·컨트롤은 오른쪽. 네 줄이 전부 이걸 지킨다.
 *
 * **구분선을 두지 않는다.** 네 줄뿐이라 선까지 그으면 틴트 박스 안이 격자로 잘려 답답해진다.
 * 줄을 가르는 일은 여백(박스의 `gap`)이 하고, 좌우 정렬이 이미 라벨과 값을 갈라준다.
 * 가로 여백은 박스가 들고 세로만 여기서 준다 — 펼쳐지는 패널도 같은 좌우 여백을 써야 해서다.
 */
const ROW = 'flex-row items-center justify-between gap-3 py-3';
const ROW_LABEL = 'text-[15px] text-ink-soft';
const ROW_VALUE = 'text-[15px] font-medium text-ink';

/**
 * 폼이 돌려주는 값 — 추가·수정이 같은 모양을 쓴다.
 *
 * 만료일은 **두 필드가 한 짝**이다: `expiresAt` 이 null 이면 미설정이고, 값이 있으면
 * `expirySource` 가 그 날짜를 직접 골랐는지(`USER`) 기본값에 맡겼는지(`ESTIMATED`)를 말한다.
 */
export type FormValues = {
  name: string;
  category: string;
  storage: string;
  quantityNote: string;
  /** ISO 날짜, 또는 **null = 미설정**(기본 상태) */
  expiresAt: string | null;
  expirySource: ExpirySourceType;
};

/**
 * 폼 초기값 — 값(FormValues)에 더해 **만료일 UI 를 어떻게 시작할지** 정하는 필드를 받는다.
 * 수정 경로에서만 의미가 있고, 추가 경로는 통째로 비운다.
 */
export type FormInitialType = Partial<FormValues> & {
  /**
   * "기본값" 계산의 기준일(ISO) — 비우면 오늘(= 새로 추가하는 경우).
   * 소비기한은 **구입 시점부터** 세는 것이므로 이미 있는 재료를 고칠 때는 등록일을 넘겨야 한다.
   * 오늘 기준으로 재면 두 달 둔 재료가 방금 산 것처럼 계산돼 유통기한이 뒤로 밀린다.
   */
  addedAt?: string;
};

/**
 * FormValues → `PATCH /inventory/:id` 본문.
 *
 * ⚠️ **`expiresAt` 을 항상 싣는다 — `null` 도 포함해서.** 서버는 생략을 "미변경"으로 읽으므로,
 * null 을 빼면 **정해둔 날짜를 미설정으로 되돌리는 조작이 아예 불가능해진다.**
 */
export const toPatch = (v: FormValues): UpdateIngredientRequestType => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  // 빈 문자열이면 서버가 미변경으로 처리 — v1 은 수량 비우기를 지원하지 않는다.
  quantityNote: v.quantityNote,
  expiresAt: v.expiresAt,
  ...(v.expiresAt ? { expirySource: v.expirySource } : {}),
});

/**
 * FormValues → `POST /inventory` 항목.
 * patch 와 달리 **빈 값은 아예 빼고 보낸다** — 추가는 "미변경" 이라는 개념이 없어서,
 * 빈 문자열을 실어 보내면 없는 수량 메모가 빈 값으로 저장된다.
 */
export const toAddInput = (v: FormValues): AddIngredientInputType => ({
  name: v.name,
  category: v.category as IngredientType['category'],
  storage: v.storage as IngredientType['storage'],
  ...(v.quantityNote ? { quantityNote: v.quantityNote } : {}),
  ...(v.expiresAt ? { expiresAt: v.expiresAt, expirySource: v.expirySource } : {}),
});

/** 유통기한을 정하는 세 갈래 (컴포넌트 안 `expiryMode` 주석 참고). */
type ExpiryMode = 'none' | 'default' | 'custom';

/** 선택지 라벨 — 서버 vocab 이 아니라 이 폼의 UI 상태라서 여기가 소유한다. */
const EXPIRY_MODE_OPTIONS: { value: ExpiryMode; label: string }[] = [
  { value: 'none', label: '미설정' },
  { value: 'default', label: '기본값' },
  { value: 'custom', label: '직접 고르기' },
];

/** "YYYY년 M월 D일" — 펼친 상태에서 쓰는 전체 표기. */
function formatKoreanDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 접힌 행에 들어가는 짧은 표기 — "9월 12일".
 * 해가 넘어가면(냉동 180일 등) 연도를 붙인다. 같은 해에 연도를 적으면 행만 길어진다.
 */
function formatShortDate(d: Date): string {
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `;
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 날짜만 의미 있으므로 정오로 고정해 UTC 변환 시 날짜가 밀리는 것을 막는다. */
function toDateOnlyIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
}

/**
 * 접히는 행 — 오른쪽에 **현재 값**을 보여주고, 누르면 아래로 선택 UI 가 펼쳐진다.
 *
 * 값을 접힌 상태에서도 계속 노출하는 게 요점이다. 라벨만 있으면 무엇이 골라져 있는지 보려고
 * 매번 펼쳐야 하고, 그러면 접은 이득이 사라진다.
 */
function DisclosureRow({
  label,
  value,
  open,
  onPress,
}: {
  label: string;
  value: string;
  open: boolean;
  onPress: () => void;
}) {
  // 눌림 표시는 배경색이 아니라 투명도다 — 구분선을 없앤 박스에서 행 하나만 회색 띠가 되면
  // 방금 걷어낸 가로줄이 다른 모양으로 되살아난다.
  return (
    <Pressable onPress={onPress} className={`${ROW} active:opacity-60`}>
      <Text className={ROW_LABEL}>{label}</Text>
      <View className="flex-1 flex-row items-center justify-end gap-1">
        <Text className={ROW_VALUE} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={ICON_COLOR} />
      </View>
    </Pressable>
  );
}

/**
 * 재료 입력 필드 묶음 — **추가·수정·스캔 확인이 모두 이 한 벌을 쓴다.**
 *
 * 껍데기(전체 화면 라우트 / 모달 / 인라인)만 호출자가 고르고 안의 필드는 여기 하나뿐이다.
 * 예전엔 `showExpiry` 로 유통기한 섹션을 추가 경로에서만 켰는데, 그 결과 같은 "재료 한 건"을
 * 다루면서 화면마다 고칠 수 있는 것이 달랐다(수정에서는 유통기한을 못 고침). 지금은 항상 노출하고,
 * 수정 경로는 현재 값(`initial.expiresAt`/`expirySource`)으로 시작한다.
 *
 * **레이아웃은 "이름은 위, 나머지는 라벨-값 한 줄"이다.** 예전엔 분류 11개 + 보관 3개 칩과
 * 날짜 피커가 **전부 동시에 펼쳐져** 있어서, 한 재료를 고치는 화면인데 선택지가 스무 개 넘게
 * 깔렸다. 지금은 값이 많은 것(분류·유통기한)만 접고 값이 셋뿐인 보관은 그대로 둔다 —
 * 3개짜리 선택을 접으면 탭만 늘고 줄어드는 게 없다.
 *
 * ⚠️ **수량은 계속 자유텍스트다.** 숫자 스테퍼(`- 1개 +`)를 붙이지 말 것 — 앱은 실제 소비를
 * 관찰하지 못해서(김치찌개 하나에 대파가 몇 단 줄었는지 모른다) 숫자를 들고 있어도 금방 허구가
 * 되고, 틀린 숫자는 신뢰를 깎는다. 근거는 `schema.prisma` 의 `Ingredient.quantityNote` 주석.
 */
export function IngredientForm({
  options,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  options: InventoryOptionsType;
  initial?: FormInitialType;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'ETC');
  const [storage, setStorage] = useState(initial?.storage ?? 'FRIDGE');
  const [quantityNote, setQuantityNote] = useState(initial?.quantityNote ?? '');
  const [saving, setSaving] = useState(false);

  // 이름은 상단 제목이고 ✎ 를 눌러야 입력칸이 된다 — 이미 있는 재료를 고칠 때 실수로 이름을
  // 바꾸는 걸 줄인다(이름은 사실상 식별키라 바뀌면 병합·매칭 대상이 달라진다).
  // 새로 추가하는 경우(이름 없음)엔 고칠 제목 자체가 없으므로 처음부터 입력 상태로 연다.
  const [nameEditing, setNameEditing] = useState(!initial?.name);

  // 펼침은 **한 번에 하나만** — 둘 다 열리면 접은 의미가 없다(원래 문제로 되돌아간다).
  const [openSection, setOpenSection] = useState<'category' | 'expiry' | null>(null);
  const toggleSection = (s: 'category' | 'expiry') =>
    setOpenSection((prev) => (prev === s ? null : s));

  // 유통기한은 **세 갈래**다. `미설정` 이 기본이고, 나머지 둘은 사용자가 넣기로 했을 때만 나온다.
  //   none    — 안 정함 (서버에 null 로 간다)
  //   default — "기본값": 카테고리×보관 추정일을 **앱이 계산해서** 실어 보낸다(출처 ESTIMATED)
  //   custom  — 휠로 직접 고름 (출처 USER)
  //
  // ⚠️ 예전엔 "기본값 체크가 켜진 상태"가 기본이라 **아무것도 안 해도 추정 날짜가 붙었다.**
  // 이제 기본이 `none` 이고, 추정은 사용자가 그걸 고를 때만 일어난다.
  const initialMode: ExpiryMode = !initial?.expiresAt
    ? 'none'
    : initial.expirySource === 'ESTIMATED'
      ? 'default'
      : 'custom';
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>(initialMode);
  const [customDate, setCustomDate] = useState<Date | null>(
    initialMode === 'custom' && initial?.expiresAt ? new Date(initial.expiresAt) : null,
  );
  const [showPicker, setShowPicker] = useState(false); // Android 다이얼로그 토글

  // 휠 범위는 **마운트 시 한 번만** 정한다 — 굴릴 때마다 새 Date 를 만들어 내려보내면
  // 네이티브 휠이 매 틱 새 props 를 받아 굴림이 끊긴다.
  // 사용자가 예전에 확정해 둔 날이 범위 밖이면(오래 지난 재료) 그 값까지 범위를 넓힌다 —
  // `value` 가 [min, max] 밖이면 휠이 그 값을 못 그린다.
  const [wheelRange] = useState(() => {
    const today = new Date();
    const min = shiftYears(today, -WHEEL_PAST_YEARS);
    const max = shiftYears(today, WHEEL_FUTURE_YEARS);
    const current =
      initialMode === 'custom' && initial?.expiresAt ? new Date(initial.expiresAt) : null;
    return {
      min: current && current < min ? current : min,
      max: current && current > max ? current : max,
    };
  });

  // 서버가 내려준 표(`options.shelfLife`)로 "기본값" 만료일을 계산한다 (분류·보관이 바뀌면 갱신).
  // ⚠️ 이 값이 화면에만 쓰이는 게 아니라 **그대로 서버로 간다** — 서버는 추정하지 않는다.
  const estimateDays = options.shelfLife.days[storage]?.[category] ?? options.shelfLife.defaultDays;
  const estimateBase = initial?.addedAt;
  const estimatedDate = useMemo(() => {
    // 등록일 기준(수정) 또는 오늘(추가) — 위 `addedAt` 주석 참고.
    const base = estimateBase ? new Date(estimateBase) : new Date();
    base.setHours(12, 0, 0, 0); // 정오 고정으로 UTC 변환 시 날짜 밀림 방지
    return new Date(base.getTime() + estimateDays * MS_PER_DAY);
  }, [estimateDays, estimateBase]);
  const effectiveDate = customDate ?? estimatedDate;

  // "기본값"의 날짜 — ⚠️ **처음부터 기본값이던 재료는, 분류·보관이 그대로면 저장된 날짜를 쓴다.**
  // 매번 표로 다시 계산하면 **열기만 해도 날짜가 바뀐다**: 재입고로 `addedAt` 이 옮겨졌거나(날짜는
  // 유지됨) 표 값이 바뀐 뒤라면, 수량만 고치고 저장해도 유통기한이 조용히 밀린다.
  // 예전엔 서버의 `reEstimate` 가 "분류·보관이 바뀌었을 때만 재계산"으로 이걸 막았는데, 계산이 앱으로
  // 오면서 그 규칙도 여기로 와야 한다. 분류·보관을 바꾸면 그때는 새 기준으로 다시 계산한다.
  const shelfUnchanged = category === initial?.category && storage === initial?.storage;
  const defaultDate =
    initialMode === 'default' && shelfUnchanged && initial?.expiresAt
      ? new Date(initial.expiresAt)
      : estimatedDate;

  // 세 갈래를 **날짜 하나로 접는다** — 저장·표시가 모두 이 값을 쓰므로 분기가 한 곳에만 있다.
  const resolvedExpiry =
    expiryMode === 'none' ? null : expiryMode === 'default' ? defaultDate : effectiveDate;

  // 접힌 행에 보여줄 현재 값. 분류는 서버가 내려준 라벨을 쓴다.
  // ⚠️ 유통기한에 "쯤"/"까지"를 붙이지 않는다 — 여기 있는 날짜는 전부 사용자가 넣기로 한 값이라
  //    흐릴 이유가 없다(예전엔 서버가 추정해 채운 값이라 구분이 필요했다).
  const categoryLabel = options.categories.find((o) => o.value === category)?.label ?? category;
  const expiryLabel = resolvedExpiry ? formatShortDate(resolvedExpiry) : '미설정';

  function onChangeDate(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event.type === 'set' && date) setCustomDate(date);
  }

  // 이름이 비면 제목으로 접을 게 없다 → 입력 상태를 유지한다(저장 버튼도 어차피 잠겨 있다).
  const exitNameEdit = () => {
    if (name.trim()) setNameEditing(false);
  };

  async function submit() {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        storage,
        quantityNote: quantityNote.trim(),
        expiresAt: resolvedExpiry ? toDateOnlyIso(resolvedExpiry) : null,
        expirySource:
          expiryMode === 'none' ? 'NONE' : expiryMode === 'default' ? 'ESTIMATED' : 'USER',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-5">
      {/* 이름 — 제일 위, 카드 밖. 아래 행들과 리듬을 일부러 달리해서 "이 재료가 무엇인지"가
          한눈에 잡히게 한다(나머지는 그 재료의 속성이다). */}
      {nameEditing ? (
        <TextInput
          className="text-2xl font-bold text-ink"
          value={name}
          onChangeText={setName}
          placeholder="재료 이름"
          placeholderTextColor={PLACEHOLDER}
          maxLength={options.limits.nameMax}
          autoFocus
          returnKeyType="done"
          // 안드로이드는 TextInput 에 밑줄을 기본으로 그린다 — 끄지 않으면 이 칸만 입력칸처럼 보인다.
          underlineColorAndroid="transparent"
          onBlur={exitNameEdit}
          onSubmitEditing={exitNameEdit}
        />
      ) : (
        <Pressable
          onPress={() => setNameEditing(true)}
          hitSlop={8}
          accessibilityLabel={`${name} 이름 수정`}
          className="flex-row items-center gap-2"
        >
          <Text className="shrink text-2xl font-bold text-ink" numberOfLines={1}>
            {name}
          </Text>
          <Ionicons name="pencil" size={16} color={ICON_COLOR} />
        </Pressable>
      )}

      {/* 설정 박스 — **면은 흰색이고 테두리에만 색이 있다.** 저장 버튼(`bg-lavender`)과 같은
          계열을 40% 로 옅게 쓴 거라, 색이 하나 더 늘지 않으면서 이 묶음이 한 덩어리로 묶인다
          (기본 `border-line` 회색보다 이 폼이 "설정하는 곳"임을 조용히 말해준다).
          면을 채우지 않는 게 요점이다 — 값 네 줄을 읽는 곳이라 바탕이 조용해야 글자가 산다.
          구분선 대신 `gap` 으로 줄을 가르고, 좌우 여백은 여기가 소유한다(행·펼침 패널이 공유). */}
      <View className="gap-2 rounded-2xl border border-lavender/40 bg-white px-4 py-3">
        {/* 분류 — 선택지가 11개라 접는다. 고르면 바로 닫아서 "골랐다"가 값으로 확인된다. */}
        <View>
          <DisclosureRow
            label="분류"
            value={categoryLabel}
            open={openSection === 'category'}
            onPress={() => toggleSection('category')}
          />
          {openSection === 'category' ? (
            <View className="pb-3">
              <ChipGroup
                size="sm"
                options={options.categories}
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setOpenSection(null);
                }}
              />
            </View>
          ) : null}
        </View>

        {/* 보관 — 3개뿐이라 접지 않는다(접으면 탭만 늘고 줄어드는 게 없다).
            좁은 모달에서도 라벨과 한 줄에 들어가야 해서 `sm` 칩이다. */}
        <View className={ROW}>
          <Text className={ROW_LABEL}>보관</Text>
          <ChipGroup
            size="sm"
            className="flex-1 justify-end"
            options={options.storages}
            value={storage}
            onChange={setStorage}
          />
        </View>

        {/* 수량 — 자유텍스트다(위 ⚠️ 참고).
            ⚠️ **입력칸처럼 보이지 않게 둔다** — 배경·테두리·밑줄 없이 값 자리에 글자만 앉는다.
            다른 행의 값과 글꼴·정렬이 같아서 네 줄이 한 덩어리로 읽히고, 비어 있을 때는
            placeholder 가 흐린 글씨로 "여기 적을 수 있다"를 대신 말해준다. */}
        <View className={ROW}>
          <Text className={ROW_LABEL}>수량</Text>
          <TextInput
            className={`flex-1 text-right ${ROW_VALUE}`}
            value={quantityNote}
            onChangeText={setQuantityNote}
            placeholder="한 모, 2개, 반 팩"
            placeholderTextColor={PLACEHOLDER}
            maxLength={options.limits.quantityNoteMax}
            returnKeyType="done"
            underlineColorAndroid="transparent"
          />
        </View>

        {/* 유통기한 — 선택지 + 날짜 피커가 통째로 자리를 먹어서 접는다.
            분류와 달리 고른 뒤 자동으로 닫지 않는다 — iOS 인라인 피커는 스크롤하며 여러 번
            건드리는 물건이라, 한 번 굴릴 때마다 닫히면 못 쓴다. */}
        <View>
          <DisclosureRow
            label="유통기한"
            value={expiryLabel}
            open={openSection === 'expiry'}
            onPress={() => toggleSection('expiry')}
          />
          {openSection === 'expiry' ? (
            <View className="gap-2 pb-3">
              {/* 세 갈래를 칩으로 — 예전엔 "기본값" 체크박스 하나라 **켜진 게 기본**이었고,
                  아무것도 안 해도 추정 날짜가 붙었다. 이제 `미설정` 이 어엿한 선택지다. */}
              <ChipGroup
                size="sm"
                options={EXPIRY_MODE_OPTIONS}
                value={expiryMode}
                onChange={(v) => setExpiryMode(v as ExpiryMode)}
              />

              {expiryMode === 'none' ? (
                <Text className="text-sm text-ink-faint">
                  유통기한을 정하지 않아요. 나중에 언제든 넣을 수 있어요.
                </Text>
              ) : expiryMode === 'default' ? (
                <Text className="text-sm text-ink-faint">
                  {formatKoreanDate(defaultDate)} · 보통 {estimateDays}일쯤 가는 재료예요
                </Text>
              ) : Platform.OS === 'ios' ? (
                /* 휠(스피너) — 년/월/일 3열을 굴려 가운데 띠에 맞추는 그 모양이다.
                   ⚠️ `display` 를 안 주면 iOS 14+ 기본값이 **달력 그리드**라 폼 안에서 너무 크고
                   무겁다. `locale` 이 "2026년 9월 6일" 순서와 라벨을 만들고, `themeVariant` 는
                   기기가 다크 모드여도 이 폼(밝은 배경)에 맞게 고정한다. */
                <DateTimePicker
                  value={effectiveDate}
                  mode="date"
                  display="spinner"
                  locale="ko-KR"
                  themeVariant="light"
                  textColor={INK}
                  minimumDate={wheelRange.min}
                  maximumDate={wheelRange.max}
                  onChange={onChangeDate}
                />
              ) : (
                <>
                  {/* 안드로이드는 인라인이 안 되고 네이티브 다이얼로그로 뜬다 — 그래서 여는
                      버튼이 따로 필요하다. `display="spinner"` 면 그 다이얼로그도 같은 휠이다. */}
                  <Pressable
                    onPress={() => setShowPicker(true)}
                    className="rounded-xl bg-sand px-4 py-3"
                  >
                    <Text className="text-base text-ink">{formatKoreanDate(effectiveDate)}</Text>
                  </Pressable>
                  {showPicker ? (
                    <DateTimePicker
                      value={effectiveDate}
                      mode="date"
                      display="spinner"
                      minimumDate={wheelRange.min}
                      maximumDate={wheelRange.max}
                      onChange={onChangeDate}
                    />
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="취소" variant="secondary" onPress={onCancel} />
        </View>
        <View className="flex-1">
          <Button label={submitLabel} onPress={submit} loading={saving} disabled={!name.trim()} />
        </View>
      </View>
    </View>
  );
}
