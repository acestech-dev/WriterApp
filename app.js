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
      bab: Array.isArray(b.bab) ? b.bab : [],
      tokoh: Array.isArray(b.tokoh) ? b.tokoh : []
    }));
  } catch {
    return [];
  }
}

let daftarBuku = muatBuku();
let warnaSampul = '#1e3a5f';
let coverBase64 = '';
let idBukuAktif = null;
let modeEditBuku = false;
let konfirmasiHapus = false;
let warnaTokoh = '#ef4444';
let expandedTokohId = null;

const simpan = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(daftarBuku));
const bukuAktif = () => daftarBuku.find((b) => b.id === idBukuAktif);

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatKapital(teks) {
  return teks.trim().replace(/\s+/g, ' ').split(' ')
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(' ');
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
        <div class="card-meta">${buku.tokoh.length} Tokoh &bull; ${buku.bab.length} Bab &bull; Target ${Number(buku.targetKata).toLocaleString('id-ID')} kata</div>
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
  $('modal-detail-buku').classList.remove('hidden');
}

// Event Klik Global
document.addEventListener('click', (e) => {
  const t = e.target;

  if (t.closest('#btn-tambah-buku')) {
    bukaFormBuku(false);
  }

  if (t.closest('#btn-edit-buku')) {
    bukaFormBuku(true);
  }

  if (t.closest('#btn-tutup-buat') || t.closest('#btn-batal-buat')) {
    $('modal-buat-buku').classList.add('hidden');
  }

  if (t.closest('#btn-tutup-detail')) {
    $('modal-detail-buku').classList.add('hidden');
    idBukuAktif = null;
  }

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

  if (t.closest('#btn-buka-bab')) {
    alert('Database Tokoh & Alias siap! Di tahap berikutnya tombol ini membuka halaman Daftar Bab & Area Tulis.');
  }
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

// Submit Buat atau Edit Buku
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

renderRakBuku();