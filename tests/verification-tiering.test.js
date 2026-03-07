const { inferVerificationTier } = require('../lib/commands.cjs');

describe('verification tiering', () => {
  test('returns high-risk for security-sensitive contracts', () => {
    const result = inferVerificationTier('Auth migration with payment endpoint changes');
    expect(result.tier).toBe('high-risk');
  });

  test('returns standard for moderate-risk contracts', () => {
    const result = inferVerificationTier('API endpoint refactor with integration update');
    expect(result.tier).toBe('standard');
  });

  test('returns basic for low-risk contracts', () => {
    const result = inferVerificationTier('Rename component label text');
    expect(result.tier).toBe('basic');
  });
});

