import type { Gender, SeekingPreference } from '@bundle/shared';

// Matching policy engine.
//
// Core rules:
// 1. Mutual eligibility: A accepts B's gender AND B accepts A's gender.
// 2. The `maleQueueAllocationTarget` parameter NEVER overrides user preferences —
//    it only balances which *pairs* are formed when multiple candidates exist.
// 3. Explicit user settings always win. Period.

export interface CandidatePrefs {
  userId: string;
  gender: Gender | null;
  seeking: SeekingPreference;
  preferVerified: boolean;
}

export function genderAccepts(pref: SeekingPreference, otherGender: Gender | null): boolean {
  if (String(pref) === 'EVERYONE') return true;
  if (otherGender === null) return false; // unknown gender only matches explicit EVERYONE pref
  if (String(pref) === 'MEN') return String(otherGender) === 'MALE';
  if (String(pref) === 'WOMEN') return String(otherGender) === 'FEMALE';
  return true;
}

export function mutuallyCompatible(a: CandidatePrefs, b: CandidatePrefs): boolean {
  return genderAccepts(a.seeking, b.gender) && genderAccepts(b.seeking, a.gender);
}
