const STORAGE_KEY = 'writerapp_books_v1';
const PALET_TOKOH = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
];

const $ = (id) => document.getElementById(id);

function muatBuku() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.map((b) => ({
      ...b,
      tokoh: Array.isArray(b.tokoh) ? b.tokoh : [],
      istilah: Array.isArray(b.istilah) ? b.istilah : [],
      bab: Array.isArray(b.bab)
        ? b.bab.map((bab) => ({
            ...bab,
            status: bab.status || 'Draft',
            outlines: Array.isArray(bab.outlines) ? bab.outlines : [],
            teksFinal: bab.teksFinal || ''
          }))
        : []
    }));
  } catch {
    return [];
  }
}

let daftarBuku = muatBuku();
let warnaSampul = '#1e3a5f';
let coverBase64 = '';
let idBukuAktif = null;
let idBabAktif = null;
let modeEditBuku = false;
let modeEditBab = false;
let konfirmasiHapus = false;
let warnaTokoh = '#ef4444';
let expandedTokohId = null;

// State Autocomplete & Fokus Editor Terakhir
let acMatches = [];
let acIndex = 0;
let acTargetInfo = null; // { el, outIdx, pIdx, prefixLen, mode }
let lastActiveEditor = null; // { el, outIdx, pIdx }

const simpan = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(daftarBuku));
const bukuAktif = () => daftarBuku.find((b) => b.id === idBukuAktif);
const babAktif = () => bukuAktif()?.bab.find((bab) => bab.id === idBabAktif);

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatKapital(teks) {
  return teks.trim().replace(/\s+/g, ' ').split(' ')
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(' ');
}

function stripItalicTags(teks) {
  return (teks || '').replace(/<\/?i>/gi, '');
}

function hitungKata(teks) {
  const bersih = stripItalicTags(teks).trim();
  return bersih ? bersih.split(/\s+/).length : 0;
}

function hitungKataOutline(outline) {
  return (outline.paragraf || []).reduce((acc, p) => acc + hitungKata(p), 0);
}

function hitungKataBab(bab) {
  return (bab.outlines || []).reduce((acc, out) => acc + hitungKataOutline(out), 0);
}

function tampilkanView(viewId) {
  ['view-rak', 'view-bab-list', 'view-editor-bab', 'view-preview-bab', 'view-final-bab'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== viewId);
  });
  tutupAutocomplete();
}

// ================= SERIALISASI ITALIC & WARNA TOKOH =================
// Ubah DOM contenteditable menjadi string teks dengan penanda <i>...</i>
function serializeEditor(el) {
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue.replace(/\r?\n/g, '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const inner = serializeEditor(node);
      const isItalic =
        node.tagName === 'I' ||
        node.tagName === 'EM' ||
        node.style.fontStyle === 'italic';
      if (isItalic && inner) {
        out += `<i>${inner}</i>`;
      } else {
        out += inner;
      }
    }
  });
  return out;
}

// Konversi *teks miring* menjadi <i>teks miring</i> jika diketik manual
function konversiBintangKeItalic(markup) {
  return markup.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function cekWarnaTokoh(hex, listTokoh) {
  const target = hex.toLowerCase();
  const { r, g, b } = hexToRgb(target);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 45) return { valid: false, pesan: 'Warna hitam atau terlalu gelap tidak diperbolehkan.' };
  if (lum > 225) return { valid: false, pesan: 'Warna putih atau terlalu terang tidak diperbolehkan.' };

  for (const t of listTokoh) {
    const w = t.warna.toLowerCase();
    if (w === target) return { valid: false, pesan: `Warna sudah dipakai tokoh "${t.nama}".` };
    const rgb2 = hexToRgb(w);
    if (Math.hypot(r - rgb2.r, g - rgb2.g, b - rgb2.b) < 26) {
      return { valid: false, pesan: `Warna terlalu mirip dengan tokoh "${t.nama}".` };
    }
  }
  return { valid: true, pesan: '' };
}

function warnaTersedia(listTokoh) {
  return PALET_TOKOH.find((hex) => cekWarnaTokoh(hex, listTokoh).valid) || '#38bdf8';
}

function setErrorTokoh(pesan = '') {
  const el = $('error-tokoh');
  if (!el) return;
  el.textContent = pesan;
  el.classList.toggle('hidden', !pesan);
}

function setErrorIstilah(pesan = '') {
  const el = $('error-istilah');
  if (!el) return;
  el.textContent = pesan;
  el.classList.toggle('hidden', !pesan);
}

// Kumpulkan tokoh & alias untuk pewarnaan dan kapital otomatis
function dapatkanEntitasTokoh(buku) {
  if (!buku || !Array.isArray(buku.tokoh)) return [];
  const items = [];
  buku.tokoh.forEach((t) => {
    items.push({ teks: t.nama, warna: t.warna, peran: 'Tokoh Utama' });
    (t.alias || []).forEach((a) => {
      items.push({ teks: a, warna: t.warna, peran: `Alias ${t.nama}` });
    });
  });
  return items.sort((a, b) => b.teks.length - a.teks.length);
}

// Terapkan kapitalisasi tokoh & konsistensi ejaan istilah di luar tag <i>
function formatTeksKonsisten(markup, buku) {
  if (!markup) return '';
  const entitasTokoh = dapatkanEntitasTokoh(buku);
  const daftarIstilah = (buku?.istilah || []).slice().sort((a, b) => b.kata.length - a.kata.length);

  return markup
    .split(/(<\/?i>)/gi)
    .map((bagian) => {
      if (bagian.toLowerCase() === '<i>' || bagian.toLowerCase() === '</i>') return bagian;
      let teks = bagian;

      entitasTokoh.forEach((ent) => {
        const regex = new RegExp(`(^|[^a-zA-Z0-9_])(${escapeRegExp(ent.teks)})(?=$|[^a-zA-Z0-9_])`, 'gi');
        teks = teks.replace(regex, (_, sebelum) => `${sebelum}${ent.teks}`);
      });

      daftarIstilah.forEach((ist) => {
        const regex = new RegExp(`(^|[^a-zA-Z0-9_])(${escapeRegExp(ist.kata)})(?=$|[^a-zA-Z0-9_])`, 'gi');
        teks = teks.replace(regex, (_, sebelum) => `${sebelum}${ist.kata}`);
      });

      return teks;
    })
    .join('');
}

