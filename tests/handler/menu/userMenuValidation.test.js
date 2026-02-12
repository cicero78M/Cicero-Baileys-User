import { validateNRP } from '../../../src/handler/menu/userMenuValidation.js';

describe('validateNRP', () => {
  it('accepts normal ASCII digits', () => {
    const result = validateNRP('87100529');

    expect(result).toEqual({ valid: true, digits: '87100529', error: '' });
  });

  it('normalizes fullwidth digits to ASCII before validation', () => {
    const result = validateNRP('８７１００５２９');

    expect(result).toEqual({ valid: true, digits: '87100529', error: '' });
  });

  it('normalizes Arabic-Indic digits to ASCII before validation', () => {
    const result = validateNRP('٨٧١٠٠٥٢٩');

    expect(result).toEqual({ valid: true, digits: '87100529', error: '' });
  });

  it('strips non-digit characters after normalization', () => {
    const result = validateNRP('NRP: ٨٧١-００５.２９/abc');

    expect(result).toEqual({ valid: true, digits: '87100529', error: '' });
  });
});
