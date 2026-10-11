(() => {
  const token = () => localStorage.getItem('js-token') || '';
  const borders = {
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
    '15':'https://ar-hosting.pages.dev/f/PBSEQ2SSKNFGKS3PMYZTS5TEMJFCAUDC7BK2GHGQXDSZGEDK',
    '16':'https://ar-hosting.pages.dev/f/GFVGYQK2ORRHE322LJ3XMYLZPLV3UFBTEBGEXQ44LXE3PHLY',
    '17':'https://ar-hosting.pages.dev/f/OJZTKWCFI5JHKYTBOJXFSSRZHE6ISK6AZ645XDHB7LYWA4LC',
    '18':'https://ar-hosting.pages.dev/f/KRUUO33UONUEMSRRPJZG2NBUN6HJGSOR6225DV6JFIU4ITL5',
    '19':'https://ar-hosting.pages.dev/f/INKU6VDHO44VAVSYOBVU4WCIHB2V74L43UERQMO5VPB2W5BC',
    '20':'https://ar-hosting.pages.dev/f/J5THSWBRIRDUG2SQIRVWYWSLJUM5NT6A6P6OMCRJMPL2XOWR',
    '21':'https://ar-hosting.pages.dev/f/ONME4MLOHFQU4OLEIJGXUNCCOHCRJ2SDPT53AD5WW4QXS6DY',
    '22':'https://ar-hosting.pages.dev/f/KAYVC6SJLI4XIVCZPJTFMVLSIQRJXJ6SVPZBR5JDWIUTRPDA',
    '23':'https://ar-hosting.pages.dev/f/I5GXGTCWNQ4E2V2QKA3HOQ3HLLIRPNJUIQKAC5HEMPRWRJ6F',
    '24':'https://ar-hosting.pages.dev/f/GNXFUVDJJNZWCVDDIVHEKUCMNSCR55T4RMO5FOBDVTWAAJP7'
  };
  let sidebarCard = null, editLink = null, desktopLogout = null, mobileLogout = null, friendshipLink = null;
  let knownToken = token();
  function removeControls() {
    sidebarCard?.remove(); editLink?.remove(); desktopLogout?.remove(); mobileLogout?.remove();
    sidebarCard = editLink = desktopLogout = mobileLogout = null;
    document.body.classList.remove('signed-in');
  }
  function closeMobileMenu() {
    const menu = document.querySelector('.nav .links');
    menu?.classList.remove('open'); document.body.classList.remove('menu-open');
    const toggle = document.querySelector('.nav-toggle');
    toggle?.setAttribute('aria-expanded', 'false'); if (toggle) toggle.textContent = '☰';
  }
  function logout() {
    const currentToken = token();
    fetch('/api/logout', {method:'POST', headers:{Authorization:`Bearer ${currentToken}`}}).catch(()=>{}).finally(() => {
      localStorage.removeItem('js-token'); localStorage.removeItem('js-user'); knownToken = '';
      removeControls(); location.assign('index.html');
    });
  }
  function ensureFriendshipLink(sidebar) {
    friendshipLink = sidebar.querySelector('.friendship-nav-link');
    if (!friendshipLink) {
      friendshipLink = document.createElement('a');
      friendshipLink.className = 'friendship-nav-link';
      friendshipLink.href = 'friendship.html';
      friendshipLink.innerHTML = '<span>🤝 Friendship</span><span class="friendship-nav-badge" style="display:none;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#e94e69;color:#fff;font-size:10px;font-weight:800"></span>';
      friendshipLink.style.display = 'flex'; friendshipLink.style.alignItems = 'center'; friendshipLink.style.justifyContent = 'space-between'; friendshipLink.style.gap = '10px';
      const pointsLink = [...sidebar.querySelectorAll('a')].find(a => /\/profil\.html#rewards$/.test(a.getAttribute('href') || ''));
      if (pointsLink) pointsLink.after(friendshipLink); else sidebar.append(friendshipLink);
      friendshipLink.addEventListener('click', closeMobileMenu);
    }
  }
  async function refreshFriendshipBadge() {
    const badge = document.querySelector('.friendship-nav-badge');
    if (!badge) return;
    if (!token()) { badge.hidden = true; badge.style.display = 'none'; return; }
    try {
      const response = await fetch('/api/friends', {headers:{Authorization:`Bearer ${token()}`}});
      if (!response.ok) return;
      const data = await response.json();
      const count = Number(data.pending_count || 0) + Number(data.unread_count || 0);
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count < 1; badge.style.display = count < 1 ? 'none' : 'inline-grid';
    } catch {}
  }
  function restoreNav(navright) {
    removeControls();
    navright?.querySelectorAll('[data-account-hidden="1"]').forEach(el => {
      el.style.display = ''; el.removeAttribute('data-account-hidden');
    });
  }
  async function refreshAccountMenu() {
    const navright = document.querySelector('.nav .navright');
    const sidebar = document.querySelector('.nav .links');
    if (!navright || !sidebar) return;
    ensureFriendshipLink(sidebar);
    const currentToken = token();
    if (!currentToken) { restoreNav(navright); refreshFriendshipBadge(); return; }
    try {
      const response = await fetch('/api/me', {headers:{Authorization:`Bearer ${currentToken}`}});
      if (response.status === 401) {
        localStorage.removeItem('js-token'); localStorage.removeItem('js-user');
        restoreNav(navright); return;
      }
      if (!response.ok) return;
      const data = await response.json();
      const profile = data.user;
      if (!profile) { restoreNav(navright); return; }
      navright.querySelectorAll(':scope > :not(#theme):not(.account-sidebar-logout)').forEach(el => {
        if (el.style.display !== 'none') { el.dataset.accountHidden = '1'; el.style.display = 'none'; }
      });
      removeControls(); document.body.classList.add('signed-in');
      const card = document.createElement('a');
      card.className = 'account-sidebar-profile';
      card.href = 'profil.html';
      card.setAttribute('aria-label', `Profil ${profile.name || 'anggota'}, ${profile.tier || 'Inkling'}, ${Number(profile.points || 0).toLocaleString('id-ID')} poin`);
      const avatarWrap = document.createElement('span');
      avatarWrap.className = 'account-avatar-wrap';
      const avatar = profile.avatar_file ? document.createElement('img') : document.createElement('span');
      avatar.className = 'account-avatar';
      if (profile.avatar_file) avatar.src = `/uploads/${encodeURIComponent(profile.avatar_file)}`;
      else avatar.textContent = String(profile.name || 'A').trim().slice(0,1).toUpperCase();
      avatarWrap.append(avatar);
      const border = borders[String(profile.avatar_border || '0')];
      if (border) {
        const frame = document.createElement('img');
        frame.className = 'account-avatar-frame';
        frame.src = border; frame.alt = ''; frame.setAttribute('aria-hidden','true');
        avatarWrap.append(frame);
      }
      const info = document.createElement('span');
      info.className = 'account-profile-info';
      const name = document.createElement('strong');
      name.className = 'account-name'; name.textContent = profile.name || 'Profil saya';
      const details = document.createElement('span');
      details.className = 'account-profile-details';
      const tier = document.createElement('span');
      tier.className = `account-tier tier-${profile.tier_class || 'inkling'}`;
      tier.textContent = profile.tier || 'Inkling';
      const points = document.createElement('span');
      points.className = 'account-points';
      points.textContent = `${Number(profile.points || 0).toLocaleString('id-ID')} poin`;
      details.append(tier, points); info.append(name, details); card.append(avatarWrap, info);
      sidebarCard = card;
      sidebar.prepend(card);
      card.addEventListener('click', closeMobileMenu);
      editLink = document.createElement('a'); editLink.className = 'account-sidebar-edit'; editLink.href = 'edit-profil.html'; editLink.textContent = '✎  Edit profil';
      sidebar.insertBefore(editLink, card.nextSibling); editLink.addEventListener('click', closeMobileMenu);
      desktopLogout = document.createElement('button'); desktopLogout.type = 'button'; desktopLogout.className = 'account-sidebar-logout'; desktopLogout.textContent = 'Keluar'; desktopLogout.addEventListener('click', logout); navright.append(desktopLogout);
      mobileLogout = document.createElement('button'); mobileLogout.type = 'button'; mobileLogout.className = 'account-mobile-logout'; mobileLogout.textContent = 'Keluar dari akun'; mobileLogout.addEventListener('click', logout); sidebar.append(mobileLogout);
      refreshFriendshipBadge();
    } catch {
      // Pertahankan sesi dan tampilan sebelumnya saat jaringan sementara bermasalah.
    }
  }
  window.refreshAccountMenu = refreshAccountMenu;
  refreshAccountMenu();
  window.addEventListener('storage', event => {
    if (event.key === 'js-token') { knownToken = token(); refreshAccountMenu(); }
  });
  window.setInterval(() => {
    const value = token();
    if (value !== knownToken) { knownToken = value; refreshAccountMenu(); }
  }, 700);
  window.setInterval(() => { if (token()) refreshAccountMenu(); }, 30000);
  window.setInterval(refreshFriendshipBadge, 10000);
})();
