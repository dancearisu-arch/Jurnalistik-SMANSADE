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
- Tier poin baru ditentukan otomatis oleh Worker. Border khusus hanya dapat dipilih admin atau member yang aksesnya diberikan admin.
- Setelah mengunggah perubahan, commit dan push ke branch `main`; Cloudflare akan menjalankan deployment dari GitHub.

- Border khusus dari link PNG tersedia untuk admin; member lain terkunci sampai admin membagikan akses melalui D1 SQL. Border khusus tidak ditampilkan di leaderboard.


## Akses border khusus

Border dari link `PBSEQ...` hanya dapat dipakai admin secara default. Member lain melihat pilihan terkunci sampai admin memberi izin lewat D1 Console. Border tier tertinggi otomatis dipasang saat poin mencukupi jika profil belum memilih border lain. Border ini tampil pada avatar profil dan leaderboard; border khusus admin (Border 15) tetap tidak ditampilkan di leaderboard.

Setelah mengunggah perubahan, jalankan `border-access.sql` sekali di D1 Console. Migrasi ini mencabut akses lama yang sebelumnya diberikan otomatis kepada Top 1 dan menghapus border khusus dari profil member. Untuk memberi izin, ganti `EMAIL_ANGGOTA` pada query berikut lalu jalankan di D1 Console:

```sql
INSERT OR IGNORE INTO user_border_access(user_id,border_id,granted_at)
SELECT id,15,datetime('now') FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA');
```

Member tersebut kemudian dapat memilih border khusus di profil. Untuk mencabutnya, jalankan dua query berikut:

```sql
DELETE FROM user_border_access WHERE border_id=15
AND user_id=(SELECT id FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA'));
UPDATE users SET avatar_border='0'
WHERE lower(email)=lower('EMAIL_ANGGOTA') AND avatar_border='15';
```

## Penyederhanaan dan hadiah tier

- Editor upload artikel/karya kini memakai panduan singkat; format lanjutan dapat dibuka bila diperlukan. Upload karya yang diterbitkan memberi 10 poin, dan nilai rating menambah poin.
- Sidebar menampilkan profil, tier, poin, tombol edit profil, dan menu Friendship dengan badge pesan/permintaan baru.
- Halaman `public/friendship.html` menyediakan daftar teman, permintaan masuk/terkirim, pencarian anggota, dan pesan langsung. Pesan dan permintaan diperbarui otomatis tanpa reload; tabel pesan dibuat Worker saat pertama kali dipakai.
- Admin bisa memberi atau mencabut akses Border 15 dari panel Friendship. Akses baru hanya bisa diberikan kepada teman; izin yang sudah dibagikan tetap tampil agar bisa dicabut kapan pun.
- Border baru terbuka otomatis saat tier tercapai: Scribe (100), Wordsmith (300), Storyweaver (700), Wordsmith Adept (1.300), Word Architect (2.100), Lorekeeper (3.200), Mythmaker (4.600), Grand Novelist (6.200), dan Eternal Author (8.000 poin). Border Eternal Author memakai animasi gradien biru-ungu, partikel, serta gambar khusus. Border tersebut dan border tier bisa dipilih di bagian **Banner dan bingkai profil**.
- Pengaturan profil berada di halaman khusus `public/edit-profil.html`; roadmap poin dan hadiah dapat dilihat di bagian **Poin dan hadiah** pada profil.


## Pesan Friendship

- Pengirim dapat mengedit atau menghapus pesan sendiri selama 5 menit sejak pesan dikirim. Batas waktu diperiksa lagi oleh Worker.
- Kedua teman dapat memberi atau membatalkan reaksi 👍 ❤️ 😂 😮 😢 👏.
- Tombol **Hapus seluruh pesan** menghapus riwayat percakapan untuk kedua pihak dan menampilkan konfirmasi sebelum diproses.
- Worker membuat tabel reaksi dan menambahkan kolom `edited_at` secara otomatis saat API pesan pertama kali digunakan. Struktur lengkapnya juga tercantum di `schema.sql`.
