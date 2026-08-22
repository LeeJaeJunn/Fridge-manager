import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * 메일 발송 — **벤더(Gmail SMTP)를 이 파일 안에 가둔다.**
 *
 * 바깥에 노출하는 건 `send(to, subject, text)` 하나뿐이라, 호출자(인증 코드 발송)는 nodemailer 도
 * SMTP 도 모른다. `RecipeService`(네이버)·`OcrService`(CLOVA)와 같은 격리다.
 *
 * 자격증명은 **앱 비밀번호**(2단계 인증 필요)이고 구글 계정 비밀번호가 아니다.
 * 발송 전용 계정을 쓰는 게 좋다 — 앱 비밀번호가 새더라도 개인 메일함이 노출되지 않는다.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  /**
   * 발송이 설정돼 있는지.
   *
   * ⚠️ **생성자에서 키를 강제하지 않는 게 의도다**(`getOrThrow` 금지). CI 는 `.env` 없이
   * `AppModule` 을 부팅해 e2e 를 돌리므로, 여기서 던지면 `pnpm verify` 가 통째로 깨진다.
   * `NAVER_OCR_*` 를 `env.validation.ts` 의 필수 목록에 넣지 않은 것과 같은 판단이다.
   */
  readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    const user = config.get<string>('MAIL_USER');
    // 앱 비밀번호는 화면에 4칸씩 띄어 표시돼서 공백이 섞여 들어오기 쉽다 — 여기서 걷어낸다.
    const pass = config.get<string>('MAIL_APP_PASSWORD')?.replace(/\s+/g, '');

    this.isConfigured = Boolean(user && pass);
    this.from = config.get<string>('MAIL_FROM') || (user ?? '');
    this.transporter = this.isConfigured
      ? createTransport({
          host: 'smtp.gmail.com',
          port: 587, // STARTTLS
          secure: false,
          auth: { user, pass },
        })
      : null;

    if (!this.isConfigured) {
      this.logger.warn('MAIL_USER/MAIL_APP_PASSWORD 가 없어 메일 발송이 꺼져 있습니다.');
    }
  }

  /**
   * 메일 한 통 발송. 실패하면 **예외를 던진다** — 벤더 층이라 그게 맞다(호출자가 감싸서 판단).
   *
   * ⚠️ **수신자·본문을 로그에 남기지 않는다.** 본문에 인증 코드가 들어 있어서, 로그에 찍히면
   * 로그를 볼 수 있는 사람이 남의 계정을 인증할 수 있다.
   */
  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException('메일 발송이 설정되지 않았습니다.');
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
      this.logger.log(`메일 발송 완료 (subject=${subject})`);
    } catch (err) {
      // 벤더 에러(SMTP 응답·인증 실패)가 바깥으로 새지 않게 여기서 변환한다.
      this.logger.error('메일 발송 실패', err as Error);
      throw new ServiceUnavailableException(
        '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }
}
