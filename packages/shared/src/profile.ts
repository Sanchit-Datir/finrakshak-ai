import { z } from 'zod';

/**
 * Roles a person can have. Must match RoleSchema in web/src/domain/schemas.ts (a web test checks this)
 * and ROLES in functions/src/services/profiles.ts (Cloud Build cannot install this package).
 */
export const PROFILE_ROLES = [
  'branch_officer',
  'branch_manager',
  'risk_analyst',
  'investigator',
  'administrator',
] as const;

/** A person's profile, stored at `users/{Firebase user ID}` and served by the getProfile function. */
export const UserProfileSchema = z.object({
  name: z.string().min(1).max(120),
  employeeId: z.string().max(40),
  branchId: z.string().min(1).max(60),
  role: z.enum(PROFILE_ROLES),
  aiEnabled: z.boolean(),
  enabled: z.boolean(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Result of the getProfile callable. A null profile means "signed in but not set up". */
export const GetProfileResultSchema = z.object({
  uid: z.string().min(1),
  email: z.string().nullable(),
  profile: UserProfileSchema.nullable(),
});
export type GetProfileResult = z.infer<typeof GetProfileResultSchema>;
