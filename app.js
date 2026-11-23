"use strict";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
let me;
let designs = [];
let fonts = [];
let rows = [{ n: '', c: '', s: '', sc: '', q: 10, d: -1 }];
let ownerMap = {};
let img = null;
const PRODUCTS = { name_sticker: 'Name Stickers', cover: 'Cover Pages', shapes: 'Shapes Print' };
let mode = 'name_sticker';
const BASE = [
    ['Iskoola Pota', 'unicode'], ['Noto Sans Sinhala', 'unicode'], ['Arial', 'english'],
    ['Georgia', 'english'], ['Times New Roman', 'english'], ['Comic Sans MS', 'english'],
];
async function login() {
    const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
    if (error) {
        $('lerr').textContent = error.message;
        return;
    }
    init();
}
async function init() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user)
        return;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    me = data;
    if (error || !me || !me.active) {
        await sb.auth.signOut();
        $('lerr').textContent = error
            ? `Profile error: ${error.message} (user ${user.id})`
            : 'Account not active. Contact admin.';
        return;
    }
    $('login').classList.add('hide');
    $('app').classList.remove('hide');
    const allowed = me.role === 'admin' ? Object.keys(PRODUCTS) : (me.products?.length ? me.products : ['name_sticker']);
    const tabs = [...allowed.map(p => [p, PRODUCTS[p]]),
        ['dsn', 'Designs'], ...(me.role === 'admin' ? [['fnt', 'Fonts'], ['usr', 'Users']] : [])];
    $('dp').innerHTML = allowed.filter(p => p !== 'shapes').map(p => `<option value="${p}">${PRODUCTS[p]}</option>`).join('');
    if (me.role !== 'admin')
        $('dvl').classList.add('hide');
    $('nav').innerHTML = tabs.map(t => `<button id="t-${t[0]}" onclick="tab('${t[0]}')">${t[1]}</button>`).join('') +
        `<span style="margin-left:auto">${me.shop || me.email}</span><button onclick="sb.auth.signOut().then(()=>location.reload())">Logout</button>`;
    await loadAll();
    tab(allowed[0]);
}
async function loadAll() {
    designs = (await sb.from('designs').select('*').eq('active', true).order('id')).data || [];
    fonts = (await sb.from('fonts').select('*').order('name')).data || [];
    if (me.role === 'admin') {
        const pr = (await sb.from('profiles').select('id,email,shop')).data || [];
        ownerMap = Object.fromEntries(pr.map((p) => [p.id, p.shop || p.email]));
    }
    await Promise.all(fonts.map(async (f) => {
        try {
            const ff = new FontFace(f.name, `url(${f.url})`);
            await ff.load();
            document.fonts.add(ff);
        }
        catch { /* skip bad font */ }
    }));
    const all = [...BASE, ...fonts.map(f => [f.name, f.kind])];
    document.querySelectorAll('.fs').forEach(s => {
        const v = s.value;
        s.innerHTML = all.map(f => `<option value="${f[0]}">${f[0]} (${f[1]})</option>`).join('');
        if (v)
            s.value = v;
    });
    fillFilters();
    fillDesigns();
    renderRows();
    renderLists();
    renderShapes();
}
function tab(t) {
    const view = t === 'shapes' ? 'shp' : t in PRODUCTS ? 'des' : t;
    ['des', 'dsn', 'fnt', 'usr', 'shp'].forEach(x => $('v-' + x).classList.toggle('hide', x !== view));
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.id === 't-' + t));
    if (t === 'name_sticker' || t === 'cover')
        setMode(t);
    if (t === 'usr')
        loadUsers();
}
/* ---------- rows ---------- */
function renderRows() {
    const f1 = $('f1').value || 'Iskoola Pota', f2 = $('f2').value;
    const keys = ['n', 'c', 's', 'sc'];
    $('rows').innerHTML = heads() +
        rows.map((r, i) => '<tr>' + keys.map((k, j) => `<td><input value="${String(r[k]).replace(/"/g, '&quot;')}" style="font-family:'${j ? f2 : f1}'" oninput="rows[${i}].${k}=this.value">`).join('') +
            `<td><select onchange="rows[${i}].d=+this.value">${dOpts(r.d)}</select><td style="width:70px"><input type="number" value="${r.q}" oninput="rows[${i}].q=+this.value"><td><button onclick="rows.splice(${i},1);renderRows()">✕</button></tr>`).join('');
}
function addRow() {
    const l = rows[rows.length - 1] || {};
    rows.push({ n: '', c: l.c || '', s: l.s || '', sc: l.sc || '', q: 10, d: l.d ?? -1 });
    renderRows();
}
['f1', 'f2'].forEach(i => $(i).onchange = renderRows);
/* ---------- rendering ---------- */
function sticker(c, lines, w, h, fa, fb, sa, sb2) {
    const cfg = c || {};
    const el = document.createElement('div');
    el.className = 'stk';
    el.style.cssText = `width:${w}mm;height:${h}mm;background:linear-gradient(135deg,${cfg.b1 || '#fff'},${cfg.b2 || '#fff'});` +
        `border:${cfg.bw ?? 0.4}mm ${cfg.bs || 'solid'} ${cfg.bc || '#000'};border-radius:${cfg.br || 0}mm;padding:0 ${w * .05}mm`;
    const t = document.createElement('div');
    t.className = 't';
    if (cfg.img)
        t.style[cfg.is === 'left' ? 'paddingLeft' : 'paddingRight'] = (h * (cfg.iz || 70) / 100 * 0.9) + 'mm';
    t.style.textAlign = cfg.al || 'left';
    lines.forEach((x, i) => {
        const d = document.createElement('div');
        d.className = 'ln';
        d.textContent = x;
        d.style.fontFamily = `'${i ? fb : fa}'`;
        d.style.fontSize = (i ? sb2 : sa) + 'pt';
        d.style.fontWeight = i ? '400' : '700';
        t.appendChild(d);
    });
    el.appendChild(t);
    if (cfg.img) {
        const im = document.createElement('img');
        im.src = cfg.img;
        im.style.height = (cfg.iz || 70) + '%';
        im.style[cfg.is === 'left' ? 'left' : 'right'] = '3%';
        el.appendChild(im);
    }
    return el;
}
function fit(root) {
    root.querySelectorAll('.ln').forEach(d => {
        let s = parseFloat(d.style.fontSize);
        while (d.scrollWidth > d.clientWidth + 1 && s > 5) {
            s -= .5;
            d.style.fontSize = s + 'pt';
        }
    });
}
function gen() {
    const [pw, ph] = paperSize('paper', 'ori');
    const m = +$('mg').value, g = +$('gp').value, fp = $('fp').checked;
    const w = fp ? pw - 2 * m : +$('sw').value, h = fp ? ph - 2 * m : +$('sh').value;
    const cols = Math.floor((pw - 2 * m + g) / (w + g)), rw = Math.floor((ph - 2 * m + g) / (h + g));
    if (cols < 1 || rw < 1) {
        alert('Sticker bigger than paper');
        return;
    }
    const per = cols * rw, items = [];
    rows.forEach(r => {
        const L = [r.n, r.c, r.s, r.sc].filter(x => x.trim());
        if (L.length)
            for (let i = 0; i < (r.q || 1); i++)
                items.push({ L, d: r.d });
    });
    const ox = (pw - (cols * w + (cols - 1) * g)) / 2, oy = (ph - (rw * h + (rw - 1) * g)) / 2;
    let st = document.getElementById('pgst');
    if (!st) {
        st = document.createElement('style');
        st.id = 'pgst';
        document.head.appendChild(st);
    }
    st.textContent = `@page{size:${pw}mm ${ph}mm;margin:0}`;
    const box = $('pages');
    box.innerHTML = '';
    let pg;
    items.forEach(({ L, d }, i) => {
        if (i % per === 0) {
            pg = document.createElement('div');
            pg.className = 'page';
            pg.style.cssText = `width:${pw}mm;height:${ph}mm`;
            box.appendChild(pg);
        }
        const k = i % per;
        const s = sticker(designs.find(x => x.id === d)?.config, L, w, h, $('f1').value, $('f2').value, +$('s1').value, +$('s2').value);
        s.style.left = (ox + (k % cols) * (w + g)) + 'mm';
        s.style.top = (oy + Math.floor(k / cols) * (h + g)) + 'mm';
        pg.appendChild(s);
    });
    fit(box);
    $('info').textContent = `${items.length} stickers · ${cols}×${rw} per page · ${box.children.length} page(s)`;
}
/* ---------- designs (admin) ---------- */
$('im').onchange = (e) => {
    const f = e.target.files?.[0];
    if (!f)
        return;
    const r = new FileReader();
    r.onload = () => {
        const i = new Image();
        i.onload = () => {
            const k = Math.min(1, 500 / Math.max(i.width, i.height));
            const c = document.createElement('canvas');
            c.width = i.width * k;
            c.height = i.height * k;
            c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
            img = c.toDataURL('image/png');
            prevD();
        };
        i.src = r.result;
    };
    r.readAsDataURL(f);
};
const dcfg = () => ({
    b1: $('b1').value, b2: $('b2').value, bc: $('bc').value, bw: +$('bw').value, bs: $('bs').value,
    br: +$('br').value, al: $('al').value, is: $('is').value, iz: +$('iz').value, img,
});
function prevD() {
    const p = $('dprev');
    p.innerHTML = '';
    const s = sticker(dcfg(), ['සේභා විජයසිංහ', '6 ශ්‍රේණිය A', 'සිංහල', 'හේනේගම මධ්‍ය මහා විද්‍යාලය'], 90, 45, 'Iskoola Pota', 'Iskoola Pota', 16, 11);
    s.style.position = 'relative';
    p.appendChild(s);
    fit(p);
}
async function saveD() {
    if (!$('dn').value) {
        alert('Name?');
        return;
    }
    const row = { name: $('dn').value, config: dcfg(), product: $('dp').value };
    if (me.role === 'admin')
        row.is_public = $('dv').value === '1';
    const { error } = editId !== null
        ? await sb.from('designs').update(row).eq('id', editId)
        : await sb.from('designs').insert({ ...row, is_public: me.role === 'admin' && $('dv').value === '1' });
    if (error) {
        alert(error.message);
        return;
    }
    resetD();
    await loadAll();
}
function renderLists() {
    $('dlist').innerHTML = designs.filter(listMatch).map(d => {
        const own = d.owner === me.id, adm = me.role === 'admin';
        return `<div style="padding:3px 0">${d.name} <small>(${PRODUCTS[d.product || 'name_sticker'] || d.product} · ${d.is_public ? 'Public' : 'Personal'}${adm ? ' · ' + (ownerMap[d.owner || ''] || '—') : ''})</small> ` +
            (adm ? `<button onclick="togPub(${d.id},${!d.is_public})">${d.is_public ? 'Make personal' : 'Make public'}</button> ` : '') +
            (adm || (own && !d.is_public) ? `<button onclick="editD(${d.id})">Edit</button> ` : '') +
            (adm || own ? `<button onclick="delD(${d.id})">Delete</button>` : '') + '</div>';
    }).join('') || 'None';
    if (me.role === 'admin')
        $('flist').innerHTML = fonts.map(f => `<div style="font-family:'${f.name}';font-size:18px">${f.name} <small>(${f.kind})</small> <button onclick="delF(${f.id})">Delete</button></div>`).join('');
}
async function delD(id) { await sb.from('designs').update({ active: false }).eq('id', id); loadAll(); }
async function delF(id) { await sb.from('fonts').delete().eq('id', id); loadAll(); }
async function saveF() {
    const f = $('ff').files?.[0], n = $('fn').value;
    if (!f || !n) {
        alert('Name and file needed');
        return;
    }
    const path = Date.now() + '_' + f.name.replace(/[^\w.]/g, '_');
    const u = await sb.storage.from('fonts').upload(path, f);
    if (u.error) {
        alert(u.error.message);
        return;
    }
    const url = sb.storage.from('fonts').getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from('fonts').insert({ name: n, kind: $('fk').value, url });
    if (error) {
        alert(error.message);
        return;
    }
    loadAll();
}
/* ---------- users (admin) ---------- */
async function loadUsers() {
    const { data } = await sb.from('profiles').select('*').order('email');
    $('ulist').innerHTML = '<tr><th>Email<th>Shop<th>Role<th>Active<th>Products</tr>' + data.map(u => `<tr><td>${u.email}<td>${u.shop || ''}
    <td><select onchange="upU('${u.id}',{role:this.value})"><option ${u.role === 'user' ? 'selected' : ''}>user</option><option ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>
    <td><input type="checkbox" style="width:auto" ${u.active ? 'checked' : ''} onchange="upU('${u.id}',{active:this.checked})"><td data-id="${u.id}">${Object.keys(PRODUCTS).map(k => `<label style="flex-direction:row;display:inline-flex;gap:2px"><input type="checkbox" class="pc" value="${k}" style="width:auto" ${(u.products || []).includes(k) ? 'checked' : ''} onchange="saveP(this)">${PRODUCTS[k]}</label>`).join(' ')}</tr>`).join('');
}
async function upU(id, o) {
    const { error } = await sb.from('profiles').update(o).eq('id', id);
    if (error)
        alert(error.message);
}
// Uses the create-user Edge Function (service role stays on the server)
async function mkUser() {
    const { data, error } = await sb.functions.invoke('create-user', {
        body: { email: $('ue').value, password: $('up').value, shop: $('us').value, role: $('ur').value },
    });
    if (error || data?.error) {
        $('umsg').textContent = data?.error || error.message;
        return;
    }
    const products = Array.from(document.querySelectorAll('.cp:checked')).map(c => c.value);
    await sb.from('profiles').update({ products }).eq('id', data.id);
    $('umsg').textContent = 'Created ✓';
    loadUsers();
}
sb.auth.getSession().then((r) => r.data.session && init());
/* ================= multi-product additions ================= */
function heads() {
    const H = mode === 'cover' ? ['Title / Subject', 'Name', 'Class', 'School'] : ['Name', 'Line 2 (class)', 'Line 3 (subject)', 'Line 4 (school)'];
    return '<tr>' + H.map(x => '<th>' + x).join('') + '<th>Design<th>Copies<th></tr>';
}
function curDesigns() {
    const f = document.getElementById('dfl')?.value || '';
    return designs.filter(d => (d.product || 'name_sticker') === mode && dMatch(d, f));
}
function fillDesigns() {
    $('dsel').innerHTML = '<option value="-1">Plain border</option>' +
        curDesigns().map(d => `<option value="${d.id}">${dlabel(d)}</option>`).join('');
}
function setMode(m) {
    mode = m;
    const cv = m === 'cover';
    $('fp').checked = cv;
    $('s1').value = cv ? '36' : '20';
    $('s2').value = cv ? '22' : '14';
    rows.forEach(r => { r.d = -1; if (r.q === (cv ? 10 : 1))
        r.q = cv ? 1 : 10; });
    fillDesigns();
    renderRows();
    $('pages').innerHTML = '';
    $('info').textContent = '';
}
function paperSize(sel, ori) {
    const v = $(sel).value;
    const [a, b] = v === 'c' ? (prompt('Width,Height mm', '210,297') || '210,297').split(',').map(Number) : v.split(',').map(Number);
    return $(ori).value === 'Landscape' ? [b, a] : [a, b];
}
async function saveP(el) {
    const td = el.closest('td');
    const products = Array.from(td.querySelectorAll('.pc:checked')).map(c => c.value);
    await upU(td.dataset.id, { products });
}
let shapeRows = [{ sh: 'rect', w: 50, h: 30, q: 10, fill: '#ffffff', stroke: '#000000', text: '' }];
const SH = {
    rect: ['Rectangle', '<rect x="1" y="1" width="98" height="98"/>'],
    round: ['Rounded rectangle', '<rect x="1" y="1" width="98" height="98" rx="16"/>'],
    ellipse: ['Circle / Ellipse', '<ellipse cx="50" cy="50" rx="49" ry="49"/>'],
    tri: ['Triangle', '<polygon points="50,2 98,98 2,98"/>'],
    dia: ['Diamond', '<polygon points="50,2 98,50 50,98 2,50"/>'],
    hex: ['Hexagon', '<polygon points="25,3 75,3 98,50 75,97 25,97 2,50"/>'],
    star: ['Star', '<polygon points="50,3 61,38 98,38 68,60 79,96 50,74 21,96 32,60 2,38 39,38"/>'],
    heart: ['Heart', '<path d="M50 92C10 62 2 36 20 18C35 5 50 18 50 30C50 18 65 5 80 18C98 36 90 62 50 92Z"/>'],
};
function renderShapes() {
    const opt = (k) => Object.keys(SH).map(x => `<option value="${x}" ${x === k ? 'selected' : ''}>${SH[x][0]}</option>`).join('');
    const ff = $('sf').value || 'Iskoola Pota';
    $('srows').innerHTML = '<tr><th>Shape<th>W mm<th>H mm<th>Qty<th>Fill<th>Border<th>Text<th></tr>' + shapeRows.map((r, i) => `<tr><td><select onchange="shapeRows[${i}].sh=this.value">${opt(r.sh)}</select>
    <td style="width:70px"><input type="number" value="${r.w}" oninput="shapeRows[${i}].w=+this.value">
    <td style="width:70px"><input type="number" value="${r.h}" oninput="shapeRows[${i}].h=+this.value">
    <td style="width:70px"><input type="number" value="${r.q}" oninput="shapeRows[${i}].q=+this.value">
    <td style="width:50px"><input type="color" value="${r.fill}" oninput="shapeRows[${i}].fill=this.value">
    <td style="width:50px"><input type="color" value="${r.stroke}" oninput="shapeRows[${i}].stroke=this.value">
    <td><input value="${r.text.replace(/"/g, '&quot;')}" style="font-family:'${ff}'" oninput="shapeRows[${i}].text=this.value">
    <td><button onclick="shapeRows.splice(${i},1);renderShapes()">✕</button></tr>`).join('');
}
$('sf').onchange = renderShapes;
function addShape() { shapeRows.push({ ...shapeRows[shapeRows.length - 1] || { sh: 'rect', w: 50, h: 30, q: 10, fill: '#ffffff', stroke: '#000000', text: '' } }); renderShapes(); }
function shapeEl(r, ff, pt) {
    const el = document.createElement('div');
    el.className = 'stk shp';
    el.style.cssText = `width:${r.w}mm;height:${r.h}mm;overflow:visible`;
    el.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" fill="${r.fill}" stroke="${r.stroke}" stroke-width="1.5">${SH[r.sh][1]}</svg>`;
    if (r.text.trim()) {
        const w = document.createElement('div');
        w.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
        const t = document.createElement('div');
        t.className = 'ln';
        t.textContent = r.text;
        t.style.cssText += `width:76%;text-align:center;font-family:'${ff}';font-size:${pt}pt`;
        w.appendChild(t);
        el.appendChild(w);
    }
    return el;
}
function genShapes() {
    const [pw, ph] = paperSize('spaper', 'sori');
    const m = +$('smg').value, g = +$('sgp').value, ff = $('sf').value, pt = +$('sfs').value;
    const items = [];
    shapeRows.forEach(r => { for (let i = 0; i < (r.q || 0); i++)
        items.push(r); });
    items.sort((a, b) => b.h - a.h || b.w - a.w);
    let st = document.getElementById('pgst');
    if (!st) {
        st = document.createElement('style');
        st.id = 'pgst';
        document.head.appendChild(st);
    }
    st.textContent = `@page{size:${pw}mm ${ph}mm;margin:0}`;
    const box = $('spages');
    box.innerHTML = '';
    const newPage = () => { const p = document.createElement('div'); p.className = 'page'; p.style.cssText = `width:${pw}mm;height:${ph}mm`; box.appendChild(p); return p; };
    let pg = newPage(), x = m, y = m, rowH = 0, tooBig = 0;
    items.forEach(r => {
        if (r.w > pw - 2 * m || r.h > ph - 2 * m)
            tooBig++;
        if (x + r.w > pw - m + 0.01 && x > m) {
            x = m;
            y += rowH + g;
            rowH = 0;
        }
        if (y + r.h > ph - m + 0.01 && y > m) {
            pg = newPage();
            x = m;
            y = m;
            rowH = 0;
        }
        const el = shapeEl(r, ff, pt);
        el.style.left = x + 'mm';
        el.style.top = y + 'mm';
        pg.appendChild(el);
        x += r.w + g;
        rowH = Math.max(rowH, r.h);
    });
    fit(box);
    $('sinfo').textContent = `${items.length} shapes · ${box.children.length} page(s)` + (tooBig ? ` · ${tooBig} larger than the page!` : '');
}
/* ---------- per-row designs & visibility ---------- */
function dlabel(d) { return d.name + (d.is_public === false ? ' (personal)' : ''); }
function dOpts(sel) {
    const list = curDesigns(), cur = designs.find(x => x.id === sel);
    if (cur && !list.includes(cur) && (cur.product || 'name_sticker') === mode)
        list.push(cur); // keep a hidden chosen design visible
    return '<option value="-1">Plain border</option>' +
        list.map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${dlabel(d)}</option>`).join('');
}
function applyAll() { rows.forEach(r => r.d = +$('dsel').value); renderRows(); }
async function togPub(id, pub) {
    const { error } = await sb.from('designs').update({ is_public: pub }).eq('id', id);
    if (error)
        alert(error.message);
    loadAll();
}
/* ---------- edit & filters ---------- */
let editId = null;
function dMatch(d, own) {
    if (!own)
        return true;
    if (own === 'pub')
        return !!d.is_public;
    if (own === 'mine')
        return d.owner === me.id;
    return d.owner === own;
}
function listMatch(d) {
    const q = $('fq').value.trim().toLowerCase(), p = $('fprod').value, v = $('fvis').value;
    return dMatch(d, $('fown').value) && (!p || (d.product || 'name_sticker') === p) &&
        (!v || String(+!!d.is_public) === v) && (!q || d.name.toLowerCase().includes(q));
}
function fillFilters() {
    const owners = me.role === 'admin' ? Object.entries(ownerMap).map(([id, n]) => `<option value="${id}">${n}</option>`).join('') : '';
    const base = '<option value="">All designs</option><option value="mine">My designs</option>';
    const set = (id, html) => {
        const e = $(id), v = e.value;
        e.innerHTML = html;
        e.value = v;
        if (!e.value)
            e.selectedIndex = 0;
    };
    set('fown', base + owners);
    set('dfl', base + '<option value="pub">Public only</option>' + owners);
}
function editD(id) {
    const d = designs.find(x => x.id === id);
    if (!d)
        return;
    const c = d.config;
    editId = id;
    img = c.img || null;
    $('dn').value = d.name;
    $('dp').value = d.product || 'name_sticker';
    $('dv').value = d.is_public ? '1' : '0';
    $('b1').value = c.b1 || '#ffffff';
    $('b2').value = c.b2 || '#ffffff';
    $('bc').value = c.bc || '#000000';
    $('bw').value = String(c.bw ?? 1);
    $('bs').value = c.bs || 'solid';
    $('br').value = String(c.br || 0);
    $('al').value = c.al || 'left';
    $('is').value = c.is || 'right';
    $('iz').value = String(c.iz || 70);
    $('savebtn').textContent = 'Update design';
    $('cancelbtn').classList.remove('hide');
    prevD();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetD() {
    editId = null;
    img = null;
    $('dn').value = '';
    $('im').value = '';
    $('savebtn').textContent = 'Save design';
    $('cancelbtn').classList.add('hide');
    $('dprev').innerHTML = '';
}
