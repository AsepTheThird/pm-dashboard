(function () {
  'use strict';

  var CFG = window.PM_CONFIG || {};
  var MAX_FILE = 20 * 1048576;
  var BUCKET = 'documents';
  var MON = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var DAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var STATUSES = ['Perencanaan', 'Desain', 'Berjalan', 'Review', 'Selesai'];
  var TYPE_ORDER = { PRD: 0, Update: 1, Lainnya: 2 };

  var ICON = {
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
  };

  /* ---------- helpers ---------- */
  function $(s) { return document.querySelector(s); }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) { try { return crypto.randomUUID(); } catch (e) {} }
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function fmtSize(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function initials(name) {
    var p = name.trim().split(/\s+/);
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function safeName(n) { return n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'berkas'; }

  var todayKey = key(new Date());
  function diff(k) { return Math.round((parse(k) - parse(todayKey)) / 86400000); }
  function short(k) { var d = parse(k); return d.getDate() + ' ' + MS[d.getMonth()] + ' ' + d.getFullYear(); }
  function long(k) { var d = parse(k); return DAY[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function rel(k) {
    var n = diff(k);
    if (n < 0) return 'Terlambat ' + (-n) + ' hari';
    if (n === 0) return 'Hari ini';
    if (n === 1) return 'Besok';
    return n + ' hari lagi';
  }

  /* ---------- state ---------- */
  var now = new Date();
  var S = {
    user: null,
    theme: 'dark', lead: 3,
    projects: [], pins: [], docs: [], team: [],
    viewY: now.getFullYear(), viewM: now.getMonth(), selected: todayKey,
    openMember: '', docFilter: 'all'
  };
  try { if (localStorage.getItem('pm-theme') === 'light') S.theme = 'light'; } catch (e) {}

  /* ---------- Supabase ---------- */
  var sb = null;
  if (window.supabase && CFG.url && CFG.key) {
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  var toastTimer;
  function toast(t) {
    var el = $('#toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 6000);
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }

  // Jalankan operasi database. Kalau gagal: tampilkan pesan, lalu muat ulang dari server
  // supaya tampilan kembali sesuai data yang sebenarnya.
  function run(builder) {
    return Promise.resolve(builder).then(function (r) {
      if (r && r.error) throw r.error;
      return r ? r.data : null;
    }).catch(function (e) {
      toast('Gagal menyimpan: ' + errText(e));
      return loadAll().catch(function () {}).then(function () { return null; });
    });
  }

  function loadAll() {
    return Promise.all([
      sb.from('projects').select('*').order('created_at'),
      sb.from('pins').select('*').order('date'),
      sb.from('team_members').select('*').order('created_at'),
      sb.from('project_members').select('project_id,member_id'),
      sb.from('documents').select('*').order('created_at', { ascending: false }),
      sb.from('settings').select('*').maybeSingle()
    ]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
      S.projects = r[0].data.map(function (p) {
        return { id: p.id, name: p.name, due: p.due, progress: p.progress, status: p.status, tone: p.tone };
      });
      S.pins = r[1].data.map(function (p) { return { id: p.id, date: p.date, label: p.label }; });
      var links = r[3].data;
      S.team = r[2].data.map(function (m) {
        return {
          id: m.id, name: m.name, role: m.role || '',
          projectIds: links.filter(function (l) { return l.member_id === m.id; }).map(function (l) { return l.project_id; })
        };
      });
      S.docs = r[4].data.map(function (d) {
        return {
          id: d.id, title: d.title, type: d.type, projectId: d.project_id || '', url: d.url || '',
          file: d.file_path ? { name: d.file_name || 'berkas', size: d.file_size || 0, path: d.file_path } : null,
          added: key(new Date(d.created_at))
        };
      });
      if (r[5].data) {
        S.lead = r[5].data.lead_days;
        S.theme = r[5].data.theme === 'light' ? 'light' : 'dark';
        try { localStorage.setItem('pm-theme', S.theme); } catch (e) {}
      }
      renderAll();
    });
  }

  function saveSettings() {
    try { localStorage.setItem('pm-theme', S.theme); } catch (e) {}
    return run(sb.from('settings').upsert({
      user_id: S.user.id, lead_days: S.lead, theme: S.theme, updated_at: new Date().toISOString()
    }));
  }

  /* ---------- derived data ---------- */
  function events() {
    var list = S.projects.map(function (p) {
      return { id: p.id, date: p.due, label: p.name, kind: 'proyek', done: p.status === 'Selesai' };
    });
    return list.concat(S.pins.map(function (k) {
      return { id: k.id, date: k.date, label: k.label, kind: 'pin', done: false };
    }));
  }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
  function dotCls(e) { return e.kind === 'proyek' ? 'dot-due' : 'dot-pin'; }
  function memberIdx(id) { return S.team.findIndex(function (m) { return m.id === id; }); }
  function msg(t) { $('#doc-msg').textContent = t || ''; }

  /* ---------- render ---------- */
  function renderTheme() {
    document.documentElement.setAttribute('data-theme', S.theme);
    var dark = S.theme === 'dark';
    var b = $('#theme-btn');
    b.innerHTML = dark ? ICON.moon : ICON.sun;
    b.setAttribute('aria-pressed', String(dark));
    b.setAttribute('aria-label', dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0E1311' : '#E3EDE5');
  }

  function renderHead() {
    var live = events().filter(function (e) { return !e.done && diff(e.date) >= 0; }).sort(byDate);
    var week = live.filter(function (e) { return diff(e.date) <= 7; }).length;
    $('#today').textContent = long(todayKey);
    $('#next').textContent = live.length
      ? 'Deadline terdekat: ' + live[0].label + ' (' + rel(live[0].date).toLowerCase() + ').'
      : 'Belum ada deadline di depan. Buat proyek atau pin tanggal di kalender untuk mulai.';
    $('#stats').innerHTML =
      stat(S.projects.length, 'Proyek aktif') + stat(week, 'Deadline 7 hari') +
      stat(S.docs.length, 'Dokumen') + stat(S.team.length, 'Anggota tim');
    $('#team-count').textContent = S.team.length + ' anggota';
    $('#doc-count').textContent = S.docs.length + ' berkas';
  }
  function stat(n, l) { return '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>'; }

  function renderReminders() {
    $('#lead-chips').innerHTML = [1, 3, 7].map(function (n) {
      return '<button class="chip" data-act="lead" data-v="' + n + '" aria-pressed="' + (S.lead === n) + '">' + n + ' hari</button>';
    }).join('');
    var rem = events().filter(function (e) { return !e.done && diff(e.date) <= S.lead; }).sort(byDate);
    $('#reminders').innerHTML = rem.length ? rem.map(function (e) {
      var hot = diff(e.date) <= 1;
      return '<button class="row" data-act="jump" data-date="' + e.date + '">' +
        '<span class="dot ' + dotCls(e) + '"></span>' +
        '<span class="txt strong">' + (e.kind === 'proyek' ? 'Deadline · ' : 'Pin · ') + esc(e.label) + '</span>' +
        '<span class="badge' + (hot ? ' hot' : '') + '">' + rel(e.date) + ' · ' + short(e.date) + '</span></button>';
    }).join('') : '<div class="empty">Tidak ada deadline dalam ' + S.lead + ' hari ke depan.</div>';
  }

  function renderProjects() {
    if (!S.projects.length) {
      $('#projects').innerHTML = '<div class="card empty-box" style="grid-column:1/-1">Belum ada proyek. Tekan <strong>Proyek baru</strong> untuk mulai melacak.</div>';
      return;
    }
    $('#projects').innerHTML = S.projects.map(function (p) {
      var n = diff(p.due), done = p.status === 'Selesai', hot = !done && n <= S.lead;
      var mem = S.team.filter(function (m) { return m.projectIds.indexOf(p.id) >= 0; });
      var pd = S.docs.filter(function (d) { return d.projectId === p.id; });
      var prd = pd.some(function (d) { return d.type === 'PRD'; });
      var upd = pd.filter(function (d) { return d.type === 'Update'; }).length;
      var avs = mem.slice(0, 4).map(function (m) {
        return '<span class="av av-' + (memberIdx(m.id) % 5) + '">' + esc(initials(m.name)) + '</span>';
      }).join('');
      var names = mem.length ? mem.map(function (m) { return esc(m.name.trim().split(/\s+/)[0]); }).join(', ') : 'Belum ada anggota';
      return '<article class="proj tone-' + (p.tone % 4) + '">' +
        '<div class="proj-top"><div class="small">Deadline ' + short(p.due) + '</div>' +
        '<button class="icon-btn" data-act="proj-del" data-id="' + p.id + '" aria-label="Hapus proyek ' + esc(p.name) + '">' + ICON.trash + '</button></div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<button class="status" data-act="proj-status" data-id="' + p.id + '" aria-label="Status ' + esc(p.status) + ', tekan untuk ganti">' + esc(p.status) + ' ›</button>' +
        '<div><div class="prog-label"><span>Progres</span><span>' + p.progress + '%</span></div>' +
        '<div class="bar" role="progressbar" aria-label="Progres ' + esc(p.name) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.progress + '"><i style="width:' + p.progress + '%"></i></div></div>' +
        '<div class="proj-team"><div class="avs" aria-hidden="true">' + avs + '</div><span class="t">' + names + '</span></div>' +
        '<div class="tags"><span class="tag">' + (prd ? 'PRD ✓' : 'PRD belum ada') + '</span><span class="tag">' + upd + ' update</span></div>' +
        '<div class="proj-foot"><div class="step">' +
        '<button data-act="proj-dec" data-id="' + p.id + '" aria-label="Kurangi progres 10 persen">−</button>' +
        '<button data-act="proj-inc" data-id="' + p.id + '" aria-label="Tambah progres 10 persen">+</button></div>' +
        '<span class="left' + (hot ? ' hot' : '') + '">' + (done ? 'Selesai' : rel(p.due)) + '</span></div></article>';
    }).join('');
  }

  function renderCalendar() {
    $('#cal-title').textContent = MON[S.viewM] + ' ' + S.viewY;
    var ev = events();
    var first = new Date(S.viewY, S.viewM, 1);
    var lead = (first.getDay() + 6) % 7;
    var days = new Date(S.viewY, S.viewM + 1, 0).getDate();
    var html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('');
    for (var i = 0; i < lead; i++) html += '<div class="blank"></div>';
    for (var d = 1; d <= days; d++) {
      var k = S.viewY + '-' + pad(S.viewM + 1) + '-' + pad(d);
      var here = ev.filter(function (e) { return e.date === k; });
      var cls = 'cell';
      if (here.some(function (e) { return e.kind === 'pin'; })) cls += ' has-pin';
      if (here.some(function (e) { return e.kind === 'proyek'; })) cls += ' has-due';
      if (k === todayKey) cls += ' today';
      if (k === S.selected) cls += ' sel';
      var aria = d + ' ' + MON[S.viewM] + (k === todayKey ? ', hari ini' : '') + (here.length ? ', ' + here.length + ' penanda' : '');
      html += '<div><button class="' + cls + '" data-act="pick" data-date="' + k + '" aria-pressed="' + (k === S.selected) + '" aria-label="' + aria + '">' + d + '</button></div>';
    }
    $('#cal-grid').innerHTML = html;

    $('#day-title').textContent = long(S.selected);
    var de = ev.filter(function (e) { return e.date === S.selected; });
    $('#day-events').innerHTML = de.length ? de.map(function (e) {
      return '<div class="row"><span class="dot ' + dotCls(e) + '"></span><span class="txt">' +
        (e.kind === 'proyek' ? 'Deadline · ' : '') + esc(e.label) + '</span>' +
        (e.kind === 'pin' ? '<button class="icon-btn" data-act="pin-del" data-id="' + e.id + '" aria-label="Hapus pin ' + esc(e.label) + '">' + ICON.x + '</button>' : '') +
        '</div>';
    }).join('') : '<div class="empty">Belum ada penanda di tanggal ini.</div>';

    var up = ev.filter(function (e) { return !e.done && diff(e.date) >= 0; }).sort(byDate).slice(0, 4);
    $('#upcoming').innerHTML = up.length ? up.map(function (e) {
      var d = parse(e.date);
      return '<button class="row" data-act="jump" data-date="' + e.date + '"><span class="dot ' + dotCls(e) + '"></span>' +
        '<span class="txt">' + esc(e.label) + '</span><span class="when">' + d.getDate() + ' ' + MS[d.getMonth()] + ' · ' + rel(e.date) + '</span></button>';
    }).join('') : '<div class="empty">Tidak ada deadline mendatang.</div>';
  }

  function renderTeam() {
    if (!S.team.length) {
      $('#team').innerHTML = '<div class="empty-box">Belum ada anggota. Masukkan nama dan peran di atas, lalu tandai mereka ke proyek yang dikerjakan.</div>';
      return;
    }
    $('#team').innerHTML = S.team.map(function (m, i) {
      var names = S.projects.filter(function (p) { return m.projectIds.indexOf(p.id) >= 0; }).map(function (p) { return p.name; });
      var open = S.openMember === m.id;
      var checks = '';
      if (open) {
        checks = '<fieldset><legend>Tandai ke proyek</legend>' + (S.projects.length ? S.projects.map(function (p) {
          return '<label class="check"><input type="checkbox" data-act="assign" data-id="' + m.id + '" data-pid="' + p.id + '"' +
            (m.projectIds.indexOf(p.id) >= 0 ? ' checked' : '') + '><span>' + esc(p.name) + '</span></label>';
        }).join('') : '<div class="empty">Buat proyek dulu supaya bisa ditandai.</div>') + '</fieldset>';
      }
      return '<div class="member"><div class="member-top"><span class="av av-' + (i % 5) + '" aria-hidden="true">' + esc(initials(m.name)) + '</span>' +
        '<div class="who"><b>' + esc(m.name) + '</b><span>' + esc(m.role || 'Peran belum diisi') + '</span></div>' +
        '<button class="icon-btn" data-act="member-del" data-id="' + m.id + '" aria-label="Hapus ' + esc(m.name) + ' dari tim">' + ICON.x + '</button></div>' +
        '<div class="member-mid"><span>' + (names.length ? 'Proyek: ' + esc(names.join(', ')) : 'Belum ditugaskan ke proyek') + '</span>' +
        '<button class="chip" data-act="member-open" data-id="' + m.id + '" aria-expanded="' + open + '">' + (open ? 'Selesai' : 'Atur proyek') + '</button></div>' +
        checks + '</div>';
    }).join('');
  }

  function renderDocs() {
    var sel = $('#d-proj'), keep = sel.value;
    sel.innerHTML = '<option value="">Umum</option>' + S.projects.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    sel.value = S.projects.some(function (p) { return p.id === keep; }) ? keep : '';

    var chips = [{ id: 'all', name: 'Semua' }].concat(S.projects.map(function (p) { return { id: p.id, name: p.name }; }), [{ id: '_umum', name: 'Umum' }]);
    $('#doc-filters').innerHTML = chips.map(function (c) {
      return '<button class="chip" data-act="filter" data-id="' + c.id + '" aria-pressed="' + (S.docFilter === c.id) + '">' + esc(c.name) + '</button>';
    }).join('');

    function docsOf(pid) {
      return S.docs.map(function (d, i) { return { d: d, i: i }; })
        .filter(function (x) { return x.d.projectId === pid; })
        .sort(function (a, b) { return (TYPE_ORDER[a.d.type] - TYPE_ORDER[b.d.type]) || (a.i - b.i); })
        .map(function (x) { return x.d; });
    }
    function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : ''; }
    function docRow(d) {
      var meta = short(d.added) + (d.file ? ' · ' + esc(d.file.name) + ' (' + fmtSize(d.file.size) + ')' : '');
      var tcls = d.type === 'PRD' ? ' prd' : d.type === 'Update' ? ' upd' : '';
      var url = safeUrl(d.url);
      return '<div class="doc"><span class="type' + tcls + '">' + esc(d.type) + '</span>' +
        '<div class="info"><b>' + esc(d.title) + '</b><span>' + meta + '</span></div>' +
        (d.file ? '<button class="icon-btn" data-act="doc-down" data-id="' + d.id + '" aria-label="Unduh ' + esc(d.title) + '">' + ICON.down + '</button>' : '') +
        (url ? '<a class="icon-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Buka tautan ' + esc(d.title) + '">' + ICON.link + '</a>' : '') +
        '<button class="icon-btn" data-act="doc-del" data-id="' + d.id + '" aria-label="Hapus dokumen ' + esc(d.title) + '">' + ICON.x + '</button></div>';
    }
    var out = '';
    S.projects.forEach(function (p) {
      if (S.docFilter !== 'all' && S.docFilter !== p.id) return;
      var ds = docsOf(p.id);
      var prd = ds.filter(function (d) { return d.type === 'PRD'; }).length;
      var upd = ds.filter(function (d) { return d.type === 'Update'; }).length;
      out += '<div class="group"><div class="group-head"><h3>' + esc(p.name) + '</h3><span>' + prd + ' PRD · ' + upd + ' update</span></div>' +
        (ds.length ? ds.map(docRow).join('') : '<div class="empty">Belum ada dokumen untuk proyek ini.</div>') +
        (ds.length && !prd ? '<div class="note">PRD belum diunggah.</div>' : '') + '</div>';
    });
    if (S.docFilter === 'all' || S.docFilter === '_umum') {
      var gen = docsOf('');
      if (gen.length || S.docFilter === '_umum') {
        out += '<div class="group"><div class="group-head"><h3>Umum</h3><span>' + gen.length + ' berkas</span></div>' +
          (gen.length ? gen.map(docRow).join('') : '<div class="empty">Belum ada dokumen umum.</div>') + '</div>';
      }
    }
    $('#doc-groups').innerHTML = out || '<div class="empty-box">Belum ada dokumen. Tambahkan PRD atau update lewat formulir di samping.</div>';
  }

  function renderAll() {
    renderTheme(); renderHead(); renderReminders(); renderProjects(); renderCalendar(); renderTeam(); renderDocs();
  }

  /* ---------- actions ---------- */
  function setView(date) {
    var d = parse(date);
    S.selected = date; S.viewY = d.getFullYear(); S.viewM = d.getMonth();
  }
  function findProject(id) { return S.projects.filter(function (p) { return p.id === id; })[0]; }
  function patchProject(id, patch) {
    S.projects = S.projects.map(function (p) { return p.id === id ? Object.assign({}, p, patch) : p; });
    renderAll();
    run(sb.from('projects').update(patch).eq('id', id));
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !S.user && t.getAttribute('data-act') !== 'logout') return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id'), date = t.getAttribute('data-date');
    switch (act) {
      case 'logout': sb.auth.signOut(); break;
      case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; renderTheme(); saveSettings(); break;
      case 'lead': S.lead = Number(t.getAttribute('data-v')); renderAll(); saveSettings(); break;
      case 'projform':
        var f = $('#form-project'); f.hidden = !f.hidden;
        $('#btn-projform').setAttribute('aria-expanded', String(!f.hidden));
        if (!f.hidden) $('#p-name').focus();
        break;
      case 'proj-del':
        S.projects = S.projects.filter(function (p) { return p.id !== id; });
        S.docs = S.docs.map(function (d) { return d.projectId === id ? Object.assign({}, d, { projectId: '' }) : d; });
        S.team = S.team.map(function (m) { return Object.assign({}, m, { projectIds: m.projectIds.filter(function (x) { return x !== id; }) }); });
        if (S.docFilter === id) S.docFilter = 'all';
        renderAll();
        run(sb.from('projects').delete().eq('id', id));
        break;
      case 'proj-status':
        var p0 = findProject(id);
        if (p0) patchProject(id, { status: STATUSES[(STATUSES.indexOf(p0.status) + 1) % STATUSES.length] });
        break;
      case 'proj-inc': var p1 = findProject(id); if (p1) patchProject(id, { progress: Math.min(100, p1.progress + 10) }); break;
      case 'proj-dec': var p2 = findProject(id); if (p2) patchProject(id, { progress: Math.max(0, p2.progress - 10) }); break;
      case 'prev': S.viewM -= 1; if (S.viewM < 0) { S.viewM = 11; S.viewY -= 1; } renderCalendar(); break;
      case 'next': S.viewM += 1; if (S.viewM > 11) { S.viewM = 0; S.viewY += 1; } renderCalendar(); break;
      case 'pick': S.selected = date; renderCalendar(); break;
      case 'jump': setView(date); renderCalendar(); $('#kalender').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'pin-del':
        S.pins = S.pins.filter(function (k) { return k.id !== id; });
        renderAll();
        run(sb.from('pins').delete().eq('id', id));
        break;
      case 'member-del':
        S.team = S.team.filter(function (m) { return m.id !== id; });
        renderAll();
        run(sb.from('team_members').delete().eq('id', id));
        break;
      case 'member-open': S.openMember = S.openMember === id ? '' : id; renderTeam(); break;
      case 'filter': S.docFilter = id; renderDocs(); break;
      case 'doc-del':
        var doc = S.docs.filter(function (d) { return d.id === id; })[0];
        S.docs = S.docs.filter(function (d) { return d.id !== id; });
        renderAll();
        run(sb.from('documents').delete().eq('id', id)).then(function () {
          if (doc && doc.file) sb.storage.from(BUCKET).remove([doc.file.path]).catch(function () {});
        });
        break;
      case 'doc-down':
        var dd = S.docs.filter(function (d) { return d.id === id; })[0];
        if (!dd || !dd.file) break;
        sb.storage.from(BUCKET).download(dd.file.path).then(function (r) {
          if (r.error || !r.data) throw (r.error || new Error('kosong'));
          var u = URL.createObjectURL(r.data), a = document.createElement('a');
          a.href = u; a.download = dd.file.name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
        }).catch(function (err) { msg('Gagal membuka file: ' + errText(err)); });
        break;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-act') === 'assign') {
      var mid = t.getAttribute('data-id'), pid = t.getAttribute('data-pid'), on = t.checked;
      S.team = S.team.map(function (m) {
        if (m.id !== mid) return m;
        var ids = m.projectIds.filter(function (x) { return x !== pid; });
        if (on) ids.push(pid);
        return Object.assign({}, m, { projectIds: ids });
      });
      renderHead(); renderProjects(); renderTeam();
      run(on
        ? sb.from('project_members').insert({ project_id: pid, member_id: mid })
        : sb.from('project_members').delete().eq('project_id', pid).eq('member_id', mid));
    }
    if (t.id === 'd-file' && t.files && t.files[0] && t.files[0].size > MAX_FILE) {
      t.value = ''; msg('File terlalu besar (maks. 20 MB).');
    }
  });

  $('#form-project').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#p-name').value.trim(), due = $('#p-due').value;
    if (!name || !due) return;
    var p = { id: uuid(), name: name, due: due, progress: 0, status: 'Perencanaan', tone: S.projects.length % 4 };
    S.projects.push(p);
    $('#p-name').value = '';
    this.hidden = true; $('#btn-projform').setAttribute('aria-expanded', 'false');
    renderAll();
    run(sb.from('projects').insert(p));
  });

  $('#form-pin').addEventListener('submit', function (e) {
    e.preventDefault();
    var label = $('#pin-label').value.trim();
    if (!label) return;
    var pin = { id: uuid(), date: S.selected, label: label };
    S.pins.push(pin);
    $('#pin-label').value = '';
    renderAll();
    run(sb.from('pins').insert(pin));
  });

  $('#form-member').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#t-name').value.trim();
    if (!name) return;
    var m = { id: uuid(), name: name, role: $('#t-role').value.trim(), projectIds: [] };
    S.team.push(m);
    S.openMember = S.projects.length ? m.id : '';
    $('#t-name').value = ''; $('#t-role').value = '';
    renderAll();
    run(sb.from('team_members').insert({ id: m.id, name: m.name, role: m.role }));
  });

  $('#form-doc').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this, fileEl = $('#d-file'), file = fileEl.files && fileEl.files[0];
    var title = $('#d-title').value.trim() || (file ? file.name : '');
    if (!title) { msg('Isi judul atau pilih file dulu.'); return; }
    var url = $('#d-url').value.trim();
    if (url && !/^https?:\/\//i.test(url)) { msg('Tautan harus diawali http:// atau https://'); return; }
    var id = uuid();
    var doc = { id: id, title: title, type: $('#d-type').value, projectId: $('#d-proj').value, url: url, file: null, added: todayKey };
    var row = { id: id, title: title, type: doc.type, project_id: doc.projectId || null, url: url };
    var btn = form.querySelector('button[type=submit]');

    function finish() {
      S.docs.unshift(doc); S.docFilter = 'all';
      form.reset(); renderAll(); msg('Tersimpan.');
      return run(sb.from('documents').insert(row));
    }
    if (!file) { finish(); return; }

    var path = S.user.id + '/' + id + '-' + safeName(file.name);
    btn.disabled = true; msg('Mengunggah…');
    sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      .then(function (r) {
        if (r.error) throw r.error;
        doc.file = { name: file.name, size: file.size, path: path };
        row.file_path = path; row.file_name = file.name; row.file_size = file.size;
        return finish();
      })
      .catch(function (err) { msg('Gagal mengunggah: ' + errText(err)); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- auth ---------- */
  function showLogin(text) {
    $('#app-main').hidden = true;
    $('#login').hidden = false;
    $('#login-msg').textContent = text || '';
    $('#l-btn').disabled = false;
  }
  function showApp() {
    $('#login').hidden = true;
    $('#app-main').hidden = false;
  }
  function clearData() {
    S.projects = []; S.pins = []; S.docs = []; S.team = [];
    S.openMember = ''; S.docFilter = 'all'; S.user = null;
  }
  function start(user) {
    S.user = user;
    $('#login-msg').textContent = 'Memuat data…';
    loadAll().then(function () {
      showApp();
      $('#form-login').reset();
    }).catch(function (e) {
      toast('Gagal memuat data: ' + errText(e));
      showLogin('Gagal memuat data: ' + errText(e));
    });
  }

  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!sb) return;
    var email = $('#l-email').value.trim(), pass = $('#l-pass').value;
    if (!email || !pass) { $('#login-msg').textContent = 'Isi email dan password.'; return; }
    $('#l-btn').disabled = true;
    $('#login-msg').textContent = 'Masuk…';
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      if (r.error) {
        var bad = /invalid|credentials/i.test(r.error.message || '');
        showLogin(bad ? 'Email atau password salah.' : 'Gagal masuk: ' + errText(r.error));
        return;
      }
      start(r.data.user);
    }).catch(function (err) { showLogin('Gagal masuk: ' + errText(err)); });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.user && sb) loadAll().catch(function () {});
  });

  /* ---------- boot ---------- */
  renderTheme();
  var due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  $('#p-due').value = key(due);

  if (!sb) {
    showLogin('Konfigurasi Supabase belum terisi di config.js.');
  } else {
    showLogin('');
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') { clearData(); renderAll(); showLogin('Kamu sudah keluar.'); }
    });
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) start(r.data.session.user);
    });
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