// Render teks biasa menjadi HTML dengan warna tokoh
function renderSegmenBerwarna(teks, entitas) {
  if (!entitas.length || !teks) return escapeHTML(teks || '');

  const pola = entitas.map((e) => escapeRegExp(e.teks)).join('|');
  const regex = new RegExp(`(^|[^a-zA-Z0-9_])(${pola})(?=$|[^a-zA-Z0-9_])`, 'gi');

  let hasil = '';
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(teks)) !== null) {
    const awalMatch = match.index + match[1].length;
    hasil += escapeHTML(teks.slice(lastIdx, awalMatch));

    const kataCocok = match[2];
    const info = entitas.find((e) => e.teks.toLowerCase() === kataCocok.toLowerCase());
    if (info) {
      hasil += `<span class="tokoh-highlight" style="color: ${info.warna};">${escapeHTML(info.teks)}</span>`;
    } else {
      hasil += escapeHTML(kataCocok);
    }
    lastIdx = awalMatch + kataCocok.length;
  }

  hasil += escapeHTML(teks.slice(lastIdx));
  return hasil;
}

// Render markup lengkap (mendukung <i>...</i> + warna tokoh di dalam & luar italic)
function renderMarkupEditorHTML(markup, buku) {
  if (!markup) return '';
  const entitas = dapatkanEntitasTokoh(buku);
  return markup
    .split(/(<i>[\s\S]*?<\/i>)/gi)
    .map((part) => {
      if (/^<i>[\s\S]*<\/i>$/i.test(part)) {
        const isi = part.replace(/^<i>|<\/i>$/gi, '');
        return `<em>${renderSegmenBerwarna(isi, entitas)}</em>`;
      }
      return renderSegmenBerwarna(part, entitas);
    })
    .join('');
}

// Render paragraf final (tanpa warna tokoh, tetap mempertahankan italic <em>)
function renderMarkupFinalHTML(markup) {
  if (!markup) return '';
  return markup
    .split(/(<i>[\s\S]*?<\/i>)/gi)
    .map((part) => {
      if (/^<i>[\s\S]*<\/i>$/i.test(part)) {
        const isi = part.replace(/^<i>|<\/i>$/gi, '');
        return `<em>${escapeHTML(isi)}</em>`;
      }
      return escapeHTML(part);
    })
    .join('');
}

// Simpan & Pulihkan Posisi Kursor (Caret)
function getCaretOffset(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function setCaretOffset(el, offset) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  let charCount = 0;
  let found = false;

  function traverse(node) {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const nextCount = charCount + node.length;
      if (offset <= nextCount) {
        range.setStart(node, Math.max(0, offset - charCount));
        range.collapse(true);
        found = true;
      }
      charCount = nextCount;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
      }
    }
  }

  traverse(el);
  if (!found) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// ================= VIEW 1: RAK BUKU & DETAIL (TOKOH + ISTILAH) =================
function renderRakBuku() {
  $('jumlah-buku').textContent = `${daftarBuku.length} Buku`;
  const rak = $('rak-buku');
  rak.innerHTML = '';
  $('empty-state').classList.toggle('hidden', daftarBuku.length > 0);

  daftarBuku.forEach((buku) => {
    const statusCls = buku.status === 'On-Going' ? 'status-ongoing' : buku.status === 'Tamat' ? 'status-tamat' : '';
    const coverStyle = buku.cover ? `background-image: url('${buku.cover}');` : `background-color: ${buku.warna};`;
    const coverText = buku.cover ? '' : `<span class="card-cover-title">${escapeHTML(buku.judul)}</span>`;

    const card = document.createElement('div');
    card.className = 'buku-card';
    card.innerHTML = `
      <div class="card-cover" style="${coverStyle}">
        <span class="status-badge ${statusCls}">${escapeHTML(buku.status)}</span>
        ${coverText}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHTML(buku.judul)}</div>
        <div class="card-meta">${buku.tokoh.length} Tokoh &bull; ${buku.istilah.length} Istilah &bull; ${buku.bab.length} Bab</div>
        <div class="card-blurb">${buku.blurb ? escapeHTML(buku.blurb) : 'Belum ada sinopsis.'}</div>
      </div>
    `;
    card.addEventListener('click', () => bukaDetailBuku(buku.id));
    rak.appendChild(card);
  });
}

function renderPaletTokoh(buku) {
  const grid = $('palet-warna-tokoh');
  grid.innerHTML = '';
  PALET_TOKOH.forEach((hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch-btn';
    btn.style.backgroundColor = hex;

    const cek = cekWarnaTokoh(hex, buku.tokoh);
    if (!cek.valid) {
      btn.classList.add('used');
      btn.title = cek.pesan;
    } else {
      if (warnaTokoh.toLowerCase() === hex.toLowerCase()) btn.classList.add('active');
      btn.addEventListener('click', () => {
        warnaTokoh = hex;
        $('input-warna-tokoh-custom').value = hex;
        setErrorTokoh('');
        renderPaletTokoh(buku);
      });
    }
    grid.appendChild(btn);
  });
}

