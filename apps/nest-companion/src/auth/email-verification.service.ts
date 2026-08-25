import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 인증 코드 정책 — **숫자의 단일 출처**다(`shelf-life.ts` 의 `LIMITS` 와 같은 자리).
 *
 * 앱에도 필요한 값(쿨다운·만료)은 **하드코딩하지 말고 `sendCode` 응답으로 받아 쓴다.**
 * 앱이 자기 숫자를 들고 있으면 서버와 어긋나서 "재전송 가능"인데 429 를 맞는 식이 된다.
 */
export const VERIFICATION = {
  /** 코드 자리수. 6자리 = 100만 조합 — 시도 제한(maxFail)이 있어야만 안전하다. */
  codeDigits: 6,
  /** 코드 수명. 5분은 앱↔메일 전환에 촉박해서 10분으로 둔다. */
  ttlMinutes: 10,
  /** 이 횟수를 채우면 그 코드는 죽는다. **지금 유일한 무차별 대입 방어다.** */
  maxFail: 5,
  /** 재전송 쿨다운 — 연타·메일 폭탄 차단 */
  resendCooldownSec: 60,
  /** 시간당 발송 상한 — 61초마다 눌러 Gmail 하루 한도를 태우는 걸 막는다 */
  maxPerHour: 5,
  /** 인증 성공 후 가입까지 유효한 시간 — 인증해두고 한참 뒤 가입하는 걸 막는다 */
  tokenTtlMinutes: 30,
};

/**
 * 코드 용도. **가입용 코드로 비밀번호를 못 바꾸게 가른다** — 발급·검증·증표 대조가 전부
 * `purpose` 로 묶여 있어서, 한쪽 용도로 받은 코드는 다른 쪽에서 아예 조회되지 않는다.
 */
export const PURPOSE_SIGNUP = 'SIGNUP';
export const PURPOSE_RESET = 'RESET_PASSWORD';

/**
 * 용도별 메일 제목. 받는 사람이 **무엇 때문에 온 코드인지** 알아야 한다 —
 * 가입한 적 없는데 "비밀번호 재설정" 메일이 오면 그게 곧 도용 시도 신호다.
 */
const MAIL_SUBJECT: Record<string, string> = {
  [PURPOSE_SIGNUP]: '[뉑좡궈] 이메일 인증번호',
  [PURPOSE_RESET]: '[뉑좡궈] 비밀번호 재설정 인증번호',
};

const sha256 = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/** 6자리 코드. `Math.random` 이 아니라 `randomInt`(CSPRNG) — 예측 가능하면 인증이 무의미하다. */
function generateCode(): string {
  const max = 10 ** VERIFICATION.codeDigits;
  return String(randomInt(0, max)).padStart(VERIFICATION.codeDigits, '0');
}

const minutesFromNow = (m: number): Date => new Date(Date.now() + m * 60_000);

