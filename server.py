#!/usr/bin/env python3
"""Jurnalistik Smansade: small, dependency-free SQLite backend."""
import os, re, json, sqlite3, secrets, hashlib, hmac, mimetypes, html, smtplib
from pathlib import Path
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from email.parser import BytesParser
from email.policy import default
from email.message import EmailMessage
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('JURNALISTIK_DATA', ROOT / 'data'))
UPLOADS = DATA / 'uploads'
DB = DATA / 'jurnalistik.sqlite3'
DATA.mkdir(exist_ok=True); UPLOADS.mkdir(exist_ok=True)
MAX_UPLOAD = 20 * 1024 * 1024
AVATAR_BORDERS={
    '1':'https://ar-hosting.pages.dev/f/GZGXC4CZM53UO4SLGM2FSVCZK5MBPB7YDOM3N3SR6RHLU5S6',
    '2':'https://ar-hosting.pages.dev/f/OBTUEYTPKZGEKQ2PNRTHOULZGEBP3XR2AUPFKPFILBXTRIEC',
    '3':'https://ar-hosting.pages.dev/f/HFIDK3KHIM3EKTSSKBGEUTSFIYJ6YKZ77XSV6PEVCXRVFL6C',
    '4':'https://ar-hosting.pages.dev/f/IE2XI2KMKVUW22LSI5KUQVLYONNX6XC3NYD6QVAGOWJKD6LA',
    '5':'https://ar-hosting.pages.dev/f/HEZHO33RMZFEW3ZUPBVFISKNNYJ2EGORGOHKGQU4455ZZBK7',
    '6':'https://ar-hosting.pages.dev/f/IR3GCYRUGZ3GYVKUJ5KWCQK2O4PEMFZ2WY7J7POKY7FKDPQW',
    '7':'https://ar-hosting.pages.dev/f/JZQXM3SHK5MUMSDBKUYVO3DKNJYGW4WG7UUXRVY77JOP2QD4',
    '8':'https://ar-hosting.pages.dev/f/JBFES6LOONWEUTSVOR3GWZ2BGL5FU76LPS23LK4V52T2RFEO',
    '9':'https://ar-hosting.pages.dev/f/IZDDOST2JBFXKM2KKRSEQUCUKDEPNWICABILVDBY5VDQV6HY',
    '10':'https://ar-hosting.pages.dev/f/PJZFQ2CNJVFEY4C2IFSG2U3RNBSOFQFQO7H2GXNHLUEAUS5S',
    '11':'https://ar-hosting.pages.dev/f/J4YGK4SWK5BTIRKCKRXHIY2XKQMYZ65KIQUQFNK2UVDWBZBB',
    '12':'https://ar-hosting.pages.dev/f/OY4DCQTOPBWGKRSEMZDWYRLNKSMDIR62PQQLKHDNK7S6PPHW',
    '13':'https://ar-hosting.pages.dev/f/PBRUKYSIOY3WYS2GOJCU45SPKRFBTGZ2QJ7HNPOQBHYTC4TK',
    '14':'https://ar-hosting.pages.dev/f/GR4GYU3ZJMZGW5TRJNCFMM2NLGXHIFCVPMO7XIR5NJ3CVOSW',
}

KINDS = {'dokumentasi', 'artikel', 'liputan', 'karya', 'suara'}
MIME_EXT = {'.jpg','.jpeg','.png','.gif','.webp','.mp4','.webm','.mov','.pdf','.txt','.doc','.docx'}

def connect():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c