function renderDaftarTokoh(buku) {
  $('jumlah-tokoh').textContent = `${buku.tokoh.length} Tokoh`;
  const list = $('daftar-tokoh');
  list.innerHTML = '';

  if (buku.tokoh.length === 0) {
    list.innerHTML = `<div class="tokoh-empty-msg">Belum ada tokoh terdaftar. Tambahkan tokoh utama di atas beserta warna khasnya.</div>`;
    return;
  }

  buku.tokoh.forEach((tokoh) => {
    const item = document.createElement('div');
    item.className = `tokoh-item ${expandedTokohId === tokoh.id ? 'open' : ''}`;
    item.innerHTML = `
      <div class="tokoh-header">
        <div class="tokoh-header-left">
          <span class="tokoh-dot" style="background-color: ${tokoh.warna};"></span>
          <span class="tokoh-name" style="color: ${tokoh.warna};">${escapeHTML(tokoh.nama)}</span>
        </div>
        <div class="tokoh-header-right">
          <span class="alias-count-badge">${tokoh.alias.length} Alias</span>
          <span class="tokoh-chevron">&#9662;</span>
          <button type="button" class="btn-delete-tokoh" title="Hapus tokoh">&times;</button>
        </div>
      </div>
      <div class="tokoh-body">
        <div class="alias-list"></div>
        <form class="alias-add-form">
          <input type="text" placeholder="Tambah alias (misal: Kak ${escapeHTML(tokoh.nama)})..." autocomplete="off" required>
          <button type="submit" class="btn-add-alias">+ Alias</button>
        </form>
      </div>
    `;

    item.querySelector('.tokoh-header').addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-tokoh')) return;
      expandedTokohId = expandedTokohId === tokoh.id ? null : tokoh.id;
      renderDaftarTokoh(buku);
    });

    item.querySelector('.btn-delete-tokoh').addEventListener('click', () => {
      buku.tokoh = buku.tokoh.filter((t) => t.id !== tokoh.id);
      if (expandedTokohId === tokoh.id) expandedTokohId = null;
      simpan();
      renderRakBuku();
      warnaTokoh = warnaTersedia(buku.tokoh);
      $('input-warna-tokoh-custom').value = warnaTokoh;
      renderPaletTokoh(buku);
      renderDaftarTokoh(buku);
    });

    const aliasBox = item.querySelector('.alias-list');
    if (tokoh.alias.length === 0) {
      aliasBox.innerHTML = `<span class="alias-empty">Belum ada alias untuk ${escapeHTML(tokoh.nama)}.</span>`;
    } else {
      tokoh.alias.forEach((alias, idx) => {
        const chip = document.createElement('span');
        chip.className = 'alias-chip';
        chip.style.color = tokoh.warna;
        chip.innerHTML = `${escapeHTML(alias)} <button type="button" class="btn-remove-alias">&times;</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          tokoh.alias.splice(idx, 1);
          simpan();
          renderDaftarTokoh(buku);
        });
        aliasBox.appendChild(chip);
      });
    }

    item.querySelector('.alias-add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const aliasBaru = formatKapital(inp.value);
      if (!aliasBaru) return;

      const duplikat = buku.tokoh.some(
        (t) => t.nama.toLowerCase() === aliasBaru.toLowerCase() || t.alias.some((a) => a.toLowerCase() === aliasBaru.toLowerCase())
      );
      if (duplikat) return setErrorTokoh(`Nama atau alias "${aliasBaru}" sudah terdaftar.`);

      setErrorTokoh('');
      tokoh.alias.push(aliasBaru);
      simpan();
      renderDaftarTokoh(buku);
    });

    list.appendChild(item);
  });
}

function renderDaftarIstilah(buku) {
  $('jumlah-istilah').textContent = `${buku.istilah.length} Istilah`;
  const grid = $('daftar-istilah');
  grid.innerHTML = '';

  if (buku.istilah.length === 0) {
    grid.innerHTML = `<div class="tokoh-empty-msg">Belum ada istilah/efek bunyi. Contoh: <strong>Aarrkkhh</strong> (Teriakan), <strong>Duuaarrr</strong> (Ledakan), <strong>Tuiiingg</strong> (Benda jatuh).</div>`;
    return;
  }

  buku.istilah.forEach((ist, idx) => {
    const chip = document.createElement('div');
    chip.className = 'istilah-chip';
    chip.innerHTML = `
      <span class="istilah-chip-word">${escapeHTML(ist.kata)}</span>
      ${ist.keterangan ? `<span class="istilah-chip-ket">${escapeHTML(ist.keterangan)}</span>` : ''}
      <button type="button" class="btn-remove-alias" title="Hapus istilah">&times;</button>
    `;
    chip.querySelector('button').addEventListener('click', () => {
      buku.istilah.splice(idx, 1);
      simpan();
      renderRakBuku();
      renderDaftarIstilah(buku);
    });
    grid.appendChild(chip);
  });
}

function bukaFormBuku(editMode = false) {
  modeEditBuku = editMode;
  $('form-buku-baru').reset();

  if (editMode && bukuAktif()) {
    const buku = bukuAktif();
    $('modal-buku-judul').textContent = 'Edit Informasi Buku';
    $('btn-submit-buku').textContent = 'Simpan Perubahan';
    $('input-judul').value = buku.judul;
    $('input-status').value = buku.status;
    $('input-target').value = buku.targetKata;
    $('input-blurb').value = buku.blurb || '';

    warnaSampul = buku.warna || '#1e3a5f';
    document.querySelectorAll('.warna-opsi').forEach((b) => {
      b.classList.toggle('active', b.dataset.color === warnaSampul);
    });

    coverBase64 = buku.cover || '';
    if (coverBase64) {
      $('preview-cover-img').src = coverBase64;
      $('preview-cover-box').classList.remove('hidden');
    } else {
      $('preview-cover-box').classList.add('hidden');
    }
  } else {
    $('modal-buku-judul').textContent = 'Buat Buku Baru';
    $('btn-submit-buku').textContent = 'Simpan Buku';
    coverBase64 = '';
    $('preview-cover-box').classList.add('hidden');
    warnaSampul = '#1e3a5f';
    document.querySelectorAll('.warna-opsi').forEach((b, i) => b.classList.toggle('active', i === 0));
  }

  $('modal-buat-buku').classList.remove('hidden');
  $('input-judul').focus();
}

function bukaDetailBuku(id) {
  const buku = daftarBuku.find((b) => b.id === id);
  if (!buku) return;

  idBukuAktif = id;
  konfirmasiHapus = false;
  expandedTokohId = null;
  $('btn-hapus-buku').textContent = 'Hapus Buku';
  setErrorTokoh('');
  setErrorIstilah('');

  $('detail-judul').textContent = buku.judul;
  $('detail-status').textContent = buku.status;
  $('detail-target').textContent = `Target: ${Number(buku.targetKata).toLocaleString('id-ID')} kata / bab`;
  $('detail-blurb').textContent = buku.blurb || 'Belum ada sinopsis.';

  const coverEl = $('detail-cover-wrap');
  coverEl.style.backgroundImage = buku.cover ? `url('${buku.cover}')` : 'none';
  coverEl.style.backgroundColor = buku.cover ? 'transparent' : buku.warna;
  coverEl.textContent = buku.cover ? '' : buku.judul;

  warnaTokoh = warnaTersedia(buku.tokoh);
  $('input-warna-tokoh-custom').value = warnaTokoh;
  renderPaletTokoh(buku);
  renderDaftarTokoh(buku);
  renderDaftarIstilah(buku);
  $('modal-detail-buku').classList.remove('hidden');
}

// ================= VIEW 2: DAFTAR BAB =================
function bukaHalamanDaftarBab() {
  const buku = bukuAktif();
  if (!buku) return;

  $('modal-detail-buku').classList.add('hidden');
  $('bab-view-judul-buku').textContent = buku.judul;
  $('bab-total-info').textContent = `${buku.bab.length} Bab Tersimpan`;
  $('bab-tokoh-info').textContent = `${buku.tokoh.length} Tokoh • ${buku.istilah.length} Istilah`;

  const list = $('daftar-bab');
  list.innerHTML = '';
  $('bab-empty-state').classList.toggle('hidden', buku.bab.length > 0);

  buku.bab.forEach((bab, idx) => {
    const totalKata = bab.status === 'Selesai' ? hitungKata(bab.teksFinal) : hitungKataBab(bab);
    const statusCls = bab.status === 'Selesai' ? 'status-tamat' : 'status-ongoing';

    const card = document.createElement('div');
    card.className = 'bab-card';
    card.innerHTML = `
      <div class="bab-card-info">
        <div class="bab-card-title">${escapeHTML(bab.judul)}</div>
        <div class="bab-card-meta">${bab.outlines.length} Outline &bull; ${totalKata.toLocaleString('id-ID')} / ${Number(bab.targetKata).toLocaleString('id-ID')} Kata</div>
      </div>
      <div class="bab-card-right">
        <span class="status-badge ${statusCls}">${bab.status}</span>
        <button type="button" class="btn-delete-tokoh" title="Hapus bab">&times;</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-tokoh')) return;
      idBabAktif = bab.id;
      if (bab.status === 'Selesai') {
        bukaHasilFinalBab();
      } else {
        bukaEditorOutlineBab();
      }
    });

    card.querySelector('.btn-delete-tokoh').addEventListener('click', () => {
      if (confirm(`Hapus "${bab.judul}"?`)) {
        buku.bab.splice(idx, 1);
        simpan();
        renderRakBuku();
        bukaHalamanDaftarBab();
      }
    });

    list.appendChild(card);
  });

  tampilkanView('view-bab-list');
}

