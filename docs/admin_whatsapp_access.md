# ADMIN_WHATSAPP Access Control Documentation

## Status (Updated)

Perubahan terbaru menonaktifkan menu WhatsApp berikut dari `waService`:

- `clientrequest`
- `oprrequest`
- `dirrequest`
- `wabot` / `wabotditbinmas` / `ditbinmas`

Semua command di atas sekarang akan mengembalikan pesan bahwa fitur sudah dinonaktifkan.

## Dampak konfigurasi `ADMIN_WHATSAPP`

Variabel `ADMIN_WHATSAPP` **masih dipakai** untuk fitur admin lain di sistem, tetapi **tidak lagi membuka akses** ke menu-menu yang dinonaktifkan di atas.

## Catatan implementasi

- Routing command dan sesi menu tersebut sekarang dihentikan di awal alur `createHandleMessage` pada `src/service/waService.js`.
- Bila ada sesi lama (`clientrequest`, `oprrequest`, `dirrequest`, `wabotditbinmas`), sesi akan dibersihkan lalu pengguna menerima notifikasi penonaktifan fitur.

