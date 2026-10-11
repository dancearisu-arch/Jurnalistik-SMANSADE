const KINDS = new Set(['dokumentasi','artikel','liputan','karya','suara']);
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean = (v,n=12000) => String(v ?? '').trim().slice(0,n);
const date = () => new Date().toISOString();
const token = (n=32) => { const b=new Uint8Array(n); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); };
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function passwordHash(password, salt=token(16)) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
  return `${salt}:${hex(bits)}`;
}
async function checkPassword(password, stored) { const [salt,expected='']=String(stored).split(':'); const actual=(await passwordHash(password,salt)).split(':')[1]; return actual===expected; }
async function bodyJson(req) { try{return await req.json();}catch{return null;} }
async function userFor(req,env) {
  const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!t)return null;
  return await env.DB.prepare('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').bind(t,date()).first();
}
const needUser = async (req,env) => { const u=await userFor(req,env); return u || null; };
const fail = (message,status=400) => json({error:message},status);
const safeName = s => clean(s,180).replace(/[\\/\0]/g,'_') || 'upload.bin';
async function bootstrap(env) {
  if(!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const email=clean(env.ADMIN_EMAIL,254).toLowerCase();
  const exists=await env.DB.prepare('SELECT id,role FROM users WHERE email=?').bind(email).first();
  if(!exists) await env.DB.prepare('INSERT INTO users(name,email,password,role,created_at,points_bonus) VALUES(?,?,?,?,?,9999)').bind('Admin Jurnalistik',email,await passwordHash(env.ADMIN_PASSWORD),'admin',date()).run();
  else if(exists.role!=='admin') await env.DB.prepare("UPDATE users SET role='admin',points_bonus=9999 WHERE id=?").bind(exists.id).run();
}
async function points(env,id) {
  const row=await env.DB.prepare(`SELECT u.points_bonus+u.points_adjustment+
    10*(SELECT COUNT(*) FROM contents x WHERE x.author_id=u.id AND x.kind='karya' AND x.status='published')+
    COALESCE((SELECT SUM(r.value) FROM ratings r JOIN contents x ON x.id=r.content_id WHERE x.author_id=u.id AND x.kind IN ('dokumentasi','karya') AND x.status='published'),0) points FROM users u WHERE u.id=?`).bind(id).first();
  return row?.points||0;
}
async function profile(env,id,privateView=false) {
  const u=await env.DB.prepare('SELECT id,name,email,role,bio,avatar_file,banner_file,banner_mime,created_at,points_bonus,points_adjustment,avatar_border FROM users WHERE id=?').bind(id).first();
  if(!u)return null;
  if(!privateView)delete u.email;
  const works=await env.DB.prepare(`SELECT x.id,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,
    (SELECT ROUND(AVG(value),1) FROM ratings WHERE content_id=x.id) rating,(SELECT COUNT(*) FROM ratings WHERE content_id=x.id) rating_count
    FROM contents x WHERE x.author_id=? AND x.kind='karya' AND x.status='published' ORDER BY x.created_at DESC`).bind(id).all();
  u.works=works.results; u.points=await points(env,id); u.tier=u.points<=10?'Pemula':u.points<=50?'Amatir':u.points<=100?'Jago':u.points<=500?'Sesepuh':'Fosil hidup';
  const leaders=await env.DB.prepare(`SELECT id FROM users WHERE role='member' ORDER BY points_bonus+points_adjustment+
    10*(SELECT COUNT(*) FROM contents x WHERE x.author_id=users.id AND x.kind='karya' AND x.status='published')+
    COALESCE((SELECT SUM(r.value) FROM ratings r JOIN contents x ON x.id=r.content_id WHERE x.author_id=users.id AND x.kind IN ('dokumentasi','karya') AND x.status='published'),0) DESC,name COLLATE NOCASE,id`).all();
  const rank=leaders.results.findIndex(x=>x.id===id)+1; u.rank=rank||null; u.leader_title=rank===1?'Juara Kreativitas':rank===2||rank===3?`Bintang Kreativitas #${rank}`:'';
  return u;
}
async function contents(env,kind='') {
  const rows=await env.DB.prepare(`SELECT x.id,x.kind,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,x.status,u.name author,
   (SELECT COUNT(*) FROM comments c WHERE c.content_id=x.id) comment_count,(SELECT ROUND(AVG(value),1) FROM ratings r WHERE r.content_id=x.id) rating,
   (SELECT COUNT(*) FROM ratings r WHERE r.content_id=x.id) rating_count,x.author_id FROM contents x JOIN users u ON u.id=x.author_id
   WHERE x.status='published' AND (?='' OR x.kind=?) ORDER BY x.created_at DESC`).bind(kind,kind).all();
  for(const item of rows.results){const cs=await env.DB.prepare('SELECT c.id,c.user_id,c.body,c.created_at,u.name author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.content_id=? ORDER BY c.created_at DESC').bind(item.id).all();item.comments=cs.results;}
  return rows.results;
}
async function saveFile(env,file) {
  if(!file || !file.size)return null;
  if(file.size>20*1024*1024)throw new Error('Ukuran file maksimal 20 MB.');
  const name=`${token(18)}-${safeName(file.name)}`;
  await env.FILES.put(name,await file.arrayBuffer(),{metadata:{contentType:file.type||'application/octet-stream'}});
  return {name,original:safeName(file.name),mime:file.type||'application/octet-stream'};
}
function sanitize(text) {
  const allowed=new Set(['p','br','h2','h3','strong','b','em','i','u','ul','ol','li','blockquote']);
  return clean(text).replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<!--([\s\S]*?)-->/g,'').replace(/<[^>]*>/g,tag=>{const m=tag.match(/^<(\/)?\s*([a-z0-9]+)\b([^>]*)>$/i);if(!m)return '';const name=m[2].toLowerCase();if(allowed.has(name))return `<${m[1]?'/':''}${name}>`;if(name==='a'&&!m[1]){const href=m[3].match(/href\s*=\s*(["'])(.*?)\1/i)?.[2]||'';return /^(https?:|mailto:)/i.test(href)?`<a href="${href.replace(/["<>]/g,'')}" rel="nofollow noopener">`:'<a>'; }if(name==='a'&&m[1])return '</a>';return '';});
}
async function api(req,env,url) {
  await bootstrap(env);
  const path=url.pathname, method=req.method;
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Content-Type, Authorization','access-control-allow-methods':'GET, POST, DELETE, OPTIONS'}});
  if(method==='GET' && path==='/api/health')return json({ok:true,service:'Jurnalistik Smansade'});
  if(method==='GET' && path==='/api/me')return json({user:await userFor(req,env)});
  if(method==='POST' && path==='/api/register'){
    const d=await bodyJson(req); if(!d)return fail('Permintaan JSON tidak valid.');
    const name=clean(d.name,100),email=clean(d.email,254).toLowerCase(),pw=String(d.password||'');
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||pw.length<8)return fail('Isi nama, email yang valid, dan kata sandi minimal 8 karakter.');
    try{const r=await env.DB.prepare('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)').bind(name,email,await passwordHash(pw),'member',date()).run();const t=token();await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(t,r.meta.last_row_id,new Date(Date.now()+14*86400000).toISOString()).run();return json({token:t,user:{id:r.meta.last_row_id,name,email,role:'member'}},201);}catch{return fail('Email sudah terdaftar.',409);}
  }
  if(method==='POST' && path==='/api/login'){
    const d=await bodyJson(req);if(!d)return fail('Permintaan JSON tidak valid.');
    const row=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(clean(d.email,254).toLowerCase()).first();
    if(!row||!await checkPassword(String(d.password||''),row.password))return fail('Email atau kata sandi tidak cocok.',401);
    const t=token();await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(t,row.id,new Date(Date.now()+14*86400000).toISOString()).run();return json({token:t,user:{id:row.id,name:row.name,email:row.email,role:row.role}});
  }
  if(method==='POST'&&path==='/api/logout'){const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();if(t)await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();return json({ok:true});}
  if(method==='POST'&&path==='/api/password/forgot')return fail('Pemulihan email belum dikonfigurasi. Hubungi admin untuk mengatur ulang kata sandi.',503);
  if(method==='POST'&&path==='/api/password/reset')return fail('Tautan reset tidak tersedia karena email pemulihan belum dikonfigurasi.',503);
  if(method==='POST'&&path==='/api/friends/request'){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const d=await bodyJson(req)||{},id=Number(d.user_id);if(id===u.id)return fail('Kamu tidak bisa menambahkan dirimu sendiri.');if(!await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='member'").bind(id).first())return fail('Anggota tidak ditemukan.',404);try{await env.DB.prepare('INSERT INTO friendships(requester_id,addressee_id,status,created_at) VALUES(?,?,?,?)').bind(u.id,id,'pending',date()).run();return json({ok:true},201);}catch{return fail('Permintaan atau pertemanan sudah ada.',409);}}
  const accept=path.match(/^\/api\/friends\/(\d+)\/accept$/);if(method==='POST'&&accept){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const r=await env.DB.prepare("UPDATE friendships SET status='accepted' WHERE id=? AND addressee_id=? AND status='pending'").bind(Number(accept[1]),u.id).run();return r.meta.changes?json({ok:true}):fail('Permintaan pertemanan tidak ditemukan.',404);}
  if(method==='POST'&&path==='/api/admin/users/points'){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);const d=await bodyJson(req)||{},id=Number(d.user_id),target=Number(d.points);if(!Number.isInteger(target)||target<0||target>1e9)return fail('Poin tidak valid.');const old=await env.DB.prepare('SELECT points_bonus,points_adjustment FROM users WHERE id=?').bind(id).first();if(!old)return fail('Akun tidak ditemukan.',404);const earned=(await points(env,id))-old.points_bonus-old.points_adjustment;await env.DB.prepare('UPDATE users SET points_adjustment=? WHERE id=?').bind(target-old.points_bonus-earned,id).run();return json({ok:true,points:target});}
  if(method==='POST'&&path==='/api/admin/featured-liputan'){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);const d=await bodyJson(req)||{},id=Number(d.content_id);if(!await env.DB.prepare("SELECT id FROM contents WHERE id=? AND kind='liputan' AND status='published' AND mime LIKE 'video/%'").bind(id).first())return fail('Pilih liputan terbit yang valid.');await env.DB.prepare('INSERT INTO featured_liputan(id,content_id,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET content_id=excluded.content_id,updated_at=excluded.updated_at').bind(id,date()).run();return json({ok:true});}
  const mod=path.match(/^\/api\/admin\/content\/(\d+)\/(publish|reject)$/);if(method==='POST'&&mod){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);if(mod[2]==='publish')await env.DB.prepare("UPDATE contents SET status='published' WHERE id=? AND status='pending'").bind(Number(mod[1])).run();else await env.DB.prepare("DELETE FROM contents WHERE id=? AND status='pending'").bind(Number(mod[1])).run();return json({ok:true});}
  if(method==='GET'&&path==='/api/contents'){const kind=url.searchParams.get('kind')||'';if(kind&&!KINDS.has(kind))return fail('Kategori tidak dikenal.');return json({contents:await contents(env,kind)});}
  if(method==='GET'&&path==='/api/community'){return json({contents:(await contents(env)).filter(x=>['dokumentasi','karya'].includes(x.kind)).slice(0,4)});}
  if(method==='GET'&&path==='/api/leaderboard'){const rows=await env.DB.prepare(`SELECT id,name,avatar_file,points_bonus+points_adjustment+10*(SELECT COUNT(*) FROM contents x WHERE x.author_id=users.id AND x.kind='karya' AND x.status='published')+COALESCE((SELECT SUM(r.value) FROM ratings r JOIN contents x ON x.id=r.content_id WHERE x.author_id=users.id AND x.kind IN ('dokumentasi','karya') AND x.status='published'),0) points FROM users WHERE role='member' ORDER BY points DESC,name COLLATE NOCASE,id`).all();return json({leaderboard:rows.results.map((x,i)=>({...x,rank:i+1,title:i===0?'Juara Kreativitas':i<3?`Bintang Kreativitas #${i+1}`:''}))});}
  if(method==='GET'&&path==='/api/featured-liputan'){const x=await env.DB.prepare(`SELECT x.id,x.title,x.body,x.file_name,x.original_name,x.mime,x.created_at,u.name author FROM featured_liputan f JOIN contents x ON x.id=f.content_id JOIN users u ON u.id=x.author_id WHERE f.id=1 AND x.status='published' AND x.kind='liputan'`).first();return json({content:x||null});}
  if(method==='GET'&&path==='/api/profile'){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);return json({profile:await profile(env,u.id,true)});}
  if(method==='GET'&&path==='/api/friends'){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const a=await env.DB.prepare(`SELECT f.id,u.id user_id,u.name,u.avatar_file FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?) ORDER BY u.name`).bind(u.id,u.id,u.id).all();const b=await env.DB.prepare(`SELECT f.id,u.id user_id,u.name,u.avatar_file FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=? AND f.status='pending' ORDER BY f.created_at DESC`).bind(u.id).all();return json({friends:a.results,incoming:b.results});}
  const fs=path.match(/^\/api\/friends\/status\/(\d+)$/);if(method==='GET'&&fs){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const id=Number(fs[1]),f=await env.DB.prepare('SELECT id,requester_id,addressee_id,status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)').bind(u.id,id,id,u.id).first();return json({friendship:f||null,viewer_id:u.id});}
  if(method==='GET'&&path==='/api/admin/pending'){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);const r=await env.DB.prepare('SELECT x.id,x.kind,x.title,x.body,x.created_at,u.name author FROM contents x JOIN users u ON u.id=x.author_id WHERE x.status=? ORDER BY x.created_at').bind('pending').all();return json({pending:r.results});}
  if(method==='GET'&&path==='/api/admin/users'){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);const rows=await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.points_bonus,u.points_adjustment,u.created_at,(SELECT COUNT(*) FROM contents x WHERE x.author_id=u.id AND x.kind='karya') work_count,u.points_bonus+u.points_adjustment+10*(SELECT COUNT(*) FROM contents x WHERE x.author_id=u.id AND x.kind='karya' AND x.status='published')+COALESCE((SELECT SUM(r.value) FROM ratings r JOIN contents x ON x.id=r.content_id WHERE x.author_id=u.id AND x.kind IN ('dokumentasi','karya') AND x.status='published'),0) points FROM users u ORDER BY u.created_at DESC`).all();return json({users:rows.results});}
  if(method==='GET'&&path==='/api/admin/liputan-options'){const u=await needUser(req,env);if(!u||u.role!=='admin')return fail('Khusus admin.',403);const rows=await env.DB.prepare("SELECT id,title,created_at FROM contents WHERE kind='liputan' AND status='published' AND mime LIKE 'video/%' ORDER BY created_at DESC").all(),selected=await env.DB.prepare('SELECT content_id FROM featured_liputan WHERE id=1').first();return json({contents:rows.results,selected_id:selected?.content_id||null});}
  if(method==='GET'&&path==='/api/users/search'){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const term=clean(url.searchParams.get('q'),80);const rows=term.length<2?{results:[]}:await env.DB.prepare('SELECT id,name,bio,avatar_file FROM users WHERE role=? AND id<>? AND name LIKE ? ORDER BY name LIMIT 20').bind('member',u.id,`%${term}%`).all();return json({users:rows.results});}
  const userMatch=path.match(/^\/api\/users\/(\d+)$/);if(method==='GET'&&userMatch){const p=await profile(env,Number(userMatch[1]));return p?json({profile:p}):fail('Profil tidak ditemukan.',404);}
  if(method==='GET'&&path.startsWith('/uploads/')){const key=decodeURIComponent(path.slice(9));const obj=await env.FILES.getWithMetadata(key,{type:'arrayBuffer'});return obj.value?new Response(obj.value,{headers:{'content-type':obj.metadata?.contentType||'application/octet-stream','cache-control':'public,max-age=3600'}}):fail('Berkas tidak ditemukan.',404);}
  const download=path.match(/^\/api\/download\/(\d+)$/);if(method==='GET'&&download){const row=await env.DB.prepare('SELECT file_name,original_name,mime FROM contents WHERE id=? AND status=?').bind(Number(download[1]),'published').first();if(!row?.file_name)return fail('Berkas tidak ditemukan.',404);const obj=await env.FILES.get(row.file_name,{type:'arrayBuffer'});return obj?new Response(obj,{headers:{'content-type':row.mime||'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name||'download')}`}}):fail('Berkas tidak tersedia.',404);}
  if(method==='POST'&&path==='/api/profile'){
    const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);let form;try{form=await req.formData();}catch{return fail('Gunakan form profil.');}
    const name=clean(form.get('name'),100),bio=clean(form.get('bio'),1200),border=clean(form.get('avatar_border')||'0',2);if(name.length<2)return fail('Nama minimal 2 karakter.');if(!/^(0|[1-9]|1[0-4])$/.test(border))return fail('Pilihan border tidak valid.');let avatar=null,banner=null;
    for(const field of ['avatar','banner']){const f=form.get(field);if(!(f instanceof File)||!f.size)continue;const allowed=field==='avatar'?['image/jpeg','image/png','image/gif','image/webp']:['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime'];if(!allowed.includes(f.type))return fail(`Format ${field} tidak didukung.`,415);try{const x=await saveFile(env,f);if(field==='avatar')avatar=x;else banner=x;}catch(e){return fail(e.message,413);}}
    await env.DB.prepare('UPDATE users SET name=?,bio=?,avatar_border=?,avatar_file=COALESCE(?,avatar_file),banner_file=COALESCE(?,banner_file),banner_mime=COALESCE(?,banner_mime) WHERE id=?').bind(name,bio,border,avatar?.name||null,banner?.name||null,banner?.mime||null,u.id).run();return json({ok:true,profile:await profile(env,u.id)});
  }
  if(method==='POST'&&path==='/api/contents'){
    const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);
    let d,file;try{const form=await req.formData();d={kind:form.get('kind'),title:form.get('title'),body:form.get('body')};file=form.get('file');}catch{d=await bodyJson(req)||{};}
    const kind=clean(d.kind,30),title=clean(d.title,180),body=sanitize(d.body);if(!KINDS.has(kind)||!title||!body)return fail('Kategori, judul, dan isi wajib diisi.');if(['artikel','liputan'].includes(kind)&&u.role!=='admin')return fail('Hanya admin yang dapat menerbitkan artikel dan liputan.',403);
    let saved=null;try{saved=await saveFile(env,file);}catch(e){return fail(e.message,413);}
    const status=kind==='suara'?'pending':'published';const r=await env.DB.prepare('INSERT INTO contents(kind,title,body,author_id,file_name,original_name,mime,created_at,status) VALUES(?,?,?,?,?,?,?,?,?)').bind(kind,title,body,u.id,saved?.name||null,saved?.original||null,saved?.mime||null,date(),status).run();return json({ok:true,id:r.meta.last_row_id},201);
  }
  const comment=path.match(/^\/api\/contents\/(\d+)\/comments$/);if(method==='POST'&&comment){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const d=await bodyJson(req)||{},body=clean(d.body,3000);if(!body)return fail('Komentar tidak boleh kosong.');const exists=await env.DB.prepare('SELECT id FROM contents WHERE id=? AND status=?').bind(Number(comment[1]),'published').first();if(!exists)return fail('Konten tidak ditemukan.',404);await env.DB.prepare('INSERT INTO comments(content_id,user_id,body,created_at) VALUES(?,?,?,?)').bind(Number(comment[1]),u.id,body,date()).run();return json({ok:true},201);}
  const rating=path.match(/^\/api\/contents\/(\d+)\/rating$/);if(method==='POST'&&rating){const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);const d=await bodyJson(req)||{},v=Number(d.value);if(v<1||v>5)return fail('Rating harus bernilai 1 sampai 5.');const c=await env.DB.prepare('SELECT author_id,kind,status FROM contents WHERE id=?').bind(Number(rating[1])).first();if(!c||c.status!=='published')return fail('Karya tidak ditemukan.',404);if(!['dokumentasi','karya'].includes(c.kind))return fail('Rating hanya tersedia untuk dokumentasi dan karya siswa.');if(c.author_id===u.id)return fail('Kamu tidak dapat memberi rating pada unggahan sendiri.');await env.DB.prepare('INSERT INTO ratings(content_id,user_id,value) VALUES(?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET value=excluded.value').bind(Number(rating[1]),u.id,v).run();return json({ok:true});}
  if(method==='DELETE'){
    const u=await needUser(req,env);if(!u)return fail('Silakan masuk terlebih dahulu.',401);
    const cm=path.match(/^\/api\/comments\/(\d+)$/);if(cm){const row=await env.DB.prepare('SELECT user_id,created_at FROM comments WHERE id=?').bind(Number(cm[1])).first();if(!row)return fail('Komentar tidak ditemukan.',404);if(u.role!=='admin'&&(u.id!==row.user_id||Date.now()-Date.parse(row.created_at)>15*60*1000))return fail('Komentar hanya bisa dihapus admin atau penulis dalam 15 menit.',403);await env.DB.prepare('DELETE FROM comments WHERE id=?').bind(Number(cm[1])).run();return json({ok:true});}
    const fr=path.match(/^\/api\/friends\/(\d+)$/);if(fr){const r=await env.DB.prepare('DELETE FROM friendships WHERE id=? AND (requester_id=? OR addressee_id=?)').bind(Number(fr[1]),u.id,u.id).run();return r.meta.changes?json({ok:true}):fail('Relasi pertemanan tidak ditemukan.',404);}
    const du=path.match(/^\/api\/admin\/users\/(\d+)$/);if(du){if(u.role!=='admin')return fail('Khusus admin.',403);const id=Number(du[1]);if(id===u.id)return fail('Admin tidak dapat menghapus akunnya sendiri.',400);const who=await env.DB.prepare('SELECT id,role,avatar_file,banner_file FROM users WHERE id=?').bind(id).first();if(!who)return fail('Akun tidak ditemukan.',404);if(who.role==='admin')return fail('Akun admin tidak dapat dihapus dari panel anggota.',403);const files=await env.DB.prepare('SELECT file_name FROM contents WHERE author_id=? AND file_name IS NOT NULL').bind(id).all();await env.DB.batch([env.DB.prepare('DELETE FROM featured_liputan WHERE content_id IN (SELECT id FROM contents WHERE author_id=?)').bind(id),env.DB.prepare('DELETE FROM featured_members WHERE user_id=?').bind(id),env.DB.prepare('DELETE FROM comments WHERE user_id=? OR content_id IN (SELECT id FROM contents WHERE author_id=?)').bind(id,id),env.DB.prepare('DELETE FROM ratings WHERE user_id=? OR content_id IN (SELECT id FROM contents WHERE author_id=?)').bind(id,id),env.DB.prepare('DELETE FROM friendships WHERE requester_id=? OR addressee_id=?').bind(id,id),env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),env.DB.prepare('DELETE FROM contents WHERE author_id=?').bind(id),env.DB.prepare('DELETE FROM users WHERE id=?').bind(id)]);for(const f of [...files.results.map(x=>x.file_name),who.avatar_file,who.banner_file].filter(Boolean))await env.FILES.delete(f);return json({ok:true});}
    const del=path.match(/^\/api\/admin\/content\/(\d+)$/);if(del){if(u.role!=='admin')return fail('Khusus admin.',403);const row=await env.DB.prepare('SELECT file_name FROM contents WHERE id=?').bind(Number(del[1])).first();if(!row)return fail('Postingan tidak ditemukan.',404);await env.DB.prepare('DELETE FROM contents WHERE id=?').bind(Number(del[1])).run();if(row.file_name)await env.FILES.delete(row.file_name);return json({ok:true});}
  }
  return fail('Rute API tidak ditemukan.',404);
}
export default { async fetch(request,env,ctx) {
  try {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/'))return await api(request,env,url);
    if(url.pathname==='/')url.pathname='/index.html';
    return env.ASSETS.fetch(new Request(url,request));
  } catch(err) { console.error(err); return json({error:'Kesalahan server. Periksa log Worker.'},500); }
} };
