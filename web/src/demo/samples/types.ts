/** Shape of a synthetic sample document: page lines, field regions and simulated extraction output. */

import type { ExtractedField, Language, Region } from '../../domain/schemas.js';

export interface SampleLine {
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: 400 | 600 | 700;
  hand?: boolean;
  anchor?: 'start' | 'middle';
  muted?: boolean;
}

export interface SampleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SampleField {
  key: string;
  label: string;
  value: string;
  region: Region | null;
  quality: ExtractedField['quality'];
}

export interface Sample {
  id: string;
  title: string;
  docType: string;
  language: Language;
  lines: SampleLine[];
  rects: SampleRect[];
  fields: SampleField[];
  originalText: string;
  transliteration: string | null;
  translation: string | null;
  qualityWarnings: string[];
}

export const PAGE_W = 600;

export const PAGE_H = 820;

export function r(x: number, y: number, w: number, h: number): Region {
  return { x, y, w, h };
}
