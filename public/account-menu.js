(() => {
  const token = () => localStorage.getItem('js-token') || '';
  const escapeText = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let knownToken = token();
  let currentArea = null;

  async function refreshAccountMenu() {
    const navright = document.querySelector('.nav .navright');
    if (!navright) return;
    const currentToken = token();
    if (!currentToken) {
      currentArea?.remove();
      currentArea = null;
      navright.querySelectorAll('[data-account-hidden="1"]').forEach(el => { el.style.display = ''; el.removeAttribute('data-account-hidden'); });
      return;
    }
    const headers = {Authorization: `Bearer ${currentToken}`};
    try {
      const [profileResponse, friendsResponse] = await Promise.all([
        fetch('/api/me', {headers}),
        fetch('/api/friends', {headers})
      ]);
      if (!profileResponse.ok) throw new Error('Sesi masuk tidak berlaku');
      const profileData = await profileResponse.json();
      const friendsData = friendsResponse.ok ? await friendsResponse.json() : {incoming: []};
      const profile = profileData.user || {};
      const incoming = Array.isArray(friendsData.incoming) ? friendsData.incoming : [];
      navright.querySelectorAll(':scope > :not(#theme):not(.account-area)').forEach(el => {
        if (el.style.display !== 'none') { el.dataset.accountHidden = '1'; el.style.display = 'none'; }
      });
      currentArea?.remove();
      currentArea = document.createElement('div');
      currentArea.className = 'account-area';
      const identity = document.createElement('a');
      identity.className = 'account-identity';
      identity.href = 'profil.html';
      identity.setAttribute('aria-label', `Profil ${profile.name || 'anggota'}`);
      const avatar = profile.avatar_file ? document.createElement('img') : document.createElement('span');
      avatar.className = 'account-avatar';
      if (profile.avatar_file) avatar.src = `/uploads/${encodeURIComponent(profile.avatar_file)}`;
      else avatar.textContent = String(profile.name || 'A').trim().slice(0,1).toUpperCase();
      identity.append(avatar);
      const name = document.createElement('span');
      name.className = 'account-name';
      name.textContent = profile.name || 'Profil saya';
      identity.append(name);
      const noticeButton = document.createElement('button');
      noticeButton.type = 'button';
      noticeButton.className = 'account-bell';
      noticeButton.setAttribute('aria-label', `Permintaan pertemanan: ${incoming.length}`);
      noticeButton.setAttribute('aria-expanded', 'false');
      noticeButton.textContent = '\u{1F514}';
      if (incoming.length) { const count = document.createElement('span'); count.className = 'account-count'; count.textContent = incoming.length > 99 ? '99+' : String(incoming.length); noticeButton.append(count); }
      const logoutButton = document.createElement('button');
      logoutButton.type = 'button';
      logoutButton.className = 'account-logout';
      logoutButton.textContent = 'Keluar';
      logoutButton.setAttribute('aria-label', 'Keluar dari akun');
      logoutButton.addEventListener('click', async () => { try { await fetch('/api/logout', {method:'POST',headers}); } catch {} localStorage.removeItem('js-token'); localStorage.removeItem('js-user'); window.location.assign('index.html'); });
      const popover = document.createElement('div');
      popover.className = 'account-popover';
      popover.hidden = true;
      const heading = document.createElement('b');
      heading.textContent = 'Permintaan pertemanan';
      popover.append(heading);
      if (!incoming.length) {
        const empty = document.createElement('p');
        empty.className = 'account-empty';
        empty.textContent = 'Belum ada permintaan baru.';
        popover.append(empty);
      } else {
        incoming.forEach(request => {
          const row = document.createElement('div');
          row.className = 'account-request';
          const who = document.createElement('a');
          who.href = `profil.html?id=${encodeURIComponent(request.user_id)}`;
          who.textContent = request.name || 'Anggota';
          const actions = document.createElement('div');
          actions.className = 'account-request-actions';
          for (const [label, action] of [['Terima','accept'],['Tolak','reject']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.dataset.action = action;
            button.dataset.request = String(request.id);
            actions.append(button);
          }
          row.append(who, actions);
          popover.append(row);
        });
      }
      noticeButton.addEventListener('click', event => {
        event.stopPropagation();
        popover.hidden = !popover.hidden;
        noticeButton.setAttribute('aria-expanded', String(!popover.hidden));
      });
      popover.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        button.disabled = true;
        const id = encodeURIComponent(button.dataset.request);
        const options = button.dataset.action === 'accept' ? {method:'POST',headers} : {method:'DELETE',headers};
        try {
          const response = await fetch(button.dataset.action === 'accept' ? `/api/friends/${id}/accept` : `/api/friends/${id}`, options);
          if (!response.ok) throw new Error('Permintaan belum dapat diperbarui.');
          await refreshAccountMenu();
          const notify = window.showNotice || window.notice; if (notify) notify(button.dataset.action === 'accept' ? 'Permintaan diterima.' : 'Permintaan ditolak.');
        } catch (error) {
          button.disabled = false;
          const notify = window.showNotice || window.notice; if (notify) notify(error.message);
        }
      });
      currentArea.append(identity, noticeButton, logoutButton, popover);
      navright.append(currentArea);
    } catch {
      currentArea?.remove();
      currentArea = null;
      localStorage.removeItem('js-token');
      localStorage.removeItem('js-user');
      navright.querySelectorAll('[data-account-hidden="1"]').forEach(el => { el.style.display = ''; el.removeAttribute('data-account-hidden'); });
    }
  }
  document.addEventListener('click', event => {
    if (currentArea && !currentArea.contains(event.target)) {
      const popover = currentArea.querySelector('.account-popover');
      const bell = currentArea.querySelector('.account-bell');
      if (popover) popover.hidden = true;
      bell?.setAttribute('aria-expanded', 'false');
    }
  });
  window.refreshAccountMenu = refreshAccountMenu;
  refreshAccountMenu();
  window.addEventListener('storage', event => { if (event.key === 'js-token') { knownToken = token(); refreshAccountMenu(); } });
  window.setInterval(() => {
    const value = token();
    if (value !== knownToken) { knownToken = value; refreshAccountMenu(); }
  }, 700);
  window.setInterval(() => { if (token()) refreshAccountMenu(); }, 30000);
})();
