import { GetProfileResultSchema, PROFILE_ROLES, type UserProfile } from '@fund-tracker/shared';
import { describe, expect, it } from 'vitest';
import { RoleSchema } from '../../domain/schemas.js';
import { demoEnabled } from './config.js';
import { profileToSession } from './profile.js';

const PROFILE: UserProfile = {
  name: 'Anjali Patil',
  employeeId: 'EMP-10233',
  branchId: 'br-shirur',
  role: 'branch_manager',
  aiEnabled: true,
  enabled: true,
};

describe('profileToSession', () => {
  it('builds a cloud (non-demo) session from the profile and the account', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(profileToSession('uid-1', 'a@b.c', PROFILE, true, now)).toEqual({
      name: 'Anjali Patil',
      employeeId: 'EMP-10233',
      role: 'branch_manager',
      branchId: 'br-shirur',
      signedInAt: '2026-10-17T10:00:00.000Z',
      remember: true,
      demo: false,
      uid: 'uid-1',
      email: 'a@b.c',
      aiEnabled: true,
    });
  });

  it('carries the AI switch through, off by default for a profile without it', () => {
    expect(profileToSession('u', null, { ...PROFILE, aiEnabled: false }, false).aiEnabled).toBe(
      false,
    );
  });
});

describe('roles stay in sync', () => {
  it('the shared profile roles equal the roles the app understands', () => {
    expect([...PROFILE_ROLES]).toEqual([...RoleSchema.options]);
  });
});

describe('GetProfileResultSchema', () => {
  it('accepts a signed-in person with no profile (account not set up)', () => {
    expect(
      GetProfileResultSchema.safeParse({ uid: 'u', email: null, profile: null }).success,
    ).toBe(true);
  });

  it('accepts a full profile', () => {
    expect(
      GetProfileResultSchema.safeParse({ uid: 'u', email: 'a@b.c', profile: PROFILE }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown role', { ...PROFILE, role: 'superuser' }],
    ['a missing branch', { ...PROFILE, branchId: '' }],
    ['AI typed as text', { ...PROFILE, aiEnabled: 'yes' }],
  ])('rejects %s, so a bad server reply can never create a session', (_label, profile) => {
    expect(GetProfileResultSchema.safeParse({ uid: 'u', email: null, profile }).success).toBe(
      false,
    );
  });
});

describe('demoEnabled', () => {
  it('keeps the demo on unless explicitly switched off', () => {
    expect(demoEnabled({})).toBe(true);
    expect(demoEnabled({ VITE_ENABLE_DEMO: '' })).toBe(true);
    expect(demoEnabled({ VITE_ENABLE_DEMO: 'true' })).toBe(true);
    expect(demoEnabled({ VITE_ENABLE_DEMO: 'FALSE' })).toBe(true);
    expect(demoEnabled({ VITE_ENABLE_DEMO: 'false' })).toBe(false);
  });
});
