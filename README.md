# Jurnalistik Smansade — Cloudflare

Paket Cloudflare Worker + Static Assets, dengan D1 untuk data dan KV untuk berkas unggahan.

## Pasang pembaruan

1. Ekstrak ZIP lalu unggah/replace isi paket ke root repo GitHub. Pastikan `worker/index.js`, folder `public/`, dan `wrangler.jsonc` ada di root repo dengan struktur yang benar.
2. Commit ke branch `main`; Cloudflare akan membangun ulang Worker.
3. Skema D1 dijalankan satu kali saja. Jika sudah pernah berhasil, jangan jalankan ulang.
4. Di Cloudflare Worker → Settings → Variables and secrets, isi `ADMIN_EMAIL` dan `ADMIN_PASSWORD` sebagai secrets. Gunakan password baru. Deploy ulang setelah menyimpan bila diminta.
5. Login menggunakan email dan password secret admin. Jika email admin sudah pernah dibuat, pendaftaran ulang memang ditolak; pembaruan ini menyelaraskan password akun admin dengan secret saat admin login.

Konfigurasi memakai D1 `d3552b65-1667-4a2f-b6fc-bbc8cbcbe3d2` dan namespace KV yang sudah disiapkan.

## Perbaikan dalam versi ini

- Pendaftaran hanya menyebut email duplikat bila memang sudah ada. Kesalahan database lain kini memberi pesan yang sesuai dan dicatat di log Worker.
- Login admin menerima kredensial `ADMIN_EMAIL` dan `ADMIN_PASSWORD`, termasuk jika akun tersebut sudah terlanjur dibuat sebelum secret diatur.

## Catatan

Database D1 baru tidak memindahkan isi database SQLite lama. Fitur lupa kata sandi masih membutuhkan integrasi layanan email.