/**
 * 이메일 인증 — 코드 발급·검증·증표 발급.
 *
 * 한 행(`EmailVerification`)이 "코드를 한 번 발급한 사건"의 **상태**이고,
 * 발급(INSERT) → 시도(UPDATE failCount) → 인증(UPDATE verifiedAt·tokenHash) → 소비(DELETE) 로 산다.
 * 각 단계의 근거는 schema.prisma 의 모델 주석 참고.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * 코드 발급 + 메일 발송. **발송할 때마다 새 행을 만든다**(기존 행 수정이 아니다).
   *
   * 덮어쓰면 이력이 사라져 시간당 상한을 셀 수 없다. 옛 행은 검증 대상에서 자연히 빠지고
   * (항상 최신 행만 본다) 1시간 뒤 정리된다.
   */
  async sendCode(
    email: string,
    purpose: string,
  ): Promise<{ retryAfterSec: number; expiresInSec: number; codeDigits: number }> {
    await this.assertSendAllowed(email, purpose);

    const code = generateCode();
    await this.prisma.emailVerification.create({
      data: {
        email,
        purpose,
        codeHash: sha256(code),
        expiresAt: minutesFromNow(VERIFICATION.ttlMinutes),
      },
    });

    // 창 밖으로 나간 옛 행 정리 — 1시간이 기준인 건 그게 시간당 상한의 창이기 때문이다.
    // 그보다 최근 행은 카운트에 필요해서 못 지운다. (`login` 이 만료 세션을 치우는 것과 같은 패턴)
    await this.prisma.emailVerification.deleteMany({
      where: { email, createdAt: { lt: new Date(Date.now() - 3_600_000) } },
    });

    await this.mail.send(
      email,
      MAIL_SUBJECT[purpose] ?? MAIL_SUBJECT[PURPOSE_SIGNUP],
      [
        `인증번호는 ${code} 입니다.`,
        '',
        `${VERIFICATION.ttlMinutes}분 안에 입력해 주세요.`,
        '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.',
      ].join('\n'),
    );

    // ⚠️ 코드는 절대 로그에 남기지 않는다 — 로그를 볼 수 있으면 남의 계정을 인증할 수 있다.
    this.logger.log(`인증코드 발송 (purpose=${purpose})`);
    // 앱이 카운트다운·입력칸을 그리는 데 필요한 숫자는 전부 여기서 내려준다(앱 하드코딩 금지).
    return {
      retryAfterSec: VERIFICATION.resendCooldownSec,
      expiresInSec: VERIFICATION.ttlMinutes * 60,
      codeDigits: VERIFICATION.codeDigits,
    };
  }

  /** 쿨다운 + 시간당 상한. 둘 다 429 로 돌려준다(클라가 "잠시 후"를 구분할 수 있게). */
  private async assertSendAllowed(email: string, purpose: string): Promise<void> {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.emailVerification.findMany({
      where: { email, purpose, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const last = recent[0];
    if (last) {
      const sinceSec = (Date.now() - last.createdAt.getTime()) / 1000;
      if (sinceSec < VERIFICATION.resendCooldownSec) {
        const wait = Math.ceil(VERIFICATION.resendCooldownSec - sinceSec);
        throw new HttpException(`${wait}초 후에 다시 요청해 주세요.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    if (recent.length >= VERIFICATION.maxPerHour) {
      throw new HttpException(
        '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * 코드 검증 → 성공하면 **증표 토큰**을 발급한다.
   *
   * 항상 **최신 행 하나만** 본다. 그래서 재발송 뒤 옛 코드를 넣으면 자동으로 틀린 게 되고,
   * 옛 행을 따로 무효화할 필요가 없다.
   */
  async verifyCode(
    email: string,
    purpose: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    const row = await this.prisma.emailVerification.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
    });

    // 행이 없거나 만료됐으면 같은 메시지 — "발급된 적 없음"과 "만료됨"을 구분해 줄 이유가 없다.
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('인증번호가 만료되었어요. 다시 받아주세요.');
    }
    if (row.verifiedAt) {
      throw new BadRequestException('이미 인증된 코드예요. 다시 받아주세요.');
    }
    if (row.failCount >= VERIFICATION.maxFail) {
      throw new BadRequestException('너무 많이 틀렸어요. 인증번호를 다시 받아주세요.');
    }

    if (row.codeHash !== sha256(code)) {
      const updated = await this.prisma.emailVerification.update({
        where: { id: row.id },
        data: { failCount: { increment: 1 } },
        select: { failCount: true },
      });
      const remaining = Math.max(0, VERIFICATION.maxFail - updated.failCount);
      throw new BadRequestException(
        remaining > 0
          ? `인증번호가 올바르지 않아요. (${remaining}번 남음)`
          : '너무 많이 틀렸어요. 인증번호를 다시 받아주세요.',
      );
    }

    // 증표 원문은 저장하지 않고 해시만 둔다 (refresh 토큰과 같은 방식).
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.update({
      where: { id: row.id },
      data: { verifiedAt: new Date(), tokenHash: sha256(token) },
    });
    this.logger.log(`이메일 인증 성공 (purpose=${purpose})`);
    return { verificationToken: token };
  }

  /**
   * 가입 시 증표 확인 — 통과하면 **실제로 코드를 맞춘 시각**(`verifiedAt`)을 돌려준다.
   * 그 값을 `User.emailVerified` 에 넣는다(지금 시각이 아니라 그때가 진실이라서).
   *
   * ⚠️ 이 단계가 있어야 **코드를 본 클라이언트만** 가입할 수 있다. `verifiedAt` 만 확인하면
   * 남이 인증해둔 이메일에 제3자가 얹혀 가입할 수 있다.
   */
  async assertVerified(email: string, purpose: string, token: string): Promise<Date> {
    const row = await this.prisma.emailVerification.findFirst({
      where: { email, purpose, tokenHash: sha256(token) },
      select: { verifiedAt: true },
    });
    if (!row?.verifiedAt) {
      throw new BadRequestException('이메일 인증이 필요해요.');
    }
    const ageMs = Date.now() - row.verifiedAt.getTime();
    if (ageMs > VERIFICATION.tokenTtlMinutes * 60_000) {
      throw new BadRequestException('인증이 만료되었어요. 다시 인증해 주세요.');
    }
    return row.verifiedAt;
  }

  /** 소비 — 가입이 끝나면 그 이메일의 해당 용도 행을 **전부** 지운다(대기 중인 인증이 남을 이유가 없다). */
  async clear(email: string, purpose: string): Promise<void> {
    await this.prisma.emailVerification.deleteMany({ where: { email, purpose } });
  }
}
