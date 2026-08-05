/**
 * 영수증·사진 인식용 이미지 준비 — 촬영/선택 → 리사이즈·압축 → 업로드용 파일.
 *
 * 여기 상수들이 **정확도와 비용의 조절 손잡이**다. 원본은 4000px·수 MB라 그대로 보내면
 * 업로드가 느리고 LLM 이미지 토큰이 폭증한다. 반대로 너무 줄이면 영수증 글자가 뭉개져
 * 인식이 급락한다 — 그래서 영수증과 냉장고 사진의 값이 다르다.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ScanKindType } from '@companion/types';

/**
 * 종류별 리사이즈 목표(긴 축 px)와 JPEG 품질.
 * 영수증은 작은 글자를 읽어야 해서 넉넉히 두고, 냉장고 사진은 사물만 알아보면 되므로 더 줄인다.
 * 실제 영수증으로 인식률을 재보고 이 숫자를 조절하면 된다(서버 로그에 토큰이 함께 찍힌다).
 */
const PRESETS: Record<ScanKindType, { width: number; compress: number }> = {
  receipt: { width: 1600, compress: 0.85 },
  photo: { width: 1200, compress: 0.8 },
};

/** 업로드할 이미지 — RN 의 FormData 가 이해하는 모양 그대로. */
export type PreparedImageType = { uri: string; name: string; type: string };

/**
 * 원본 uri → 축소·압축된 JPEG.
 *
 * JPEG 로 고정하는 게 중요하다: iOS 기본 촬영 포맷인 HEIC 는 LLM 이 받지 않아서,
 * 변환을 안 하면 **특정 기기에서만 실패**하는 형태로 터진다.
 */
async function prepare(uri: string, kind: ScanKindType): Promise<PreparedImageType> {
  const { width, compress } = PRESETS[kind];
  const rendered = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress });
  return { uri: out.uri, name: `${kind}.jpg`, type: 'image/jpeg' };
}

/** 카메라로 촬영 → 업로드용 이미지. 권한 거부·취소면 null. */
export async function captureForScan(kind: ScanKindType): Promise<PreparedImageType | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return prepare(res.assets[0].uri, kind);
}

/**
 * 갤러리에서 선택 → 업로드용 이미지. 권한 거부·취소면 null.
 * 영수증은 이미 찍어둔 걸 고르는 경우가 많아 촬영만큼 중요한 경로다.
 */
export async function pickForScan(kind: ScanKindType): Promise<PreparedImageType | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  return prepare(res.assets[0].uri, kind);
}