function bukaFormBab(editMode = false) {
  const buku = bukuAktif();
  if (!buku) return;
  modeEditBab = editMode;

  if (editMode && babAktif()) {
    const bab = babAktif();
    $('modal-bab-judul').textContent = 'Edit Judul & Target Bab';
    $('btn-submit-bab').textContent = 'Simpan Perubahan';
    $('input-judul-bab').value = bab.judul;
    $('input-target-bab').value = bab.targetKata;
  } else {
    $('modal-bab-judul').textContent = 'Buat Bab Baru';
    $('btn-submit-bab').textContent = 'Mulai Susun Outline →';
    $('input-judul-bab').value = `Bab ${buku.bab.length + 1}`;
    $('input-target-bab').value = buku.targetKata || 1000;
  }

  $('modal-bab-form').classList.remove('hidden');
  $('input-judul-bab').focus();
}

// ================= VIEW 3: EDITOR OUTLINE, ITALIC & AUTOCOMPLETE =================
function perbaruiProgresBab() {
  const bab = babAktif();
  if (!bab) return;

  const total = hitungKataBab(bab);
  const target = Number(bab.targetKata) || 1000;
  const tercapai = total >= target;

  const pill = $('editor-progress-pill');
  pill.textContent = `${total.toLocaleString('id-ID')} / ${target.toLocaleString('id-ID')} Kata`;
  pill.classList.toggle('tercapai', tercapai);

  $('btn-terapkan-bab').disabled = !tercapai;
  $('btn-terapkan-dari-preview').disabled = !tercapai;
}

function bukaEditorOutlineBab() {
  const bab = babAktif();
  if (!bab) return;

  $('editor-judul-bab').textContent = bab.judul;
  perbaruiProgresBab();
  renderDaftarOutline();
  tampilkanView('view-editor-bab');
}

function toggleItalicAktif() {
  if (!lastActiveEditor || !document.body.contains(lastActiveEditor.el)) return;
  const buku = bukuAktif();
  const bab = babAktif();
  const { el, outIdx, pIdx } = lastActiveEditor;

  el.focus();
  document.execCommand('italic', false, null);

  const markup = serializeEditor(el);
  if (bab && bab.outlines[outIdx]) {
    bab.outlines[outIdx].paragraf[pIdx] = markup;
    simpan();
  }
}

function sisipPemicuIstilah() {
  if (!lastActiveEditor || !document.body.contains(lastActiveEditor.el)) return;
  const { el, outIdx, pIdx } = lastActiveEditor;
  el.focus();
  document.execCommand('insertText', false, '/');
  periksaAutocomplete(el, outIdx, pIdx);
}

