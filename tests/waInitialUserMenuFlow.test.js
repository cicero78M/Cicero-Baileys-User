import { resolveInitialUserMenuFlow } from '../src/utils/waInitialUserMenuFlow.js';

describe('resolveInitialUserMenuFlow', () => {
  test('unlinked user + first message valid NRP -> direct NRP verification flow', () => {
    const result = resolveInitialUserMenuFlow({
      allowUserMenu: true,
      isAdminCommand: false,
      lowerText: '٨٧٠٢٠٩٩٠',
      originalText: '٨٧٠٢٠٩٩٠',
      hasAnySession: false,
      hadSessionAtStart: false,
      isInTimeoutCooldown: false,
      isLinked: false,
    });

    expect(result).toMatchObject({
      shouldEvaluate: true,
      shouldAutoStart: true,
      useDirectNrpInput: true,
      normalizedNrp: '87020990',
    });
  });

  test('unlinked user + first message invalid -> normal prompt flow', () => {
    const result = resolveInitialUserMenuFlow({
      allowUserMenu: true,
      isAdminCommand: false,
      lowerText: 'halo admin',
      originalText: 'halo admin',
      hasAnySession: false,
      hadSessionAtStart: false,
      isInTimeoutCooldown: false,
      isLinked: false,
    });

    expect(result).toMatchObject({
      shouldEvaluate: true,
      shouldAutoStart: true,
      useDirectNrpInput: false,
    });
  });

  test('linked user + first random digits -> does not trigger bind flow', () => {
    const result = resolveInitialUserMenuFlow({
      allowUserMenu: true,
      isAdminCommand: false,
      lowerText: '12345678',
      originalText: '12345678',
      hasAnySession: false,
      hadSessionAtStart: false,
      isInTimeoutCooldown: false,
      isLinked: true,
    });

    expect(result).toMatchObject({
      shouldEvaluate: true,
      shouldAutoStart: false,
      useDirectNrpInput: false,
    });
  });

  test('guard: when session already active, do not apply initial-session optimization', () => {
    const result = resolveInitialUserMenuFlow({
      allowUserMenu: true,
      isAdminCommand: false,
      lowerText: '87020990',
      originalText: '87020990',
      hasAnySession: true,
      hadSessionAtStart: true,
      isInTimeoutCooldown: false,
      isLinked: false,
    });

    expect(result).toMatchObject({
      shouldEvaluate: false,
      shouldAutoStart: false,
      useDirectNrpInput: false,
    });
  });
});
