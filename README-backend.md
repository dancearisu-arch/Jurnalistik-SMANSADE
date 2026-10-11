# Jurnalistik Smansade — backend lokal

Backend ini memakai Python 3 dan SQLite bawaan Python, tanpa paket tambahan. Server menyajikan situs sekaligus API. Akun, konten, komentar, dan rating tersimpan dalam SQLite; berkas tersimpan di `data/uploads`.

## Menjalankan di Windows PowerShell

```powershell
cd C:\Users\Acer\Documents\Codex\2026-10-11\aku\outputs
$env:ADMIN_EMAIL = "admin@smansade.sch.id"
$env:ADMIN_PASSWORD = "GantiDenganKataSandiPanjang"
python server.py
```

Buka http://127.0.0.1:8000. Atur `ADMIN_EMAIL` dan `ADMIN_PASSWORD` untuk membuat akun admin pertama. Kata sandi admin minimal 8 karakter. Jika database sudah dibuat, server juga akan membuat akun admin saat email tersebut belum terdaftar. Akun pengunjung dapat mendaftar dari tombol **Gabung**. Hentikan server dengan `Ctrl+C`.

## Peran dan alur

- Member dapat mengirim dokumentasi, karya siswa, komentar, rating dokumentasi, dan suara siswa.
- Anggota dapat menghapus komentar sendiri maksimal 15 menit setelah mengirimnya. Admin dapat menghapus komentar kapan saja.
- Rating bintang tersedia untuk dokumentasi dan karya siswa. Pemilik unggahan tidak bisa memberi rating pada karyanya sendiri. Poin anggota dihitung dari 10 poin setiap karya siswa yang dipublikasikan dan tambahan sebesar jumlah bintang yang diterima tiap karya/dokumentasi.
- Tier poin: Pemula (0–10), Amatir (11–50), Jago (51–100), Sesepuh (101–500), dan Fosil hidup (501–9999). Poin di atas 9999 tetap berada pada tier Fosil hidup.
- Setiap akun admin mendapat bonus manual satu kali sebesar 9.999 poin. Bonus disimpan di database dan tidak diberikan ulang saat server dimulai kembali; poin karya dan rating tetap ditambahkan di atasnya.
- Anggota dapat mencari anggota lain berdasarkan nama, mengirim/menerima permintaan pertemanan, dan melihat profil teman.
- Suara siswa masuk antrean moderasi. Admin masuk, buka halaman **Suara Siswa**, lalu pilih **Terbitkan** atau **Tolak**.
- Hanya admin dapat menerbitkan artikel dan liputan. Masuk sebagai admin lalu buka halaman terkait untuk mengunggah.
- Admin dapat menghapus postingan dari halaman kategorinya atau dari pratinjau terbaru beranda. Penghapusan juga menghapus berkas unggahan terkait.
- Anggota dapat mengatur nama, bio, foto profil, dan banner berupa gambar/GIF atau video pada menu **Profil**. Halaman profil juga menampilkan karya siswa yang pernah dipublikasikan.
- Admin dapat menghapus akun anggota dari panel **Kelola akun anggota** di halaman Profil. Akun admin dan akun admin yang sedang digunakan dilindungi dari penghapusan di panel tersebut. Penghapusan akun anggota ikut membersihkan konten, komentar, rating, sesi login, dan berkas terkait.
- Editor artikel menyediakan format judul, subjudul, tebal, miring, garis bawah, daftar, kutipan, tautan, perataan, undo, dan redo. Gambar artikel dapat ditambahkan sebagai berkas unggahan.
- Halaman karya siswa memakai editor format yang sama dengan artikel.
- Form masuk menyediakan tombol **Lihat** untuk menyamarkan/menampilkan kata sandi yang sedang diketik. Kata sandi lama tidak bisa dilihat; gunakan alur **Lupa kata sandi** untuk mengatur ulang.
- Reset kata sandi mengirim tautan sekali pakai yang berlaku 30 menit. Atur `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, dan `PUBLIC_BASE_URL` agar email terkirim. Tanpa SMTP, tautan hanya dicetak di terminal untuk pengembangan lokal.
- Pratinjau beranda mengambil tiga postingan publik terbaru dan menyegarkan otomatis setiap 30 detik.
- Area karya terbaru beranda menampilkan dokumentasi dan karya siswa terbaru dari unggahan yang sudah diterbitkan.
- Halaman **Leaderboard — Kreativitas tanpa batas** merangking anggota berdasarkan poin; akun admin dikecualikan. Juara pertama mendapat gelar emas, peringkat kedua dan ketiga mendapat gelar perak.
- Profil menampilkan tier berpola warna, total poin, dan gelar leaderboard jika anggota berada di tiga peringkat teratas.
- Reset kata sandi punya pembatasan permintaan ulang satu menit, indikator kekuatan kata sandi, konfirmasi kata sandi, dan tautan sekali pakai 30 menit. SMTP tetap perlu dikonfigurasi untuk pengiriman email di produksi.
- Bagian “Dari komunitas” di beranda memakai profil nyata, bukan testimoni contoh. Admin dapat menampilkan dirinya atau teman yang sudah diterima sebagai anggota pilihan.
- Admin dapat menetapkan total poin akun mana pun dari panel Profil; unggahan dan rating berikutnya tetap dihitung pada total yang ditetapkan.
- Admin dapat memilih video liputan terbit yang ditampilkan di area “Liputan pilihan” beranda.
- Navigasi menjadi sidebar kiri di desktop dan menu drawer dari kiri di perangkat seluler.
- Konten publik dapat dicari. Dokumentasi dengan berkas dapat diunduh.
- Batas unggahan 20 MB. Format yang diterima: gambar umum, video MP4/WebM/MOV, PDF, DOC/DOCX, dan TXT.
- Data berada di `outputs/data/`. Cadangkan folder ini.

Ini backend pengembangan untuk komputer atau jaringan lokal. Sebelum dipasang ke internet, gunakan HTTPS, kata sandi admin yang kuat, batasi akses jaringan, dan siapkan backup serta kebijakan moderasi.

- Identitas logo halaman menggunakan aset `LOGO.png` yang disertakan di folder yang sama dengan `index.html`.
- Anggota dapat memilih satu dari 14 border PNG pada **Profil → Edit profil**. Setiap pilihan langsung dipratinjau mengelilingi foto profil; pilihan tersimpan setelah menekan **Simpan profil**. Border tetap berasal dari URL gambar yang diberikan, sehingga koneksi internet diperlukan untuk menampilkannya.
