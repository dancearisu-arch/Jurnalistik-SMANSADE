-- Jalankan sekali pada D1 yang sudah dipakai untuk membuat tabel akses dan menjaga akses border lama.
CREATE TABLE IF NOT EXISTS user_border_access(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,border_id INTEGER NOT NULL,granted_at TEXT NOT NULL,PRIMARY KEY(user_id,border_id));
INSERT OR IGNORE INTO user_border_access(user_id,border_id,granted_at) SELECT id,15,datetime('now') FROM users WHERE avatar_border='15';

-- Berikan akses border khusus kepada anggota (ganti email di bawah).
INSERT OR IGNORE INTO user_border_access(user_id,border_id,granted_at) SELECT id,15,datetime('now') FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA');

-- Opsional: langsung pasang border pada akun tersebut. Jika tidak menjalankan baris ini, anggota bisa memilih border dari menu profil.
-- UPDATE users SET avatar_border='15' WHERE lower(email)=lower('EMAIL_ANGGOTA');

-- Cabut akses (ganti email). Ini juga mengembalikan profil ke tanpa border jika border khusus sedang dipakai.
-- DELETE FROM user_border_access WHERE user_id=(SELECT id FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA')) AND border_id=15;
-- UPDATE users SET avatar_border='0' WHERE lower(email)=lower('EMAIL_ANGGOTA') AND avatar_border='15';
