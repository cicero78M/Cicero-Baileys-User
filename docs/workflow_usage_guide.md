# Panduan Lengkap Penggunaan Cicero_V2
*Last updated: 2026-02-12*

Dokumen ini menjelaskan alur fungsi utama dan langkah penggunaan aplikasi **Cicero_V2**. Backend ini berjalan bersama dashboard Next.js (lihat repository `Cicero_Web`).

## 1. Persiapan Lingkungan

1. Install Node.js 20 dan PostgreSQL.
2. Jalankan `npm install` untuk mengunduh dependensi (butuh koneksi internet).
3. Salin file `.env.example` menjadi `.env` dan sesuaikan variabel berikut:
   - `PORT`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `REDIS_URL`, dll.
4. Import skema database dari `sql/schema.sql` ke PostgreSQL.
5. Pastikan Redis dan RabbitMQ (opsional) sudah aktif.

## 2. Menjalankan Aplikasi

```bash
npm start        # menjalankan server produksi
npm run dev      # menjalankan dengan nodemon (hot reload untuk kode saja)
```
Server Express akan aktif di port yang ditentukan dan memuat semua route API serta jadwal cron.
Hot reload hanya memantau kode (`app.js` dan folder `src`). Folder data seperti `laphar/`, `logs/`, dan file `*.txt`/`*.csv` diabaikan agar tidak memicu restart saat proses impor data berjalan.

## 3. Alur Pekerjaan Backend

1. **Autentikasi** – Endpoint `/api/auth/login` memberikan JWT. Token dipakai pada seluruh request berikutnya.
2. **Pengambilan Data** – Cron harian di `src/cron` mengambil postingan Instagram/TikTok, menyimpan like & komentar, lalu menganalisis hashtag.
3. **Penyimpanan** – Data tersimpan di tabel PostgreSQL seperti `insta_post`, `insta_like`, `tiktok_post`, dll. Struktur lengkap ada di `docs/database_structure.md`.
4. **Notifikasi** – Modul `waService.js` mengirim laporan harian dan pengingat via WhatsApp sesuai jadwal pada `docs/activity_schedule.md`.
5. **Sinkronisasi kontak async** – `createHandleMessage` tidak lagi memanggil sinkronisasi Google Contact secara langsung. Nomor pengirim dimasukkan ke BullMQ queue `contact-sync` melalui `enqueueContactSync`, lalu diproses worker dengan deduplikasi Redis TTL (`CONTACT_SYNC_DEDUP_TTL_SEC`) agar nomor sama tidak diproses berulang dalam waktu singkat.
6. **Pembatasan concurrency Google API** – Worker `contact-sync` memakai concurrency terkontrol (`CONTACT_SYNC_WORKER_CONCURRENCY`) untuk membatasi paralelisme panggilan API Google Contacts dan menjaga stabilitas throughput.
7. **Antrian (opsional)** – Tugas berat lain tetap dapat dikirim ke RabbitMQ melalui `publishToQueue` di `src/service/rabbitMQService.js`.

## 4. Fitur WhatsApp Bot

Bot WhatsApp menyediakan perintah utama seperti `oprrequest`, `userrequest`, `dirrequest`, dan command operasional lain sesuai role.

### User Request Workflow

Fitur `userrequest` memungkinkan user untuk:
- Mendaftarkan nomor WhatsApp ke akun mereka
- Melihat data profil mereka
- Mengupdate data profil (nama, pangkat, satfung, jabatan, Instagram, TikTok, dll.)

**Session Timeout**: 5 menit (otomatis di-refresh setiap kali user membalas)

**Dokumentasi Lengkap**:
- `docs/user_request_quick_guide.md` - Panduan cepat untuk end user (Bahasa Indonesia)
- `docs/user_workflow_best_practices.md` - Best practices dan troubleshooting untuk developer

### Runtime WA saat ini

Sistem menjalankan **satu** client WhatsApp runtime:

- `waUserClient` sebagai instance utama.
- `waClient` sebagai alias kompatibilitas ke instance yang sama.

### Current Runtime Truth

| Item | Nilai runtime saat ini |
|---|---|
| Jumlah client aktif | **1** instance |
| Nama instance utama | `waUserClient` |
| Alias kompatibilitas | `waClient` |
| Env wajib WA | `USER_WA_CLIENT_ID` (lowercase, non-default) |
| Path session yang dipakai | `<WA_AUTH_DATA_PATH>/session-<USER_WA_CLIENT_ID>` |
| Path default jika env kosong | `~/.cicero/baileys_auth/session-<USER_WA_CLIENT_ID>` |

### Konfigurasi Environment (WA)

```bash
# Wajib: ID client WhatsApp runtime (harus lowercase dan tidak boleh default wa-userrequest)
USER_WA_CLIENT_ID=wa-userrequest-prod

# Opsional: root folder auth state
WA_AUTH_DATA_PATH=/var/lib/cicero/wa-sessions

# Opsional: hapus session sebelum reinit
WA_AUTH_CLEAR_SESSION_ON_REINIT=false

# Opsional: logging debug WA
WA_DEBUG_LOGGING=false

# Opsional: test-only, jangan aktifkan di production
WA_SERVICE_SKIP_INIT=false
```

Tambahan env untuk sinkronisasi kontak asynchronous:

```bash
# TTL dedup enqueue per nomor (detik)
CONTACT_SYNC_DEDUP_TTL_SEC=180

# Batas worker paralel untuk sinkronisasi Google Contact
CONTACT_SYNC_WORKER_CONCURRENCY=2
```

### Langkah login WA

1. Jalankan `npm run dev` atau `npm start`.
2. Scan QR yang muncul di terminal untuk client dengan ID `USER_WA_CLIENT_ID`.
3. Pastikan folder session tersimpan di `session-<USER_WA_CLIENT_ID>` pada `WA_AUTH_DATA_PATH` (atau path default).
4. Jika auth bermasalah berulang, hapus folder session terkait lalu scan QR ulang.

### Migration note (dari multi-client lama)

Jika environment lama masih punya variabel berikut, hapus dari runtime aktif karena tidak lagi dipakai:

- `GATEWAY_WA_CLIENT_ID`
- `GATEWAY_WHATSAPP_ADMIN`
- `APP_SESSION_NAME`

Dokumentasi ini mengikuti implementasi terbaru: satu instance WA + alias backward compatibility.

## 5. Akses Dashboard

Dashboard Next.js (`Cicero_Web`) menggunakan variabel `NEXT_PUBLIC_API_URL` untuk terhubung ke backend. Fitur utama di dashboard:
1. Login dengan nomor WhatsApp dan `client_id`.
2. Melihat statistik Instagram/TikTok pada halaman analytics.
3. Mengelola data client dan user melalui antarmuka atau endpoint REST.

Catatan: untuk role **operator**, endpoint statistik dashboard selalu menggunakan `client_id` dari sesi pengguna. Parameter `client_id` dari query string atau header akan diabaikan, dan permintaan ditolak jika sesi tidak memiliki `client_id`.

## 6. Tips Penggunaan

- Jalankan `npm run lint` dan `npm test` sebelum melakukan commit.
- Monitor cron job pada jam yang tercantum di `docs/activity_schedule.md`.
- Gunakan Redis agar permintaan tidak duplikat (`dedupRequestMiddleware.js`).
- Cadangkan database secara rutin (lihat `docs/pg_backup_gdrive.md`).

Dokumen lain seperti `enterprise_architecture.md`, `business_process.md`, dan `metadata_flow.md` dapat dijadikan referensi untuk memahami detail alur data.
