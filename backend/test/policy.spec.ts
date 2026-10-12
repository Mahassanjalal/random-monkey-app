import { genderAccepts, mutuallyCompatible } from '../src/matchmaking/policy';
import { Gender, SeekingPreference } from '@bundle/shared';

describe('matching policy', () => {
  it('everyone matches everyone', () => {
    expect(
      mutuallyCompatible(
        { userId: 'a', gender: Gender.MALE, seeking: SeekingPreference.EVERYONE, preferVerified: false },
        { userId: 'b', gender: Gender.FEMALE, seeking: SeekingPreference.EVERYONE, preferVerified: false },
      ),
    ).toBe(true);
  });
  it('mutual men/women preferences are enforced', () => {
    expect(
      mutuallyCompatible(
        { userId: 'a', gender: Gender.MALE, seeking: SeekingPreference.WOMEN, preferVerified: false },
        { userId: 'b', gender: Gender.FEMALE, seeking: SeekingPreference.MEN, preferVerified: false },
      ),
    ).toBe(true);
    expect(
      mutuallyCompatible(
        { userId: 'a', gender: Gender.MALE, seeking: SeekingPreference.WOMEN, preferVerified: false },
        { userId: 'b', gender: Gender.MALE, seeking: SeekingPreference.WOMEN, preferVerified: false },
      ),
    ).toBe(false);
  });
  it('unknown gender only matches EVERYONE', () => {
    expect(genderAccepts(SeekingPreference.EVERYONE, null)).toBe(true);
    expect(genderAccepts(SeekingPreference.MEN, null)).toBe(false);
  });
});
