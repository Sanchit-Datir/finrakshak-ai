import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt, parseExtraction, toExtractionResult } from './extraction.js';
import { parseWebEnv } from './env.js';

let n = 0;
const makeId = (p: string): string => `${p}${String(++n)}`;

const valid = {
  docType: 'aadhaar',
  language: 'mr',
  fields: [
    { key: 'applicant_name_original', value: '  सुनील पाटील ', page: 0, quality: 'clear' },
    { key: 'aadhaar_masked', value: '1234 5678 9012', page: 0, quality: 'clear' },
    { key: 'made_up_key', value: 'x', page: 0, quality: 'clear' },
    { key: 'dob', value: '   ', page: 0, quality: 'low' },
  ],
};

describe('parseExtraction (B-13)', () => {
  it('rejects malformed JSON and non-conforming shapes', () => {
    expect(parseExtraction('not json')).toBeNull();
    expect(parseExtraction('')).toBeNull();
    expect(parseExtraction(JSON.stringify({ docType: null, language: 'fr', fields: [] }))).toBeNull();
    expect(parseExtraction(JSON.stringify({ ...valid, fields: [{ key: 'dob' }] }))).toBeNull();
  });
  it('rejects more than the field cap', () => {
    const fields = Array.from({ length: 41 }, () => valid.fields[0]);
    expect(parseExtraction(JSON.stringify({ ...valid, fields }))).toBeNull();
  });
  it('accepts a conforming response', () => {
    expect(parseExtraction(JSON.stringify(valid))?.fields).toHaveLength(4);
  });
});

describe('toExtractionResult', () => {
  const out = parseExtraction(JSON.stringify(valid));
  if (out === null) throw new Error('fixture must parse');
  const res = toExtractionResult('d1', out, 1, makeId);

  it('keeps only catalogue keys with non-empty values', () => {
    expect(res.fields.map((f) => f.key)).toEqual(['applicant_name_original', 'aadhaar_masked']);
    expect(res.dropped).toBe(2);
  });
  it('marks fields as unreviewed Gemini output with catalogue labels', () => {
    const f = res.fields[0];
    expect(f?.origin).toBe('gemini');
    expect(f?.state).toBe('unreviewed');
    expect(f?.value).toBe('सुनील पाटील');
    expect(f?.machineValue).toBe(f?.value);
    expect(f?.label).toBe('Applicant name (original script)');
  });
  it('re-masks identifiers the model returned in full (B-16)', () => {
    expect(res.fields[1]?.value).toBe('XXXX XXXX 9012');
  });
  it('drops unknown document types and clamps page indexes', () => {
    const odd = toExtractionResult(
      'd2',
      { docType: 'spaceship', language: 'en', fields: [{ key: 'dob', value: '1/1/1990', page: 9, quality: 'clear' }] },
      2,
      makeId,
    );
    expect(odd.docType).toBeNull();
    expect(odd.fields[0]?.page).toBe(1);
  });
});

describe('buildExtractionPrompt (B-16)', () => {
  it('delimits the file as untrusted data and lists catalogue keys', () => {
    const p = buildExtractionPrompt(null);
    expect(p).toContain('untrusted data');
    expect(p).toContain('survey_number');
    expect(buildExtractionPrompt('satbara')).toContain('"satbara"');
  });
});

describe('parseWebEnv', () => {
  const base = {
    VITE_FIREBASE_API_KEY: 'k',
    VITE_FIREBASE_AUTH_DOMAIN: 'd',
    VITE_FIREBASE_PROJECT_ID: 'p',
    VITE_FIREBASE_APP_ID: 'a',
  };
  it('returns null when config is missing or blank (demo mode)', () => {
    expect(parseWebEnv({})).toBeNull();
    expect(parseWebEnv({ ...base, VITE_FIREBASE_APP_ID: '' })).toBeNull();
  });
  it('defaults the model and treats a blank App Check key as unset', () => {
    const env = parseWebEnv({ ...base, VITE_RECAPTCHA_SITE_KEY: '' });
    expect(env?.VITE_GEMINI_MODEL).toBe('gemini-2.5-flash');
    expect(env?.VITE_RECAPTCHA_SITE_KEY).toBeUndefined();
  });
});