function renderDaftarOutline() {
  const buku = bukuAktif();
  const bab = babAktif();
  if (!buku || !bab) return;

  const container = $('daftar-outline');
  container.innerHTML = '';
  $('outline-empty-state').classList.toggle('hidden', bab.outlines.length > 0);

  bab.outlines.forEach((outline, outIdx) => {
    if (!Array.isArray(outline.paragraf) || outline.paragraf.length === 0) {
      outline.paragraf = [''];
    }

    const card = document.createElement('div');
    card.className = `outline-card ${outline.expanded !== false ? 'open' : ''}`;
    const kataOutline = hitungKataOutline(outline);

    card.innerHTML = `
      <div class="outline-header">
        <div class="outline-header-left">
          <span class="outline-num">#${outIdx + 1}</span>
          <input type="text" class="outline-title-input" value="${escapeHTML(outline.judul)}" placeholder="Judul poin outline...">
        </div>
        <div class="outline-header-right">
          <span class="outline-word-badge" id="out-words-${outIdx}">${kataOutline} kata</span>
          <button type="button" class="btn-move btn-out-up" title="Geser outline ke atas" ${outIdx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button type="button" class="btn-move btn-out-down" title="Geser outline ke bawah" ${outIdx === bab.outlines.length - 1 ? 'disabled' : ''}>&#9660;</button>
          <button type="button" class="btn-toggle-outline" title="Buka/Tutup">&#9662;</button>
          <button type="button" class="btn-delete-tokoh btn-del-out" title="Hapus outline">&times;</button>
        </div>
      </div>
      <div class="outline-body">
        <div class="paragraf-list"></div>
        <button type="button" class="btn-add-paragraf">+ Paragraf Baru</button>
      </div>
    `;

    card.querySelector('.outline-title-input').addEventListener('input', (e) => {
      outline.judul = e.target.value;
      simpan();
    });

    card.querySelector('.btn-toggle-outline').addEventListener('click', () => {
      outline.expanded = outline.expanded === false;
      card.classList.toggle('open', outline.expanded);
      simpan();
    });

    card.querySelector('.btn-out-up').addEventListener('click', () => {
      if (outIdx === 0) return;
      [bab.outlines[outIdx - 1], bab.outlines[outIdx]] = [bab.outlines[outIdx], bab.outlines[outIdx - 1]];
      simpan();
      renderDaftarOutline();
    });

    card.querySelector('.btn-out-down').addEventListener('click', () => {
      if (outIdx >= bab.outlines.length - 1) return;
      [bab.outlines[outIdx + 1], bab.outlines[outIdx]] = [bab.outlines[outIdx], bab.outlines[outIdx + 1]];
      simpan();
      renderDaftarOutline();
    });

    card.querySelector('.btn-del-out').addEventListener('click', () => {
      bab.outlines.splice(outIdx, 1);
      simpan();
      perbaruiProgresBab();
      renderDaftarOutline();
    });

    const pListEl = card.querySelector('.paragraf-list');
    outline.paragraf.forEach((markupParagraf, pIdx) => {
      const pItem = document.createElement('div');
      pItem.className = 'paragraf-item';
      pItem.innerHTML = `
        <div class="paragraf-controls">
          <button type="button" class="btn-p-move btn-p-up" title="Geser paragraf ke atas" ${pIdx === 0 ? 'disabled' : ''}>&#9650;</button>
          <button type="button" class="btn-p-move btn-p-down" title="Geser paragraf ke bawah" ${pIdx === outline.paragraf.length - 1 ? 'disabled' : ''}>&#9660;</button>
        </div>
        <div class="paragraf-editor" contenteditable="true" data-placeholder="Tulis paragraf di sini... (Enter = paragraf baru, Ctrl+I = miring, / = istilah)"></div>
      `;

      const editorEl = pItem.querySelector('.paragraf-editor');
      const diformatAwal = formatTeksKonsisten(markupParagraf, buku);
      outline.paragraf[pIdx] = diformatAwal;
      editorEl.innerHTML = renderMarkupEditorHTML(diformatAwal, buku);

      editorEl.addEventListener('focus', () => {
        lastActiveEditor = { el: editorEl, outIdx, pIdx };
      });

      pItem.querySelector('.btn-p-up').addEventListener('click', () => {
        if (pIdx === 0) return;
        [outline.paragraf[pIdx - 1], outline.paragraf[pIdx]] = [outline.paragraf[pIdx], outline.paragraf[pIdx - 1]];
        simpan();
        renderDaftarOutline();
      });

      pItem.querySelector('.btn-p-down').addEventListener('click', () => {
        if (pIdx >= outline.paragraf.length - 1) return;
        [outline.paragraf[pIdx + 1], outline.paragraf[pIdx]] = [outline.paragraf[pIdx], outline.paragraf[pIdx + 1]];
        simpan();
        renderDaftarOutline();
      });

      editorEl.addEventListener('input', (e) => {
        lastActiveEditor = { el: editorEl, outIdx, pIdx };
        let markup = serializeEditor(editorEl);
        outline.paragraf[pIdx] = markup;

        const butuhRenderUlang =
          (e.inputType === 'insertText' && e.data && /[\s.,!?;:"'()—\-*]/.test(e.data));

        if (butuhRenderUlang) {
          const offset = getCaretOffset(editorEl);
          const denganItalic = konversiBintangKeItalic(markup);
          const diformat = formatTeksKonsisten(denganItalic, buku);
          if (diformat !== markup) {
            outline.paragraf[pIdx] = diformat;
            editorEl.innerHTML = renderMarkupEditorHTML(diformat, buku);
            const koreksiOffset = denganItalic !== markup ? Math.max(0, offset - 2) : offset;
            setCaretOffset(editorEl, koreksiOffset);
          }
        }

        simpan();
        $(`out-words-${outIdx}`).textContent = `${hitungKataOutline(outline)} kata`;
        perbaruiProgresBab();
        periksaAutocomplete(editorEl, outIdx, pIdx);
      });

      editorEl.addEventListener('blur', () => {
        setTimeout(() => {
          const markup = serializeEditor(editorEl);
          const diformat = formatTeksKonsisten(konversiBintangKeItalic(markup), buku);
          outline.paragraf[pIdx] = diformat;
          editorEl.innerHTML = renderMarkupEditorHTML(diformat, buku);
          simpan();
          tutupAutocomplete();
        }, 170);
      });

      editorEl.addEventListener('keydown', (e) => {
        // Shortcut Ctrl+I untuk Italic
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          toggleItalicAktif();
          return;
        }

        // Navigasi popup autocomplete (Tokoh maupun Istilah)
        if (!$('autocomplete-popup').classList.contains('hidden')) {
          if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            terapkanPilihanAutocomplete(acIndex);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            acIndex = (acIndex + 1) % acMatches.length;
            renderPopupAutocomplete();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            acIndex = (acIndex - 1 + acMatches.length) % acMatches.length;
            renderPopupAutocomplete();
            return;
          }
          if (e.key === 'Escape') {
            tutupAutocomplete();
            return;
          }
        }

        // Enter 1x = Paragraf baru
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const teksPolos = editorEl.innerText.replace(/\r?\n/g, '');
          const pos = getCaretOffset(editorEl);
          const markupSekarang = serializeEditor(editorEl);

          // Jika di ujung paragraf, langsung buat paragraf kosong baru dengan cepat
          if (pos >= teksPolos.length) {
            outline.paragraf[pIdx] = formatTeksKonsisten(markupSekarang, buku);
            outline.paragraf.splice(pIdx + 1, 0, '');
          } else {
            const sebelum = formatTeksKonsisten(teksPolos.slice(0, pos).trimEnd(), buku);
            const sesudah = teksPolos.slice(pos).trimStart();
            outline.paragraf[pIdx] = sebelum;
            outline.paragraf.splice(pIdx + 1, 0, sesudah);
          }

          simpan();
          perbaruiProgresBab();
          renderDaftarOutline();

          const semuaEditor = document.querySelectorAll('.outline-card')[outIdx]?.querySelectorAll('.paragraf-editor');
          if (semuaEditor && semuaEditor[pIdx + 1]) {
            setCaretOffset(semuaEditor[pIdx + 1], 0);
          }
          return;
        }

        // Backspace di posisi 0 = Gabung dengan paragraf atasnya
        if (e.key === 'Backspace' && pIdx > 0 && getCaretOffset(editorEl) === 0) {
          e.preventDefault();
          const markupAtas = outline.paragraf[pIdx - 1];
          const teksPolosAtas = stripItalicTags(markupAtas);
          const markupBawah = serializeEditor(editorEl);
          const pemisah = teksPolosAtas && markupBawah && !teksPolosAtas.endsWith(' ') ? ' ' : '';
          const posisiGabung = teksPolosAtas.length + pemisah.length;

          outline.paragraf[pIdx - 1] = markupAtas + pemisah + markupBawah;
          outline.paragraf.splice(pIdx, 1);
          simpan();
          perbaruiProgresBab();
          renderDaftarOutline();

          const semuaEditor = document.querySelectorAll('.outline-card')[outIdx]?.querySelectorAll('.paragraf-editor');
          if (semuaEditor && semuaEditor[pIdx - 1]) {
            setCaretOffset(semuaEditor[pIdx - 1], posisiGabung);
          }
        }
      });

      pListEl.appendChild(pItem);
    });

    card.querySelector('.btn-add-paragraf').addEventListener('click', () => {
      outline.paragraf.push('');
      simpan();
      renderDaftarOutline();
      const semuaEditor = document.querySelectorAll('.outline-card')[outIdx]?.querySelectorAll('.paragraf-editor');
      if (semuaEditor && semuaEditor.length > 0) {
        semuaEditor[semuaEditor.length - 1].focus();
      }
    });

    container.appendChild(card);
  });
}

