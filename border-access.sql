-- Jalankan sekali pada D1 untuk menerapkan aturan baru border khusus.
CREATE TABLE IF NOT EXISTS user_border_access(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,border_id INTEGER NOT NULL,granted_at TEXT NOT NULL,PRIMARY KEY(user_id,border_id));

-- Cabut pembukaan otomatis lama untuk Top 1 dan bersihkan border khusus dari profil member.
DELETE FROM user_border_access WHERE border_id=15 AND user_id IN (SELECT id FROM users WHERE role <> 'admin');
UPDATE users SET avatar_border='0' WHERE role <> 'admin' AND avatar_border='15';

-- Admin otomatis boleh memakai border khusus berdasarkan role.
-- Berikan akses kepada member tertentu dengan mengganti EMAIL_ANGGOTA, lalu jalankan: 
-- INSERT OR IGNORE INTO user_border_access(user_id,border_id,granted_at)
-- SELECT id,15,datetime('now') FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA');
-- Opsional: langsung pasang border tersebut pada profil member:
-- UPDATE users SET avatar_border='15' WHERE lower(email)=lower('EMAIL_ANGGOTA');

-- Cabut akses member (ganti EMAIL_ANGGOTA), lalu jalankan kedua query berikut:
-- DELETE FROM user_border_access WHERE border_id=15 AND user_id=(SELECT id FROM users WHERE lower(email)=lower('EMAIL_ANGGOTA'));
-- UPDATE users SET avatar_border='0' WHERE lower(email)=lower('EMAIL_ANGGOTA') AND avatar_border='15';