def init_db():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', avatar_file TEXT, banner_file TEXT, banner_mime TEXT, points_bonus INTEGER NOT NULL DEFAULT 0, points_adjustment INTEGER NOT NULL DEFAULT 0, avatar_border TEXT NOT NULL DEFAULT '0');
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS contents(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, author_id INTEGER NOT NULL REFERENCES users(id), file_name TEXT, original_name TEXT, mime TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published');
        CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ratings(id INTEGER PRIMARY KEY, content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5), UNIQUE(content_id,user_id));
        CREATE TABLE IF NOT EXISTS friendships(id INTEGER PRIMARY KEY, requester_id INTEGER NOT NULL REFERENCES users(id), addressee_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, UNIQUE(requester_id,addressee_id));
        CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS featured_members(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 2),user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,quote TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS featured_liputan(id INTEGER PRIMARY KEY CHECK(id=1),content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,updated_at TEXT NOT NULL);
        ''')
        reset_cols={r['name'] for r in c.execute('PRAGMA table_info(password_resets)').fetchall()}
        if 'created_at' not in reset_cols:c.execute("ALTER TABLE password_resets ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
        cols={r['name'] for r in c.execute('PRAGMA table_info(users)').fetchall()}
        for name, decl in [('bio',"TEXT NOT NULL DEFAULT ''"),('avatar_file','TEXT'),('banner_file','TEXT'),('banner_mime','TEXT'),('points_bonus','INTEGER NOT NULL DEFAULT 0'),('points_adjustment','INTEGER NOT NULL DEFAULT 0'),('avatar_border',"TEXT NOT NULL DEFAULT '0'")]:
            if name not in cols:c.execute(f'ALTER TABLE users ADD COLUMN {name} {decl}')
        # One-time 9,999 point grant for administrator accounts; the stored bonus
        # prevents repeated grants on later server starts.
        c.execute('UPDATE users SET points_bonus=9999 WHERE role="admin" AND points_bonus=0')
        admin=os.environ.get('ADMIN_EMAIL','').strip().lower(); pw=os.environ.get('ADMIN_PASSWORD','')
        if admin and pw and not c.execute('SELECT 1 FROM users WHERE email=?',(admin,)).fetchone():
            c.execute('INSERT INTO users(name,email,password,role,created_at,points_bonus) VALUES(?,?,?,?,?,?)',('Admin Jurnalistik',admin,hash_pw(pw),'admin',now(),9999))
        if not c.execute('SELECT 1 FROM featured_members').fetchone():
            first=c.execute('SELECT id FROM users WHERE role="admin" ORDER BY id LIMIT 1').fetchone()
            if first:c.execute('INSERT OR IGNORE INTO featured_members(slot,user_id,quote,updated_at) VALUES(1,?,?,?)',(first['id'],'Redaksi Jurnalistik Smansade',now()))

def now(): return datetime.now(timezone.utc).isoformat()
def hash_pw(pw, salt=None):
    salt=salt or secrets.token_hex(16); digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),bytes.fromhex(salt),240000).hex(); return salt+':'+digest
def check_pw(pw, stored):
    salt, digest=stored.split(':',1); return hmac.compare_digest(hash_pw(pw,salt).split(':',1)[1],digest)
def clean_text(v, limit=12000): return str(v or '').strip()[:limit]

class RichSanitizer(HTMLParser):
    ALLOWED={'p','br','h2','h3','strong','b','em','i','u','ul','ol','li','blockquote','a'}
    BLOCKED={'script','style','iframe','object','svg','math'}
    def __init__(self): super().__init__(convert_charrefs=True); self.out=[]; self.blocked=0
    def handle_starttag(self, tag, attrs):
        if tag in self.BLOCKED:self.blocked+=1; return
        if self.blocked or tag not in self.ALLOWED:return
        if tag=='a':
            href=dict(attrs).get('href','')
            safe=href.startswith(('https://','http://','mailto:'))
            self.out.append('<a'+(' href="'+html.escape(href,quote=True)+'" rel="nofollow noopener"' if safe else '')+'>')
        else:self.out.append('<'+tag+'>')
    def handle_endtag(self, tag):
        if tag in self.BLOCKED and self.blocked:self.blocked-=1; return
        if not self.blocked and tag in self.ALLOWED and tag!='br':self.out.append('</'+tag+'>')
    def handle_data(self, data):
        if not self.blocked:self.out.append(html.escape(data))
def sanitize_rich(value):
    parser=RichSanitizer(); parser.feed(clean_text(value)); parser.close(); return ''.join(parser.out).strip()

def leaderboard_data(c):
    rows=c.execute("""SELECT u.id,u.name,u.avatar_file,u.points_bonus+u.points_adjustment+10*COUNT(DISTINCT CASE WHEN x.kind='karya' AND x.status='published' THEN x.id END)+COALESCE((SELECT SUM(rt.value) FROM ratings rt JOIN contents cx ON cx.id=rt.content_id WHERE cx.author_id=u.id AND cx.kind IN ('dokumentasi','karya') AND cx.status='published'),0) points FROM users u LEFT JOIN contents x ON x.author_id=u.id WHERE u.role='member' GROUP BY u.id ORDER BY points DESC,u.name COLLATE NOCASE ASC,u.id ASC""").fetchall()
    result=[]
    for i,row in enumerate(rows,1):
        item=dict(row);item['rank']=i
        item['title']='Juara Kreativitas' if i==1 else f'Bintang Kreativitas #{i}' if i in (2,3) else ''
        result.append(item)
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,fmt,*args): print('%s - %s'%(self.address_string(),fmt%args))
    def send_json(self, obj, status=200):
        raw=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.send_header('Cache-Control','no-store'); self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization'); self.send_header('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS'); self.end_headers(); self.wfile.write(raw)
    def read_body(self, limit=MAX_UPLOAD+1024*1024):
        n=int(self.headers.get('Content-Length','0'))
        if n>limit: raise ValueError('Ukuran permintaan melewati batas unggahan.')
        return self.rfile.read(n)
    def json_body(self): return json.loads(self.read_body() or b'{}')
    def current_user(self):
        token=self.headers.get('Authorization','').removeprefix('Bearer ').strip()
        if not token: return None
        with connect() as c:
            r=c.execute('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?',(token,now())).fetchone()
            return dict(r) if r else None
    def require_user(self):
        u=self.current_user()
        if not u: self.send_json({'error':'Silakan masuk terlebih dahulu.'},401); return None
        return u
    def do_OPTIONS(self): self.send_response(204); self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization'); self.send_header('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS'); self.end_headers()
    def do_GET(self):
        u=urlparse(self.path); path=unquote(u.path); q=parse_qs(u.query)
        if path=='/api/health': return self.send_json({'ok':True,'service':'Jurnalistik Smansade'})
        if path=='/api/me': return self.send_json({'user':self.current_user()})
        if path=='/api/profile':
            u=self.require_user()
            if not u:return
            return self.send_json({'profile':self.profile_data(u['id'],include_email=True)})
        if path=='/api/friends':
            u=self.require_user()
            if not u:return
            with connect() as c:
                friends=c.execute('''SELECT f.id,u.id user_id,u.name,u.avatar_file FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?) ORDER BY u.name''',(u['id'],u['id'],u['id'])).fetchall()
                incoming=c.execute('''SELECT f.id,u.id user_id,u.name,u.avatar_file FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=? AND f.status='pending' ORDER BY f.created_at DESC''',(u['id'],)).fetchall()
                return self.send_json({'friends':[dict(r) for r in friends],'incoming':[dict(r) for r in incoming]})
        if path.startswith('/api/friends/status/'):
            u=self.require_user()
            if not u:return
            try: target=int(path.rsplit('/',1)[1])
            except ValueError:return self.send_json({'error':'ID tidak valid.'},400)
            with connect() as c:
                r=c.execute('SELECT id,requester_id,addressee_id,status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)',(u['id'],target,target,u['id'])).fetchone()
            return self.send_json({'friendship':dict(r) if r else None,'viewer_id':u['id']})
        if path=='/api/users/search':
            u=self.require_user()
            if not u:return
            term=clean_text(q.get('q',[''])[0],80)
            if len(term)<2:return self.send_json({'users':[]})
            with connect() as c:
                rows=c.execute('SELECT id,name,bio,avatar_file FROM users WHERE role="member" AND id<>? AND name LIKE ? ORDER BY name LIMIT 20',(u['id'],'%'+term+'%')).fetchall()
                return self.send_json({'users':[dict(r) for r in rows]})
        if path.startswith('/api/users/'):
            try: ident=int(path.rsplit('/',1)[1])
            except ValueError:return self.send_json({'error':'ID tidak valid.'},400)
            profile=self.profile_data(ident)
            if not profile:return self.send_json({'error':'Profil tidak ditemukan.'},404)
            return self.send_json({'profile':profile})
        if path=='/api/community':
            with connect() as c:
                rows=c.execute("""SELECT x.id,x.kind,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,u.id author_id,u.name author,(SELECT ROUND(AVG(value),1) FROM ratings r WHERE r.content_id=x.id) rating,(SELECT COUNT(*) FROM ratings r WHERE r.content_id=x.id) rating_count FROM contents x JOIN users u ON u.id=x.author_id WHERE x.status='published' AND x.kind IN ('dokumentasi','karya') ORDER BY x.created_at DESC LIMIT 4""").fetchall()
                return self.send_json({'contents':[dict(r) for r in rows]})
        if path=='/api/leaderboard':
            with connect() as c:return self.send_json({'leaderboard':leaderboard_data(c)})
        if path=='/api/featured-liputan':
            with connect() as c:
                row=c.execute('''SELECT x.id,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,u.name author FROM featured_liputan f JOIN contents x ON x.id=f.content_id JOIN users u ON u.id=x.author_id WHERE f.id=1 AND x.status='published' AND x.kind='liputan' ''').fetchone()
                return self.send_json({'content':dict(row) if row else None})
        if path in {'/api/admin/community-options','/api/admin/liputan-options'}:
            u=self.current_user()
            if not u or u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
            with connect() as c:
                if path.endswith('community-options'):
                    rows=c.execute('''SELECT id user_id,name,avatar_file FROM users WHERE id=? OR id IN (SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)) ORDER BY name''',(u['id'],u['id'],u['id'],u['id'])).fetchall()
                    selected=c.execute('SELECT slot,user_id,quote FROM featured_members ORDER BY slot').fetchall()
                    return self.send_json({'users':[dict(r) for r in rows],'selected':[dict(r) for r in selected]})
                rows=c.execute("SELECT id,title,created_at FROM contents WHERE kind='liputan' AND status='published' AND mime LIKE 'video/%' ORDER BY created_at DESC").fetchall()
                selected=c.execute('SELECT content_id FROM featured_liputan WHERE id=1').fetchone()
                return self.send_json({'contents':[dict(r) for r in rows],'selected_id':selected['content_id'] if selected else None})
        if path=='/api/admin/users':
            u=self.current_user()
            if not u or u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
            with connect() as c:
                rows=c.execute('''SELECT u.id,u.name,u.email,u.role,u.points_bonus,u.points_adjustment,u.created_at,COUNT(DISTINCT CASE WHEN x.kind='karya' THEN x.id END) work_count,u.points_bonus+u.points_adjustment+10*COUNT(DISTINCT CASE WHEN x.kind='karya' AND x.status='published' THEN x.id END)+COALESCE((SELECT SUM(rt.value) FROM ratings rt JOIN contents cx ON cx.id=rt.content_id WHERE cx.author_id=u.id AND cx.kind IN ('dokumentasi','karya') AND cx.status='published'),0) points FROM users u LEFT JOIN contents x ON x.author_id=u.id GROUP BY u.id ORDER BY u.created_at DESC''').fetchall()
                return self.send_json({'users':[dict(r) for r in rows]})
        if path=='/api/admin/pending':
            u=self.current_user()
            if not u or u['role']!='admin': return self.send_json({'error':'Khusus admin.'},403)
            with connect() as c:
                rows=c.execute('SELECT x.id,x.kind,x.title,x.body,x.created_at,u.name author FROM contents x JOIN users u ON u.id=x.author_id WHERE x.status="pending" ORDER BY x.created_at',( )).fetchall()
                return self.send_json({'pending':[dict(r) for r in rows]})
        if path=='/api/contents':
            kind=q.get('kind',[''])[0]
            if kind and kind not in KINDS: return self.send_json({'error':'Kategori tidak dikenal.'},400)
            with connect() as c:
                rows=c.execute('''SELECT x.id,x.kind,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,x.status,u.name author,
                (SELECT COUNT(*) FROM comments cm WHERE cm.content_id=x.id) comment_count,
                (SELECT ROUND(AVG(value),1) FROM ratings rt WHERE rt.content_id=x.id) rating,
                (SELECT COUNT(*) FROM ratings rt WHERE rt.content_id=x.id) rating_count,x.author_id
                FROM contents x JOIN users u ON u.id=x.author_id WHERE x.status='published' AND (?='' OR x.kind=?) ORDER BY x.created_at DESC''',(kind,kind)).fetchall()
                out=[]
                for row in rows:
                    d=dict(row); d['comments']=[dict(r) for r in c.execute('SELECT cm.id,cm.user_id,cm.body,cm.created_at,u.name author FROM comments cm JOIN users u ON u.id=cm.user_id WHERE cm.content_id=? ORDER BY cm.created_at DESC',(d['id'],)).fetchall()]; out.append(d)
                return self.send_json({'contents':out})
        if path.startswith('/api/download/'):
            try: ident=int(path.rsplit('/',1)[1])
            except ValueError: return self.send_json({'error':'ID tidak valid.'},400)
            with connect() as c: r=c.execute('SELECT file_name,original_name,mime FROM contents WHERE id=? AND status="published"',(ident,)).fetchone()
            if not r or not r['file_name']: return self.send_json({'error':'Berkas tidak ditemukan.'},404)
            f=UPLOADS/r['file_name']
            if not f.is_file(): return self.send_json({'error':'Berkas sudah tidak tersedia.'},404)
            data=f.read_bytes(); self.send_response(200); self.send_header('Content-Type',r['mime'] or 'application/octet-stream'); self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+__import__('urllib.parse').parse.quote(r['original_name'] or 'unduhan')); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        if path.startswith('/uploads/'):
            name=Path(path).name; f=UPLOADS/name
            if f.is_file():
                b=f.read_bytes(); self.send_response(200); self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'application/octet-stream'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b); return
            return self.send_error(404)
        if path=='/': self.path='/index.html'
        return super().do_GET()
    def do_POST(self):
        path=urlparse(self.path).path
        try:
            if path=='/api/register':
                d=self.json_body(); name=clean_text(d.get('name'),100); email=clean_text(d.get('email'),254).lower(); pw=str(d.get('password',''))
                if not name or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(pw)<8: return self.send_json({'error':'Isi nama, email yang valid, dan kata sandi minimal 8 karakter.'},400)
                with connect() as c:
                    cur=c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(name,email,hash_pw(pw),'member',now())); uid=cur.lastrowid
                    token=secrets.token_urlsafe(36); c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,uid,(datetime.now(timezone.utc)+timedelta(days=14)).isoformat()))
                    return self.send_json({'token':token,'user':{'id':uid,'name':name,'email':email,'role':'member'}},201)
            if path=='/api/login':
                d=self.json_body(); email=clean_text(d.get('email'),254).lower(); pw=str(d.get('password',''))
                with connect() as c:
                    r=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                    if not r or not check_pw(pw,r['password']): return self.send_json({'error':'Email atau kata sandi tidak cocok.'},401)
                    token=secrets.token_urlsafe(36); c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,r['id'],(datetime.now(timezone.utc)+timedelta(days=14)).isoformat()))
                    return self.send_json({'token':token,'user':{'id':r['id'],'name':r['name'],'email':r['email'],'role':r['role']}})
            if path=='/api/logout':
                token=self.headers.get('Authorization','').removeprefix('Bearer ').strip()
                with connect() as c: c.execute('DELETE FROM sessions WHERE token=?',(token,))
                return self.send_json({'ok':True})
            if path=='/api/profile':return self.update_profile()
            if path=='/api/password/forgot':return self.request_password_reset()
            if path=='/api/password/reset':return self.reset_password()
            if path=='/api/friends/request':
                u=self.require_user()
                if not u:return
                target=int(self.json_body().get('user_id',0))
                if target==u['id']:return self.send_json({'error':'Kamu tidak bisa menambahkan dirimu sendiri.'},400)
                with connect() as c:
                    other=c.execute('SELECT id,role FROM users WHERE id=?',(target,)).fetchone()
                    if not other or other['role']!='member':return self.send_json({'error':'Anggota tidak ditemukan.'},404)
                    exists=c.execute('SELECT id,status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)',(u['id'],target,target,u['id'])).fetchone()
                    if exists:return self.send_json({'error':'Permintaan atau pertemanan sudah ada.'},409)
                    c.execute('INSERT INTO friendships(requester_id,addressee_id,status,created_at) VALUES(?,?,?,?)',(u['id'],target,'pending',now()))
                return self.send_json({'ok':True},201)
            accept=re.fullmatch(r'/api/friends/(\d+)/accept',path)
            if accept:
                u=self.require_user()
                if not u:return
                with connect() as c:
                    cur=c.execute('UPDATE friendships SET status="accepted" WHERE id=? AND addressee_id=? AND status="pending"',(int(accept.group(1)),u['id']))
                    if not cur.rowcount:return self.send_json({'error':'Permintaan pertemanan tidak ditemukan.'},404)
                return self.send_json({'ok':True})
            if path=='/api/admin/users/points':
                u=self.require_user()
                if not u:return
                if u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
                d=self.json_body(); ident=int(d.get('user_id',0)); target=int(d.get('points',-1))
                if target<0 or target>1000000000:return self.send_json({'error':'Poin harus antara 0 dan 1.000.000.000.'},400)
                with connect() as c:
                    user=c.execute('SELECT points_bonus FROM users WHERE id=?',(ident,)).fetchone()
                    if not user:return self.send_json({'error':'Akun tidak ditemukan.'},404)
                    earned=10*c.execute("SELECT COUNT(*) FROM contents WHERE author_id=? AND kind='karya' AND status='published'",(ident,)).fetchone()[0]
                    earned+=c.execute("SELECT COALESCE(SUM(rt.value),0) FROM ratings rt JOIN contents x ON x.id=rt.content_id WHERE x.author_id=? AND x.kind IN ('dokumentasi','karya') AND x.status='published'",(ident,)).fetchone()[0]
                    c.execute('UPDATE users SET points_adjustment=? WHERE id=?',(target-user['points_bonus']-earned,ident))
                return self.send_json({'ok':True,'points':target})
            if path=='/api/admin/community-feature':
                u=self.require_user()
                if not u:return
                if u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
                d=self.json_body(); slot=int(d.get('slot',0)); ident=int(d.get('user_id',0)); quote=clean_text(d.get('quote'),240)
                if slot not in (1,2):return self.send_json({'error':'Slot harus 1 atau 2.'},400)
                with connect() as c:
                    allowed=ident==u['id'] or c.execute("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))",(u['id'],ident,ident,u['id'])).fetchone()
                    if not allowed:return self.send_json({'error':'Pilih akun admin atau teman yang sudah terhubung.'},403)
                    c.execute('INSERT INTO featured_members(slot,user_id,quote,updated_at) VALUES(?,?,?,?) ON CONFLICT(slot) DO UPDATE SET user_id=excluded.user_id,quote=excluded.quote,updated_at=excluded.updated_at',(slot,ident,quote,now()))
                return self.send_json({'ok':True})
            if path=='/api/admin/featured-liputan':
                u=self.require_user()
                if not u:return
                if u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
                ident=int(self.json_body().get('content_id',0))
                with connect() as c:
                    if not c.execute("SELECT 1 FROM contents WHERE id=? AND kind='liputan' AND status='published' AND mime LIKE 'video/%'",(ident,)).fetchone():return self.send_json({'error':'Pilih liputan terbit yang valid.'},400)
                    c.execute('INSERT INTO featured_liputan(id,content_id,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET content_id=excluded.content_id,updated_at=excluded.updated_at',(ident,now()))
                return self.send_json({'ok':True})
            if path.startswith('/api/admin/content/'):
                u=self.require_user()
                if not u:return
                if u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
                bits=path.rstrip('/').split('/'); ident=int(bits[-2]); action=bits[-1]
                with connect() as c:
                    if action=='publish': c.execute('UPDATE contents SET status="published" WHERE id=? AND status="pending"',(ident,))
                    elif action=='reject': c.execute('DELETE FROM contents WHERE id=? AND status="pending"',(ident,))
                    else:return self.send_json({'error':'Aksi tidak dikenal.'},404)
                return self.send_json({'ok':True})
            if path.startswith('/api/contents/') and path.endswith('/comments'):
                u=self.require_user()
                if not u:return
                ident=int(path.split('/')[-2]); d=self.json_body(); body=clean_text(d.get('body'),3000)
                if not body:return self.send_json({'error':'Komentar tidak boleh kosong.'},400)
                with connect() as c:
                    if not c.execute('SELECT 1 FROM contents WHERE id=? AND status="published"',(ident,)).fetchone():return self.send_json({'error':'Konten tidak ditemukan.'},404)
                    c.execute('INSERT INTO comments(content_id,user_id,body,created_at) VALUES(?,?,?,?)',(ident,u['id'],body,now()))
                return self.send_json({'ok':True},201)
            if path.startswith('/api/contents/') and path.endswith('/rating'):
                u=self.require_user()
                if not u:return
                ident=int(path.split('/')[-2]); val=int(self.json_body().get('value',0))
                if val<1 or val>5:return self.send_json({'error':'Rating harus bernilai 1 sampai 5.'},400)
                with connect() as c:
                    content=c.execute('SELECT author_id,kind,status FROM contents WHERE id=?',(ident,)).fetchone()
                    if not content or content['status']!='published':return self.send_json({'error':'Karya tidak ditemukan.'},404)
                    if content['kind'] not in {'dokumentasi','karya'}:return self.send_json({'error':'Rating hanya tersedia untuk dokumentasi dan karya siswa.'},400)
                    if content['author_id']==u['id']:return self.send_json({'error':'Kamu tidak dapat memberi rating pada unggahan sendiri.'},400)
                    c.execute('INSERT INTO ratings(content_id,user_id,value) VALUES(?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET value=excluded.value',(ident,u['id'],val))
                return self.send_json({'ok':True})
            if path=='/api/contents': return self.create_content()
            return self.send_json({'error':'Rute tidak ditemukan.'},404)
        except sqlite3.IntegrityError as e:
            return self.send_json({'error':'Email sudah terdaftar.' if 'email' in str(e).lower() else 'Data tidak valid.'},409)
        except (ValueError,KeyError,json.JSONDecodeError) as e: return self.send_json({'error':str(e) or 'Permintaan tidak valid.'},400)
    def do_DELETE(self):
        path=urlparse(self.path).path
        u=self.require_user()
        if not u:return
        comment_match=re.fullmatch(r'/api/comments/(\d+)',path)
        if comment_match:
            with connect() as c: cm=c.execute('SELECT user_id,created_at FROM comments WHERE id=?',(int(comment_match.group(1)),)).fetchone()
            if not cm:return self.send_json({'error':'Komentar tidak ditemukan.'},404)
            allowed=u['role']=='admin' or u['id']==cm['user_id'] and datetime.now(timezone.utc)-datetime.fromisoformat(cm['created_at'])<=timedelta(minutes=15)
            if not allowed:return self.send_json({'error':'Komentar hanya bisa dihapus oleh admin atau penulis dalam 15 menit setelah dikirim.'},403)
            with connect() as c:c.execute('DELETE FROM comments WHERE id=?',(int(comment_match.group(1)),))
            return self.send_json({'ok':True})
        friend_match=re.fullmatch(r'/api/friends/(\d+)',path)
        if friend_match:
            with connect() as c:
                cur=c.execute('DELETE FROM friendships WHERE id=? AND (requester_id=? OR addressee_id=?)',(int(friend_match.group(1)),u['id'],u['id']))
                if not cur.rowcount:return self.send_json({'error':'Relasi pertemanan tidak ditemukan.'},404)
            return self.send_json({'ok':True})
        if u['role']!='admin':return self.send_json({'error':'Khusus admin.'},403)
        user_match=re.fullmatch(r'/api/admin/users/(\d+)',path)
        if user_match:
            ident=int(user_match.group(1))
            if ident==u['id']:return self.send_json({'error':'Admin tidak dapat menghapus akunnya sendiri dari panel ini.'},400)
            with connect() as c:
                user=c.execute('SELECT id,role,avatar_file,banner_file FROM users WHERE id=?',(ident,)).fetchone()
                if not user:return self.send_json({'error':'Akun tidak ditemukan.'},404)
                if user['role']=='admin':return self.send_json({'error':'Akun admin tidak dapat dihapus dari panel anggota.'},403)
                files=[user['avatar_file'],user['banner_file']]
                files.extend(r['file_name'] for r in c.execute('SELECT file_name FROM contents WHERE author_id=? AND file_name IS NOT NULL',(ident,)).fetchall())
                c.execute('DELETE FROM comments WHERE user_id=?',(ident,)); c.execute('DELETE FROM ratings WHERE user_id=?',(ident,));c.execute('DELETE FROM friendships WHERE requester_id=? OR addressee_id=?',(ident,ident))
                c.execute('DELETE FROM contents WHERE author_id=?',(ident,)); c.execute('DELETE FROM users WHERE id=?',(ident,))
            for file_name in set(files):
                if file_name:
                    try:(UPLOADS/Path(file_name).name).unlink(missing_ok=True)
                    except OSError:pass
            return self.send_json({'ok':True})
        match=re.fullmatch(r'/api/admin/content/(\d+)',path)
        if not match:return self.send_json({'error':'Rute tidak ditemukan.'},404)
        ident=int(match.group(1))
        with connect() as c:
            row=c.execute('SELECT file_name FROM contents WHERE id=?',(ident,)).fetchone()
            if not row:return self.send_json({'error':'Postingan tidak ditemukan.'},404)
            c.execute('DELETE FROM contents WHERE id=?',(ident,))
        if row['file_name']:
            try:(UPLOADS/Path(row['file_name']).name).unlink(missing_ok=True)
            except OSError:pass
        return self.send_json({'ok':True})
    def profile_data(self, ident, include_email=False):
        with connect() as c:
            u=c.execute('SELECT id,name,email,role,bio,avatar_file,banner_file,banner_mime,created_at,points_bonus,points_adjustment,avatar_border FROM users WHERE id=?',(ident,)).fetchone()
            if not u:return None
            profile=dict(u)
            if not include_email:profile.pop('email',None)
            profile['works']=[dict(r) for r in c.execute('''SELECT x.id,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,
                (SELECT ROUND(AVG(value),1) FROM ratings rt WHERE rt.content_id=x.id) rating,
                (SELECT COUNT(*) FROM ratings rt WHERE rt.content_id=x.id) rating_count
                FROM contents x WHERE x.author_id=? AND x.kind='karya' AND x.status='published' ORDER BY x.created_at DESC''',(ident,)).fetchall()]
            points=profile['points_bonus']+profile.get('points_adjustment',0)+10*c.execute('SELECT COUNT(*) FROM contents WHERE author_id=? AND kind="karya" AND status="published"',(ident,)).fetchone()[0]
            points+=c.execute('SELECT COALESCE(SUM(rt.value),0) FROM ratings rt JOIN contents x ON x.id=rt.content_id WHERE x.author_id=? AND x.kind IN ("dokumentasi","karya") AND x.status="published"',(ident,)).fetchone()[0]
            profile['points']=points
            standing=next((r for r in leaderboard_data(c) if r['id']==ident),None)
            profile['rank']=standing['rank'] if standing else None;profile['leader_title']=standing['title'] if standing else ''
            profile['tier']='Pemula' if points<=10 else 'Amatir' if points<=50 else 'Jago' if points<=100 else 'Sesepuh' if points<=500 else 'Fosil hidup'
            return profile
    def update_profile(self):
        user=self.require_user()
        if not user:return
        ctype=self.headers.get('Content-Type','')
        if 'multipart/form-data' not in ctype:return self.send_json({'error':'Gunakan form profil.'},400)
        body=self.read_body(); msg=BytesParser(policy=default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body)
        vals={}; files={}
        for part in msg.iter_parts():
            key=part.get_param('name',header='content-disposition'); filename=part.get_filename(); data=part.get_payload(decode=True) or b''
            if filename:
                if len(data)>MAX_UPLOAD:return self.send_json({'error':'Setiap berkas maksimal 20 MB.'},413)
                files[key]=(Path(filename).name,part.get_content_type(),data)
            elif key:vals[key]=data.decode(part.get_content_charset() or 'utf-8','replace')
        name=clean_text(vals.get('name'),100); bio=clean_text(vals.get('bio'),1200); avatar_border=clean_text(vals.get('avatar_border','0'),2)
        if avatar_border not in {'0',*AVATAR_BORDERS.keys()}:return self.send_json({'error':'Pilihan border tidak valid.'},400)
        if len(name)<2:return self.send_json({'error':'Nama minimal 2 karakter.'},400)
        saved={}; old=[]
        allowed_avatar={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp'}
        allowed_banner={**allowed_avatar,'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov'}
        for field,allowed in [('avatar',allowed_avatar),('banner',allowed_banner)]:
            if field not in files:continue
            original,mime,data=files[field]
            if mime not in allowed:return self.send_json({'error':'Format '+field+' tidak didukung.'},415)
            ext=allowed[mime]; fname=secrets.token_hex(18)+ext; (UPLOADS/fname).write_bytes(data); saved[field]=(fname,mime)
        with connect() as c:
            previous=c.execute('SELECT avatar_file,banner_file FROM users WHERE id=?',(user['id'],)).fetchone()
            for key,col in [('avatar','avatar_file'),('banner','banner_file')]:
                if key in saved and previous[col]:old.append(previous[col])
            c.execute('UPDATE users SET name=?,bio=?,avatar_border=? WHERE id=?',(name,bio,avatar_border,user['id']))
            if 'avatar' in saved:c.execute('UPDATE users SET avatar_file=? WHERE id=?',(saved['avatar'][0],user['id']))
            if 'banner' in saved:c.execute('UPDATE users SET banner_file=?,banner_mime=? WHERE id=?',(saved['banner'][0],saved['banner'][1],user['id']))
        for filename in old:
            try:(UPLOADS/Path(filename).name).unlink(missing_ok=True)
            except OSError:pass
        return self.send_json({'ok':True,'profile':self.profile_data(user['id'])})
    def request_password_reset(self):
        email=clean_text(self.json_body().get('email'),254).lower()
        with connect() as c:
            user=c.execute('SELECT id,email FROM users WHERE email=?',(email,)).fetchone()
            if user:
                prior=c.execute('SELECT created_at FROM password_resets WHERE user_id=? ORDER BY created_at DESC LIMIT 1',(user['id'],)).fetchone()
                if prior and prior['created_at']:
                    try:
                        if datetime.now(timezone.utc)-datetime.fromisoformat(prior['created_at'])<timedelta(seconds=60):return self.send_json({'ok':True,'message':'Jika email terdaftar, tautan reset akan dikirim. Periksa inbox atau spam.'})
                    except ValueError:pass
                raw=secrets.token_urlsafe(32); token_hash=hashlib.sha256(raw.encode()).hexdigest(); expiry=(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()
                c.execute('DELETE FROM password_resets WHERE user_id=?',(user['id'],));c.execute('INSERT INTO password_resets(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',(token_hash,user['id'],expiry,now()))
        if user:
            base=os.environ.get('PUBLIC_BASE_URL','http://127.0.0.1:8000').rstrip('/'); link=base+'/reset-password.html?token='+raw
            host=os.environ.get('SMTP_HOST'); sender=os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')
            if host and sender:
                try:
                    msg=EmailMessage();msg['Subject']='Atur ulang kata sandi Jurnalistik Smansade';msg['From']=sender;msg['To']=user['email'];msg.set_content('Gunakan tautan berikut dalam 30 menit untuk mengatur ulang kata sandi:\n\n'+link+'\n\nJika kamu tidak meminta perubahan ini, abaikan email ini.')
                    with smtplib.SMTP(host,int(os.environ.get('SMTP_PORT','587')),timeout=15) as server:
                        server.starttls();
                        if os.environ.get('SMTP_USER'):server.login(os.environ['SMTP_USER'],os.environ.get('SMTP_PASSWORD',''))
                        server.send_message(msg)
                except Exception as e:print('Gagal mengirim email reset:',e)
            else:print('DEV ONLY - tautan reset kata sandi:',link)
        return self.send_json({'ok':True,'message':'Jika email terdaftar, tautan reset akan dikirim. Periksa inbox atau spam.'})
    def reset_password(self):
        d=self.json_body(); raw=str(d.get('token','')); password=str(d.get('password',''))
        if len(password)<8:return self.send_json({'error':'Kata sandi baru minimal 8 karakter.'},400)
        digest=hashlib.sha256(raw.encode()).hexdigest()
        with connect() as c:
            row=c.execute('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?',(digest,now())).fetchone()
            if not row:return self.send_json({'error':'Tautan reset tidak valid atau sudah kedaluwarsa.'},400)
            uid=row['user_id'];c.execute('UPDATE users SET password=? WHERE id=?',(hash_pw(password),uid));c.execute('DELETE FROM password_resets WHERE user_id=?',(uid,));c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        return self.send_json({'ok':True,'message':'Kata sandi berhasil diubah. Silakan masuk kembali.'})
    def create_content(self):
        u=self.require_user()
        if not u:return
        ctype=self.headers.get('Content-Type','')
        if 'multipart/form-data' in ctype:
            body=self.read_body(2*MAX_UPLOAD+1024*1024); msg=BytesParser(policy=default).parsebytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body)
            vals={}; filedata=None; orig=''; mime=''
            for part in msg.iter_parts():
                key=part.get_param('name',header='content-disposition')
                filename=part.get_filename()
                payload=part.get_payload(decode=True) or b''
                if filename:
                    if len(payload)>MAX_UPLOAD:return self.send_json({'error':'Ukuran file maksimal 20 MB.'},413)
                    orig=Path(filename).name; mime=part.get_content_type(); filedata=payload
                elif key: vals[key]=payload.decode(part.get_content_charset() or 'utf-8','replace')
        else: vals=self.json_body(); filedata=None; orig=''; mime=''
        kind=clean_text(vals.get('kind'),30); title=clean_text(vals.get('title'),180); body=sanitize_rich(vals.get('body'))
        if kind not in KINDS or not title or not body:return self.send_json({'error':'Kategori, judul, dan isi wajib diisi.'},400)
        if kind in {'artikel','liputan'} and u['role']!='admin':return self.send_json({'error':'Hanya admin yang dapat menerbitkan artikel dan liputan.'},403)
        if kind=='suara' and not body:return self.send_json({'error':'Pesan suara wajib diisi.'},400)
        if filedata is not None:
            ext=Path(orig).suffix.lower()
            if ext not in MIME_EXT:return self.send_json({'error':'Tipe file tidak didukung.'},415)
            fname=secrets.token_hex(18)+ext; (UPLOADS/fname).write_bytes(filedata)
        else: fname=None
        status='pending' if kind=='suara' else 'published'
        with connect() as c:
            cur=c.execute('INSERT INTO contents(kind,title,body,author_id,file_name,original_name,mime,created_at,status) VALUES(?,?,?,?,?,?,?,?,?)',(kind,title,body,u['id'],fname,orig or None,mime or None,now(),status)); ident=cur.lastrowid
        return self.send_json({'ok':True,'id':ident},201)

if __name__=='__main__':
    init_db(); port=int(os.environ.get('PORT','8000')); print(f'Jurnalistik Smansade aktif: http://127.0.0.1:{port}'); print('Admin bootstrap: set ADMIN_EMAIL dan ADMIN_PASSWORD sebelum menjalankan server.'); ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