// Logika Autocomplete Ganda:
// 1. Jika diawali "/" -> Panggil daftar Istilah & Efek Bunyi
// 2. Jika mengetik huruf biasa -> Panggil daftar Tokoh & Alias
function periksaAutocomplete(editorEl, outIdx, pIdx) {
  const buku = bukuAktif();
  if (!buku) return tutupAutocomplete();

  const teks = editorEl.innerText.replace(/\r?\n/g, '');
  const pos = getCaretOffset(editorEl);
  const teksSebelum = teks.slice(0, pos);

  // Mode 1: Pemicu "/" untuk Istilah & Efek Bunyi
  const matchIstilah = teksSebelum.match(/(?:^|\s)(\/[a-zA-Z0-9_-]*)$/);
  if (matchIstilah) {
    const daftarIstilah = buku.istilah || [];
    if (!daftarIstilah.length) return tutupAutocomplete();

    const fullTrigger = matchIstilah[1]; // contoh: "/" atau "/du"
    const query = fullTrigger.slice(1).toLowerCase();

    const cocokIstilah = daftarIstilah
      .filter(
        (ist) =>
          !query ||
          ist.kata.toLowerCase().includes(query) ||
          (ist.keterangan && ist.keterangan.toLowerCase().includes(query))
      )
      .map((ist) => ({
        tipe: 'istilah',
        teks: ist.kata,
        peran: ist.keterangan || 'Istilah'
      }));

    if (cocokIstilah.length === 0) return tutupAutocomplete();

    acMatches = cocokIstilah;
    acIndex = 0;
    acTargetInfo = { el: editorEl, outIdx, pIdx, prefixLen: fullTrigger.length, mode: 'istilah' };
    renderPopupAutocomplete();
    return;
  }

  // Mode 2: Huruf awal untuk Tokoh & Alias
  const entitas = dapatkanEntitasTokoh(buku);
  if (!entitas.length) return tutupAutocomplete();

  const matchKata = teksSebelum.match(/(?:^|[^a-zA-Z0-9_/])([a-zA-Z0-9_]+(?:\s[a-zA-Z0-9_]+)?)$/);
  if (!matchKata) return tutupAutocomplete();

  const frasaKetik = matchKata[1];
  const frasaLower = frasaKetik.toLowerCase();

  let cocok = entitas.filter(
    (e) => e.teks.toLowerCase().startsWith(frasaLower) && e.teks.toLowerCase() !== frasaLower
  );

  let panjangPrefix = frasaKetik.length;
  if (cocok.length === 0 && frasaKetik.includes(' ')) {
    const kataTerakhir = frasaKetik.split(' ').pop();
    const kataLower = kataTerakhir.toLowerCase();
    cocok = entitas.filter(
      (e) => e.teks.toLowerCase().startsWith(kataLower) && e.teks.toLowerCase() !== kataLower
    );
    panjangPrefix = kataTerakhir.length;
  }

  if (cocok.length === 0) return tutupAutocomplete();

  acMatches = cocok.map((c) => ({ tipe: 'tokoh', ...c }));
  acIndex = 0;
  acTargetInfo = { el: editorEl, outIdx, pIdx, prefixLen: panjangPrefix, mode: 'tokoh' };
  renderPopupAutocomplete();
}

function renderPopupAutocomplete() {
  const popup = $('autocomplete-popup');
  if (!acTargetInfo || acMatches.length === 0) return tutupAutocomplete();

  const rect = acTargetInfo.el.getBoundingClientRect();
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  popup.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 210)}px`;

  const judulHint =
    acTargetInfo.mode === 'istilah'
      ? 'Daftar Istilah &bull; Tekan <strong>Tab</strong> / tap'
      : 'Tokoh &amp; Alias &bull; Tekan <strong>Tab</strong> / tap';

  popup.innerHTML = `<div class="autocomplete-hint">${judulHint}</div>`;

  acMatches.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = `autocomplete-item ${idx === acIndex ? 'selected' : ''}`;

    if (item.tipe === 'istilah') {
      row.innerHTML = `
        <div class="autocomplete-item-left">
          <span class="istilah-badge-icon">/</span>
          <span style="color: #fbbf24;">${escapeHTML(item.teks)}</span>
        </div>
        <span class="autocomplete-role">${escapeHTML(item.peran)}</span>
      `;
    } else {
      row.innerHTML = `
        <div class="autocomplete-item-left">
          <span class="tokoh-dot" style="background-color: ${item.warna};"></span>
          <span style="color: ${item.warna};">${escapeHTML(item.teks)}</span>
        </div>
        <span class="autocomplete-role">${escapeHTML(item.peran)}</span>
      `;
    }

    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      terapkanPilihanAutocomplete(idx);
    });
    popup.appendChild(row);
  });

  popup.classList.remove('hidden');
}

function terapkanPilihanAutocomplete(idx) {
  if (!acTargetInfo || !acMatches[idx]) return;
  const buku = bukuAktif();
  const bab = babAktif();
  const { el, outIdx, pIdx, prefixLen } = acTargetInfo;
  const pilihan = acMatches[idx].teks;

  el.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    // Hapus prefix ("/du" atau "ar") tepat di belakang kursor lalu sisipkan teks terpilih
    for (let i = 0; i < prefixLen; i++) {
      sel.modify('extend', 'backward', 'character');
    }
    document.execCommand('insertText', false, pilihan + ' ');
  }

  const offset = getCaretOffset(el);
  const markup = serializeEditor(el);
  const diformat = formatTeksKonsisten(markup, buku);
  bab.outlines[outIdx].paragraf[pIdx] = diformat;
  el.innerHTML = renderMarkupEditorHTML(diformat, buku);
  setCaretOffset(el, offset);

  simpan();
  $(`out-words-${outIdx}`).textContent = `${hitungKataOutline(bab.outlines[outIdx])} kata`;
  perbaruiProgresBab();
  tutupAutocomplete();
}

function tutupAutocomplete() {
  $('autocomplete-popup').classList.add('hidden');
  acMatches = [];
  acIndex = 0;
  acTargetInfo = null;
}

// ================= VIEW 4: PREVIEW BAB =================
function bukaPreviewBab() {
  const bab = babAktif();
  if (!bab) return;

  $('preview-judul-bab').textContent = `Preview: ${bab.judul}`;
  const select = $('select-filter-preview');
  select.innerHTML = `<option value="ALL">Semua Outline (Gabungan)</option>`;

  bab.outlines.forEach((out, idx) => {
    const opt = document.createElement('option');
    opt.value = idx.toString();
    opt.textContent = `Outline #${idx + 1}: ${out.judul}`;
    select.appendChild(opt);
  });

  perbaruiProgresBab();
  renderKontenPreview('ALL');
  tampilkanView('view-preview-bab');
}

