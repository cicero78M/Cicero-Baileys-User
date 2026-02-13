# Panduan Best Practices: Workflow User Request

*Terakhir diperbarui: 2026-02-12*

## Overview

Dokumen ini memberikan panduan best practices untuk mengelola workflow user request di sistem Cicero V2, dengan fokus pada pengalaman pengguna yang optimal dan mencegah kehilangan sesi aktif.

## Masalah yang Sering Dihadapi

### 1. Session Timeout
**Masalah**: User kehilangan sesi aktif karena tidak responsif dalam waktu yang ditentukan.

**Solusi**:
- ✅ Session timeout ditingkatkan dari 3 menit menjadi 5 menit
- ✅ Peringatan dikirim 2 menit sebelum timeout (sebelumnya 1 menit)
- ✅ Reminder "no reply" dikirim setelah 2 menit (sebelumnya 90 detik)
- ✅ Setiap interaksi user otomatis memperpanjang sesi

**Tips untuk User**:
```
📝 Siapkan informasi berikut SEBELUM memulai sesi:
   - NRP/NIP (jika belum terdaftar)
   - Data yang ingin diupdate
   - Username Instagram/TikTok (jika diperlukan)

⏱️ Waktu sesi: 5 menit
   - Peringatan pertama: 2 menit
   - Peringatan kedua: 3 menit
   - Sesi berakhir: 5 menit
```

### 2. Kebingungan dengan Workflow
**Masalah**: User tidak memahami langkah-langkah yang harus dilakukan.

**Solusi**:
- ✅ Setiap pesan sekarang menyertakan indikator langkah (contoh: "Langkah 1/2")
- ✅ Instruksi lebih jelas dengan emoji dan format yang lebih baik
- ✅ Contoh input disediakan di setiap langkah
- ✅ Opsi keluar (*batal*) selalu tersedia

**Struktur Pesan Baru**:
```
🔐 *Judul Langkah* (Langkah X/Y)

📝 Deskripsi singkat tentang apa yang harus dilakukan

✍️ Instruksi spesifik dengan contoh
💡 Contoh: [contoh input]

✅ Opsi positif (ya/lanjut)
❌ Opsi negatif (tidak/batal)
⏱️ Informasi waktu sesi
```

### 3. Respons Lama
**Masalah**: User menunggu terlalu lama untuk respons sistem.

**Solusi**:
- ✅ Timeout peringatan diperpanjang untuk memberikan lebih banyak waktu
- ✅ Pesan reminder lebih informatif tentang sisa waktu
- ✅ Estimasi waktu sesi ditampilkan di setiap langkah

## Workflow User Request: Step-by-Step

### 1. Memulai Sesi
```
User mengetik: userrequest

Sistem mengecek:
├─ WhatsApp terdaftar?
│  ├─ Ya → Tampilkan data + tanya update
│  └─ No → Minta NRP/NIP (Langkah 1/2)
```

### 2. Registrasi (Jika Belum Terdaftar)
```
Langkah 1/2: Input NRP/NIP
├─ User input: [8 digit angka]
├─ Sistem validasi
└─ Jika valid → Lanjut ke Langkah 2/2

Langkah 2/2: Konfirmasi Binding
├─ User konfirmasi: ya/tidak
├─ Jika ya → WhatsApp terhubung ke akun
└─ Tampilkan data → Tanya update
```

### 3. Update Data (Opsional)
```
Tanya Update:
├─ User jawab: ya/tidak
└─ Jika ya:
    ├─ Tampilkan list field (1-7)
    ├─ User pilih field (angka)
    ├─ User input nilai baru
    ├─ Sistem validasi + update
    └─ Kembali ke menu utama
```

## Session Management Strategy

### Timeout Configuration
```javascript
// Konfigurasi timeout saat ini
USER_MENU_TIMEOUT = 5 menit (300 detik)
MENU_WARNING = 2 menit (120 detik) sebelum timeout
NO_REPLY_TIMEOUT = 2 menit (120 detik) sejak pesan terakhir

Timeline:
T+0:00  → User mulai sesi
T+2:00  → Reminder "no reply" (jika menunggu input)
T+3:00  → Peringatan "sesi akan berakhir dalam 2 menit"
T+5:00  → Sesi berakhir
```

### Session Refresh
Setiap interaksi user (mengirim pesan apapun) akan:
1. ✅ Clear timeout yang lama
2. ✅ Set timeout baru (5 menit dari interaksi)
3. ✅ Reset semua timer (warning, noReply)

Ini berarti user yang aktif TIDAK akan kehilangan sesi.

## Best Practices untuk Implementasi

### 1. Menambah Field Baru
Jika menambahkan field baru yang dapat diupdate user:

```javascript
// 1. Tambahkan ke allowedFields di updateAskField handler
allowedFields.push({ key: "field_baru", label: "Field Baru" });

// 2. Tambahkan validasi di updateAskValue handler
if (dbField === "field_baru") {
  const validation = validateFieldBaru(value);
  if (!validation.valid) {
    await waClient.sendMessage(chatId, validation.error);
    return;
  }
  value = validation.value;
}

// 3. Tambahkan ke userMenuHelpers.js
const examples = {
  field_baru: '💡 Contoh: [contoh input]'
};

// 4. Update formatFieldList untuk menampilkan field baru
```

### 2. Handling Error Gracefully
Setiap error harus:
- ✅ Dikomunikasikan dengan jelas ke user
- ✅ Memberikan opsi untuk retry atau keluar
- ✅ Tidak membuat user stuck di workflow

```javascript
try {
  // operation
} catch (err) {
  console.error('[handler] Error:', err);
  await waClient.sendMessage(
    chatId,
    "❌ Terjadi kesalahan. Silakan coba lagi atau ketik *batal* untuk keluar."
  );
  // Don't auto-exit, let user decide
}
```

