# Jurnalistik Smansade — Cloudflare

Paket ini berisi situs statis dan API Cloudflare Worker, dengan D1 untuk data aplikasi dan Workers KV untuk unggahan. Database SQLite lama tidak disertakan.

## Deploy dari GitHub

1. Ekstrak ZIP dan unggah isi folder ke root repo `dancearisu-arch/Jurnalistik-SMANSADE` (gabungkan folder `public/`, `worker/`, dan file konfigurasi). Commit ke branch `main` agar Cloudflare membangun versi baru.
2. Di Cloudflare D1 database `jurnalistik-smansade` → **Console**, jalankan semua isi `schema.sql` satu kali.
3. Setelah Worker baru ter-deploy, buka Worker `jurnalistik-smansade` → **Settings → Variables and secrets**. Tambahkan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` sebagai secrets, lalu redeploy. Request API pertama akan membuat akun admin dengan 9999 poin.
4. Buka URL Worker dan daftar/login. Jangan taruh password atau secret di file yang diunggah ke GitHub.

`wrangler.jsonc` sudah diisi dengan D1 ID yang kamu kirim dan KV namespace yang sudah dibuat. Jika ID resource Cloudflare-mu berubah, perbarui file itu.

## Catatan fitur

- Database dimulai kosong; data SQLite lama tidak dipindahkan.
- Alur lupa kata sandi belum mengirim email. Integrasi layanan email perlu disiapkan sebelum reset kata sandi lewat email dapat dipakai.
- Batas unggahan pada Worker adalah 20 MB; perhatikan kuota KV paket gratis.
- Jika repo pernah publik, menghapus file pada commit terbaru tidak menghapus salinannya di riwayat Git. Bersihkan riwayat sebelum membuat repo publik lagi.