function renderKontenPreview(filterVal) {
  const buku = bukuAktif();
  const bab = babAktif();
  if (!buku || !bab) return;

  const paper = $('preview-paper');
  paper.innerHTML = '';

  const outlineTerpilih =
    filterVal === 'ALL' ? bab.outlines : [bab.outlines[parseInt(filterVal, 10)]].filter(Boolean);

  let semuaParagraf = [];
  outlineTerpilih.forEach((out) => {
    (out.paragraf || []).forEach((p) => {
      const bersih = p.trim();
      if (bersih) semuaParagraf.push(formatTeksKonsisten(bersih, buku));
    });
  });

  const totalKataPreview = semuaParagraf.reduce((acc, p) => acc + hitungKata(p), 0);
  $('preview-word-summary').textContent = `Menampilkan ${semuaParagraf.length} Paragraf (${totalKataPreview.toLocaleString('id-ID')} Kata)`;

  if (semuaParagraf.length === 0) {
    paper.innerHTML = `<p style="text-indent: 0; color: #71717a; text-align: center;">Belum ada isi cerita pada pilihan outline ini.</p>`;
    return;
  }

  semuaParagraf.forEach((pMarkup) => {
    const pEl = document.createElement('p');
    pEl.innerHTML = renderMarkupEditorHTML(pMarkup, buku);
    paper.appendChild(pEl);
  });
}

// ================= VIEW 5: TERAPKAN & HASIL FINAL BAB =================
function terapkanKeBabUtuh() {
  const buku = bukuAktif();
  const bab = babAktif();
  if (!buku || !bab) return;

  const total = hitungKataBab(bab);
  if (total < bab.targetKata) return;

  const semuaParagraf = [];
  bab.outlines.forEach((out) => {
    (out.paragraf || []).forEach((p) => {
      const bersih = formatTeksKonsisten(p.trim(), buku);
      if (bersih) semuaParagraf.push(bersih);
    });
  });

  bab.teksFinal = semuaParagraf.join('\n\n');
  bab.status = 'Selesai';
  simpan();
  renderRakBuku();
  bukaHasilFinalBab();
}

function bukaHasilFinalBab() {
  const bab = babAktif();
  if (!bab) return;

  $('final-judul-bab').textContent = bab.judul;
  const kontenEl = $('final-konten-bab');
  kontenEl.innerHTML = '';

  const paragrafList = (bab.teksFinal || '').split(/\n\n+/).filter((p) => p.trim());
  paragrafList.forEach((p) => {
    const pEl = document.createElement('p');
    pEl.innerHTML = renderMarkupFinalHTML(p.trim());
    kontenEl.appendChild(pEl);
  });

  $('notifikasi-salin').classList.add('hidden');
  tampilkanView('view-final-bab');
}

