import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * 문자열의 UTF-8 바이트 길이 상한을 검증한다.
 * (bcrypt 는 72바이트 초과분을 잘라내므로, 문자 수가 아니라 바이트 수로 제한해야
 *  한글·이모지 비밀번호가 조용히 절단되는 것을 막는다 — @MaxLength 는 문자 수라 부족)
 */
export function MaxByteLength(max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxByteLength',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max;
        },
        defaultMessage() {
          return `비밀번호는 최대 ${max}바이트까지 가능합니다.`;
        },
      },
    });
  };
}
