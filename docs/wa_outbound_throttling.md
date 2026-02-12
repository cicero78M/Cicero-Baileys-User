# WhatsApp Outbound Throttling & Priority Queue

Dokumen ini menjelaskan perubahan pada modul pengiriman WhatsApp di:

- `src/service/waService.js` (`wrapSendMessage`)
- `src/utils/waHelper.js` (`safeSendMessage`, `sendWAReport`, `sendWAFile`)
- `src/service/waOutbox.js` (`enqueueSend`, `attachWorker`, `getOutboxMetrics`)

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

### Wrapper `sendUserMessage` untuk immediate vs queue

Gunakan wrapper di `src/service/waService.js`:

```js
await sendUserMessage(chatId, text, {
  priority: 'high' | 'low',
  immediate: true | false,
  retryPolicy: {
    attempts: 5,
    backoffDelayMs: 2000,
  },
});
```

Aturan:

- `immediate=true` (default) => kirim langsung untuk prompt inti step-by-step.
- `immediate=false` => enqueue ke outbox (BullMQ), diproses worker dengan prioritas + retry exponential backoff.

Contoh untuk reminder/notifikasi sekunder:

```js
await sendUserMessage(chatId, reminderText, {
  priority: 'low',
  immediate: false,
});
```

## Catatan operasional

- Jika traffic meningkat, sesuaikan nilai env limiter secara bertahap.
- Monitor frekuensi `wa_outbound_throttled` dan `wa_outbound_deferred` untuk tuning kapasitas.
- Monitor metrik outbox (`queueDepth` dan `sendLatencyMs`) melalui endpoint health `GET /wa-health`.
- Pastikan Redis untuk outbox menggunakan versi minimum **>= 6.2**.
- Langkah verifikasi versi Redis:
  - `redis-cli INFO server | grep redis_version`
  - atau jalankan `redis-cli INFO server`, lalu cek field `redis_version`.
- Risiko jika tetap memakai Redis 6.0.x:
  - Sistem tetap bisa beroperasi, tetapi startup WA akan mengeluarkan warning terstruktur `wa_outbox_redis_version_below_minimum`.
  - Behavior queue BullMQ bisa kurang optimal pada skenario delay/retry dan observability ketika trafik tinggi.

## Koneksi Redis untuk `wa-outbox`

Modul `wa-outbox` sekarang **wajib** menggunakan koneksi Redis yang dibangun dari `REDIS_URL`.

- Queue dan worker BullMQ pada `src/service/waOutbox.js` menggunakan object `connection` hasil parse `REDIS_URL` (host, port, opsional username/password, dan `tls` untuk protocol `rediss:`).
- Tanpa konfigurasi `connection` yang valid, proses enqueue/worker bisa gagal terkoneksi ke Redis sehingga job tidak akan diproses dengan benar.

Gejala error umum jika koneksi Redis tidak tersuplai/invalid:

- Queue tidak bisa add job (`ECONNREFUSED`, `ENOTFOUND`, atau timeout ke Redis).
- Worker tidak mengambil job (antrian menumpuk pada status waiting/delayed).
- Metrik outbox menunjukkan antrean meningkat tetapi `processed` tidak bertambah.
