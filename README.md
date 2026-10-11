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

## Update fitur

- Kartu artikel dan karya siswa menampilkan cuplikan setengah paragraf pertama; tautan **Baca selengkapnya** membuka `public/baca.html` untuk membaca satu tulisan penuh.
- Editor artikel dan karya siswa menyediakan ukuran teks, warna teks, dan daftar isi yang tertaut ke subjudul.
- Tier poin baru ditentukan otomatis oleh Worker. Border spesial otomatis aktif pada profil peringkat pertama; server menolak permintaan border tersebut dari akun lain.
- Setelah mengunggah perubahan, commit dan push ke branch `main`; Cloudflare akan menjalankan deployment dari GitHub.

- Border event memakai PNG khusus; otomatis tampil pada avatar juara rank 1 di leaderboard dan tersedia untuk profil admin. API menolak pemakaian oleh akun lain.


## Akses border khusus

Border event adalah pilihan border biasa dan tidak otomatis dipasang. Rank 1 mendapat akses otomatis dan aksesnya tersimpan; admin juga dapat memilihnya. Anggota lain melihat pilihan terkunci sampai admin memberikan akses.

Pada D1 Console, jalankan isi `border-access.sql` sekali untuk membuat tabel akses dan migrasi border lama. Untuk membagikan akses, ganti `EMAIL_ANGGOTA` di perintah `INSERT OR IGNORE` dalam file itu dengan email anggota lalu jalankan. Perintah `UPDATE` opsional akan langsung memasang border; tanpa itu anggota dapat memilihnya sendiri di profil. Bagian `DELETE` mencabut akses.

Leaderboard hanya menampilkan border ini jika anggota sedang memilihnya di profil. Akun admin tetap tidak masuk ranking.
