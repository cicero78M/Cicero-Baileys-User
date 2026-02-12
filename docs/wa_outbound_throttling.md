# WhatsApp Outbound Throttling & Priority Queue

Dokumen ini menjelaskan perubahan pada modul pengiriman WhatsApp di:

- `src/service/waService.js` (`wrapSendMessage`)
- `src/utils/waHelper.js` (`safeSendMessage`, `sendWAReport`, `sendWAFile`)

## Fitur yang ditambahkan

### 1) Sliding-window limiter

Pengiriman outbound sekarang menggunakan dua limiter:

- **Per chat**: batas jumlah pesan untuk 1 chat dalam window 5 menit.
- **Global client**: batas jumlah pesan total dalam window 1 menit.

Default saat ini:

- `WA_OUTBOUND_CHAT_MAX_MESSAGES=20`
- `WA_OUTBOUND_CHAT_WINDOW_MS=300000` (5 menit)
- `WA_OUTBOUND_GLOBAL_MAX_MESSAGES=60`
- `WA_OUTBOUND_GLOBAL_WINDOW_MS=60000` (1 menit)

Jika limit tercapai, pesan **tidak di-drop**. Pesan akan **ditunda (defer)** sampai window tersedia.

### 2) Random jitter delay

Sebelum kirim pesan, sistem menambahkan jitter acak untuk menghindari pola deterministik.

Default jitter:

- `WA_OUTBOUND_JITTER_MIN_MS=1500`
- `WA_OUTBOUND_JITTER_MAX_MS=4500`

### 3) Prioritas pesan (high/low)

Queue outbound mendukung prioritas:

- `high` (default): untuk respon command user aktif.
- `low`: untuk notifikasi broadcast/reminder.

Aturan implementasi:

- `safeSendMessage(..., { priority: 'high' | 'low' })`
- alias: `messagePriority`
- `sendWAReport` dan `sendWAFile` otomatis memakai prioritas `low`.

### 4) Deferred queue + observability metric

Saat throttling terjadi, sistem mencatat log terstruktur:

- `wa_outbound_throttled`
- `wa_outbound_deferred`

Field log mencakup konteks penting seperti:

- `jid`
- `priority`
- `waitMs` / `deferMs`
- `chatCount` / `globalCount`
- counter total throttled/deferred

## Cara pakai

### Pesan prioritas tinggi (default)

```js
await safeSendMessage(waClient, chatId, text);
```

### Pesan prioritas rendah

```js
await safeSendMessage(waClient, chatId, text, {
  priority: 'low',
  throttleTag: 'broadcast_reminder',
});
```

## Catatan operasional

- Jika traffic meningkat, sesuaikan nilai env limiter secara bertahap.
- Monitor frekuensi `wa_outbound_throttled` dan `wa_outbound_deferred` untuk tuning kapasitas.