// ================= EVENT LISTENER GLOBAL =================
document.addEventListener('click', (e) => {
  const t = e.target;

  // Rak & Detail Buku
  if (t.closest('#btn-tambah-buku')) bukaFormBuku(false);
  if (t.closest('#btn-edit-buku')) bukaFormBuku(true);
  if (t.closest('#btn-tutup-buat') || t.closest('#btn-batal-buat')) $('modal-buat-buku').classList.add('hidden');
  if (t.closest('#btn-tutup-detail')) $('modal-detail-buku').classList.add('hidden');

  if (t.classList.contains('warna-opsi')) {
    document.querySelectorAll('.warna-opsi').forEach((b) => b.classList.remove('active'));
    t.classList.add('active');
    warnaSampul = t.dataset.color;
  }

  if (t.closest('#btn-hapus-cover')) {
    coverBase64 = '';
    $('input-cover').value = '';
    $('preview-cover-box').classList.add('hidden');
  }

  if (t.closest('#btn-hapus-buku') && idBukuAktif) {
    if (!konfirmasiHapus) {
      konfirmasiHapus = true;
      t.textContent = 'Yakin Hapus?';
    } else {
      daftarBuku = daftarBuku.filter((b) => b.id !== idBukuAktif);
      simpan();
      renderRakBuku();
      $('modal-detail-buku').classList.add('hidden');
      idBukuAktif = null;
    }
  }

  // Navigasi Daftar Bab
  if (t.closest('#btn-buka-bab')) bukaHalamanDaftarBab();
  if (t.closest('#btn-kembali-rak')) {
    renderRakBuku();
    tampilkanView('view-rak');
  }
  if (t.closest('#btn-kelola-tokoh-shortcut') && idBukuAktif) bukaDetailBuku(idBukuAktif);
  if (t.closest('#btn-tambah-bab')) bukaFormBab(false);
  if (t.closest('#btn-edit-meta-bab')) bukaFormBab(true);
  if (t.closest('#btn-tutup-bab-form') || t.closest('#btn-batal-bab-form')) $('modal-bab-form').classList.add('hidden');

  // Toolbar Format Editor
  if (t.closest('#btn-format-italic')) toggleItalicAktif();
  if (t.closest('#btn-sisip-istilah')) sisipPemicuIstilah();

  // Navigasi Editor Outline & Preview
  if (t.closest('#btn-kembali-daftar-bab') || t.closest('#btn-final-ke-daftar-bab')) bukaHalamanDaftarBab();
  if (t.closest('#btn-buka-preview')) bukaPreviewBab();
  if (t.closest('#btn-kembali-edit-outline') || t.closest('#btn-edit-ulang-outline')) bukaEditorOutlineBab();

  // Terapkan Bab Utuh
  if (t.closest('#btn-terapkan-bab') || t.closest('#btn-terapkan-dari-preview')) terapkanKeBabUtuh();

  // Aksi Hasil Final Bab
  if (t.closest('#btn-toggle-kertas')) {
    const paper = $('final-paper');
    const jadiTerang = paper.classList.toggle('paper-light');
    t.textContent = jadiTerang ? 'Mode Kertas Gelap' : 'Mode Kertas Putih (Teks Hitam)';
  }

  if (t.closest('#btn-salin-novel') && babAktif()) {
    const markupFinal = babAktif().teksFinal || '';
    const teksPolos = stripItalicTags(markupFinal);
    const htmlRich = markupFinal
      .split(/\n\n+/)
      .map((p) => `<p>${renderMarkupFinalHTML(p)}</p>`)
      .join('');

    const tampilkanToast = () => {
      $('notifikasi-salin').classList.remove('hidden');
      setTimeout(() => $('notifikasi-salin').classList.add('hidden'), 3000);
    };

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/plain': new Blob([teksPolos], { type: 'text/plain' }),
        'text/html': new Blob([htmlRich], { type: 'text/html' })
      });
      navigator.clipboard.write([item]).then(tampilkanToast).catch(() => {
        navigator.clipboard.writeText(teksPolos).then(tampilkanToast);
      });
    } else {
      navigator.clipboard.writeText(teksPolos).then(tampilkanToast);
    }
  }

  if (t.closest('#btn-unduh-txt') && babAktif()) {
    const bab = babAktif();
    const isi = `${bab.judul}\n\n${stripItalicTags(bab.teksFinal)}`;
    const blob = new Blob([isi], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${bab.judul.replace(/[^a-z0-9]/gi, '_')}.txt`;
    a.click();
  }

  if (t.closest('#btn-unduh-word') && babAktif()) {
    const bab = babAktif();
    const paragrafHTML = (bab.teksFinal || '')
      .split(/\n\n+/)
      .map((p) => `<p style="text-indent: 2em; margin-bottom: 12pt; line-height: 1.6; color: #000000; font-family: 'Times New Roman', serif; font-size: 12pt;">${renderMarkupFinalHTML(p)}</p>`)
      .join('');

    const docHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${escapeHTML(bab.judul)}</title></head>
      <body style="color: #000000;">
        <h2 style="text-align: center; color: #000000; font-family: 'Times New Roman', serif;">${escapeHTML(bab.judul)}</h2>
        ${paragrafHTML}
      </body></html>
    `;
    const blob = new Blob(['\ufeff', docHTML], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${bab.judul.replace(/[^a-z0-9]/gi, '_')}.doc`;
    a.click();
  }
});

// Filter Dropdown Preview
$('select-filter-preview')?.addEventListener('change', (e) => {
  renderKontenPreview(e.target.value);
});

// Upload & Kompres Cover
$('input-cover')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = img.width > 300 ? 300 / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      coverBase64 = canvas.toDataURL('image/jpeg', 0.8);
      $('preview-cover-img').src = coverBase64;
      $('preview-cover-box').classList.remove('hidden');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// Submit Buat / Edit Buku
$('form-buku-baru')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const judul = $('input-judul').value.trim();
  if (!judul) return;

  const dataForm = {
    judul,
    status: $('input-status').value,
    targetKata: parseInt($('input-target').value, 10) || 1000,
    warna: warnaSampul,
    cover: coverBase64,
    blurb: $('input-blurb').value.trim()
  };

  if (modeEditBuku && bukuAktif()) {
    Object.assign(bukuAktif(), dataForm);
    simpan();
    renderRakBuku();
    $('modal-buat-buku').classList.add('hidden');
    bukaDetailBuku(idBukuAktif);
  } else {
    daftarBuku.unshift({
      id: Date.now().toString(),
      ...dataForm,
      tokoh: [],
      istilah: [],
      bab: [],
      dibuatPada: new Date().toISOString()
    });
    simpan();
    renderRakBuku();
    $('modal-buat-buku').classList.add('hidden');
  }
});

// Custom Color Picker Tokoh
$('input-warna-tokoh-custom')?.addEventListener('input', (e) => {
  const buku = bukuAktif();
  if (!buku) return;
  warnaTokoh = e.target.value;
  renderPaletTokoh(buku);
  const cek = cekWarnaTokoh(warnaTokoh, buku.tokoh);
  setErrorTokoh(cek.valid ? '' : cek.pesan);
});

// Submit Tokoh Utama
$('form-tambah-tokoh')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const buku = bukuAktif();
  if (!buku) return;

  const nama = formatKapital($('input-nama-tokoh').value);
  if (!nama) return;

  const duplikat = buku.tokoh.some(
    (t) => t.nama.toLowerCase() === nama.toLowerCase() || t.alias.some((a) => a.toLowerCase() === nama.toLowerCase())
  );
  if (duplikat) return setErrorTokoh(`Tokoh atau alias "${nama}" sudah terdaftar.`);

  const cek = cekWarnaTokoh(warnaTokoh, buku.tokoh);
  if (!cek.valid) return setErrorTokoh(cek.pesan);

  setErrorTokoh('');
  const tokohBaru = { id: Date.now().toString(), nama, warna: warnaTokoh, alias: [] };
  buku.tokoh.push(tokohBaru);
  expandedTokohId = tokohBaru.id;
  simpan();
  renderRakBuku();

  $('input-nama-tokoh').value = '';
  warnaTokoh = warnaTersedia(buku.tokoh);
  $('input-warna-tokoh-custom').value = warnaTokoh;
  renderPaletTokoh(buku);
  renderDaftarTokoh(buku);
});

// Submit Istilah & Efek Bunyi
$('form-tambah-istilah')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const buku = bukuAktif();
  if (!buku) return;

  const kata = $('input-kata-istilah').value.trim().replace(/\s+/g, ' ');
  const keterangan = $('input-ket-istilah').value.trim();
  if (!kata) return;

  const sudahAda = buku.istilah.some((ist) => ist.kata.toLowerCase() === kata.toLowerCase());
  if (sudahAda) return setErrorIstilah(`Istilah "${kata}" sudah terdaftar di buku ini.`);

  setErrorIstilah('');
  buku.istilah.push({
    id: Date.now().toString(),
    kata,
    keterangan
  });

  $('input-kata-istilah').value = '';
  $('input-ket-istilah').value = '';
  simpan();
  renderRakBuku();
  renderDaftarIstilah(buku);
});

// Submit Buat / Edit Bab
$('form-bab')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const buku = bukuAktif();
  if (!buku) return;

  const judul = $('input-judul-bab').value.trim();
  const targetKata = parseInt($('input-target-bab').value, 10) || 1000;
  if (!judul) return;

  if (modeEditBab && babAktif()) {
    babAktif().judul = judul;
    babAktif().targetKata = targetKata;
    simpan();
    $('modal-bab-form').classList.add('hidden');
    bukaEditorOutlineBab();
  } else {
    const babBaru = {
      id: Date.now().toString(),
      judul,
      targetKata,
      status: 'Draft',
      outlines: [],
      teksFinal: ''
    };
    buku.bab.push(babBaru);
    idBabAktif = babBaru.id;
    simpan();
    renderRakBuku();
    $('modal-bab-form').classList.add('hidden');
    bukaEditorOutlineBab();
  }
});

// Submit Tambah Outline Baru
$('form-tambah-outline')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const bab = babAktif();
  if (!bab) return;

  const judulOutline = $('input-judul-outline').value.trim();
  if (!judulOutline) return;

  bab.outlines.push({
    id: Date.now().toString(),
    judul: judulOutline,
    expanded: true,
    paragraf: ['']
  });

  $('input-judul-outline').value = '';
  simpan();
  perbaruiProgresBab();
  renderDaftarOutline();
});

renderRakBuku();