### 3. Validasi Input
Semua input user harus divalidasi (termasuk guard anti-teks campuran untuk NRP/NIP):

```javascript
// Centralized validation di userMenuValidation.js
export function validateNRP(text) {
  const normalized = normalizeUnicodeDigits(text || '').trim();

  if (!/^\d+(?:[ .-]?\d+)*$/.test(normalized) || /\d+\s*\/\s*\d+/.test(normalized)) {
    return {
      valid: false,
      error: '❌ Kirim NRP/NIP saja dalam satu balasan.\n💡 Contoh: 87020990'
    };
  }

  const digits = (normalized.match(/\d+/g) || []).join('');
  if (digits.length < 6 || digits.length > 18) {
    return {
      valid: false,
      error: '❌ NRP/NIP harus 6-18 digit angka.\n💡 Contoh: 87020990'
    };
  }

  return { valid: true, digits };
}
```

### 4. Messaging Guidelines

#### DO ✅
- Gunakan emoji untuk kategorisasi visual
- Pisahkan section dengan line breaks
- Berikan contoh untuk input kompleks
- Tampilkan sisa waktu sesi
- Selalu sediakan opsi keluar (*batal*)

#### DON'T ❌
- Jangan gunakan jargon teknis
- Jangan buat pesan terlalu panjang (>15 baris)
- Jangan lupakan separator visual
- Jangan asumsikan user tahu cara kerja sistem

### 5. Testing Workflow Changes

Setiap perubahan workflow harus ditest:

```javascript
// Test timeout behavior
it('should extend session on user activity', () => {
  setMenuTimeout(chatId, waClient);
  const firstTimeout = userMenuContext[chatId].timeout;
  
  // Simulate user interaction
  setMenuTimeout(chatId, waClient);
  const secondTimeout = userMenuContext[chatId].timeout;
  
  expect(firstTimeout).not.toBe(secondTimeout);
});

// Test message flow
it('should handle complete update flow', async () => {
  // 1. Start session
  await userMenuHandlers.main(session, chatId, '', waClient, pool, userModel);
  
  // 2. Confirm update
  await userMenuHandlers.tanyaUpdateMyData(session, chatId, 'ya', waClient, pool, userModel);
  
  // 3. Select field
  await userMenuHandlers.updateAskField(session, chatId, '1', waClient, pool, userModel);
  
  // 4. Update value
  await userMenuHandlers.updateAskValue(session, chatId, 'NEW VALUE', waClient, pool, userModel);
  
  // Verify database updated
  expect(mockUpdate).toHaveBeenCalled();
});
```

## Monitoring & Metrics

### Key Metrics to Track
```
1. Session Completion Rate
   - Jumlah sesi yang selesai / Total sesi dimulai
   - Target: >85%

2. Session Timeout Rate
   - Jumlah timeout / Total sesi
   - Target: <10%

3. Average Session Duration
   - Waktu rata-rata sesi
   - Target: 1-3 menit

4. Error Rate per Step
   - Errors per workflow step
   - Target: <5%

5. User Retry Rate
   - Berapa kali user harus retry input
   - Target: <2 retry/session
```

### Logging Best Practices
```javascript
// Log start of session
console.log(`[userrequest] Session started: chatId=${chatId}`);

// Log user actions
console.log(`[userrequest] User action: step=${step}, input=${inputType}`);

// Log errors with context
console.error('[userrequest] Error:', {
  step: session.step,
  chatId,
  error: err.message,
  stack: err.stack
});

// Log session completion
console.log(`[userrequest] Session completed: chatId=${chatId}, duration=${duration}ms`);
```

## Troubleshooting Guide

### User melaporkan: "Sesi selalu timeout"
**Diagnosis**:
1. Check timeout configuration di `sessionsHelper.js`
2. Verify timeout di-refresh pada setiap interaksi
3. Check logs untuk melihat aktivitas user

**Solusi**:
- Pastikan `setMenuTimeout()` dipanggil di setiap handler
- Verify `USER_MENU_TIMEOUT` >= 300000 (5 menit)

### User melaporkan: "Tidak mengerti apa yang harus dilakukan"
**Diagnosis**:
1. Review message content di langkah tersebut
2. Check apakah contoh input jelas
3. Verify emoji dan formatting sudah benar

**Solusi**:
- Tambahkan contoh lebih jelas
- Simplify instruksi
- Tambahkan visual separator

### User melaporkan: "Input valid tapi ditolak sistem"
**Diagnosis**:
1. Check validation logic di `userMenuValidation.js`
2. Test input dengan unit test
3. Review error message yang dikirim

**Solusi**:
- Relax validation jika terlalu strict
- Perbaiki error message untuk lebih spesifik
- Add normalization sebelum validation

## References

### Related Documents
- `docs/workflow_usage_guide.md` - Panduan penggunaan umum
- `docs/wa_best_practices.md` - WhatsApp bot best practices
- `docs/naming_conventions.md` - Konvensi penamaan

### Code Files
- `src/utils/sessionsHelper.js` - Session management
- `src/handler/menu/userMenuHandlers.js` - Main workflow handlers
- `src/handler/menu/userMenuHelpers.js` - Message formatting
- `src/handler/menu/userMenuValidation.js` - Input validation

### Tests
- `tests/userMenuSessionTimeout.test.js` - Timeout behavior
- `tests/userMenuHandlersFlow.test.js` - Workflow flow
- `tests/userMenuHandlersUpdateAskValue.test.js` - Field update

## Version History

- **2026-02-12**: Initial best practices document created
  - Increased session timeout from 3 to 5 minutes
  - Enhanced warning messages with better timing
  - Improved workflow clarity with step indicators
  - Added comprehensive examples and guidelines
