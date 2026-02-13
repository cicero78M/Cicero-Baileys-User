import { validateNRP } from '../../../src/handler/menu/userMenuValidation.js';

describe('validateNRP', () => {
  it('accepts normal ASCII digits', () => {
    const result = validateNRP('69040249');

    expect(result).toEqual({ valid: true, digits: '69040249', error: '' });
  });

  it('normalizes unicode digits to ASCII before validation', () => {
    const result = validateNRP('٦٩٠٤٠٢٤٩');

    expect(result).toEqual({ valid: true, digits: '69040249', error: '' });
  });

  it('rejects mixed context containing multiple numeric groups like pagination and NRP', () => {
    const result = validateNRP('Laporan 1/2 NRP 69040249');

    expect(result.valid).toBe(false);
    expect(result.digits).toBe('');
    expect(result.error).toContain('Kirim *NRP/NIP saja* dalam satu balasan');
  });

  it('rejects empty or non-digit input', () => {
    expect(validateNRP('   ').valid).toBe(false);
    expect(validateNRP('halo').valid).toBe(false);
  });
});
