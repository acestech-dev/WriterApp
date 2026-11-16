const STORAGE_KEY = 'writerapp_books_v1';

// Palet 16 Warna Kontras Tinggi (Bebas Hitam & Putih)
const PALET_WARNA_TOKOH = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
];

// Muat & migrasi aman data buku dari LocalStorage
let daftarBuku = (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map((b) => ({
  ...b,
  bab: Array.isArray(b.bab) ? b.bab : [],
  tokoh: Array.isArray(b.tokoh) ? b.tokoh : []
}));

// State Aplikasi
let warnaTerpilih = '#1e3a5f';
let coverBase64 = '';
let idBukuAktif = null;
let konfirmasiHapus = false;
let warnaTokohTerpilih = '#ef4444';
let expandedTokohId = null;

// Elemen DOM Utama
const rakBukuEl = document.getElementById('rak-buku');
const emptyStateEl = document.getElementById('empty-state');
const jumlahBukuEl = document.getElementById('jumlah-buku');

// Elemen Modal Buat Buku
const modalBuat = document.getElementById('modal-buat-buku');
const btnTambahBuku = document.getElementById('btn-tambah-buku');
const btnTutupBuat = document.getElementById('btn-tutup-buat');
const btnBatalBuat = document.getElementById('btn-batal-buat');
const formBukuBaru = document.getElementById('form-buku-baru');

const inputJudul = document.getElementById('input-judul');
const inputStatus = document.getElementById('input-status');
const inputTarget = document.getElementById('input-target');
const inputCover = document.getElementById('input-cover');
const inputBlurb = document.getElementById('input-blurb');

const previewCoverBox = document.getElementById('preview-cover-box');
const previewCoverImg = document.getElementById('preview-cover-img');
const btnHapusCover = document.getElementById('btn-hapus-cover');
const tombolWarna = document.querySelectorAll('.warna-opsi');

// Elemen Modal Detail Buku & Tokoh
const modalDetail = document.getElementById('modal-detail-buku');
const btnTutupDetail = document.getElementById('btn-tutup-detail');
const detailCoverWrap = document.getElementById('detail-cover-wrap');
const detailStatus = document.getElementById('detail-status');
const detailJudul = document.getElementById('detail-judul');
const detailTarget = document.getElementById('detail-target');
const detailBlurb = document.getElementById('detail-blurb');
const btnHapusBuku = document.getElementById('btn-hapus-buku');
const btnBukaBab = document.getElementById('btn-buka-bab');

const jumlahTokohEl = document.getElementById('jumlah-tokoh');
const formTambahTokoh = document.getElementById('form-tambah-tokoh');
const inputNamaTokoh = document.getElementById('input-nama-tokoh');
const paletWarnaTokohEl = document.getElementById('palet-warna-tokoh');
const inputWarnaTokohCustom = document.getElementById('input-warna-tokoh-custom');
const errorTokohEl = document.getElementById('error-tokoh');
const daftarTokohEl = document.getElementById('daftar-tokoh');

// Simpan ke LocalStorage
function simpanKeStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(daftarBuku));
}

// Mencegah XSS pada teks input user
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Format otomatis huruf kapital di awal setiap kata (misal: "kak indra" -> "Kak Indra")
function formatKapital(teks) {
  return teks
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((kata) => kata.charAt(0).toUpperCase() + kata.slice(1))
    .join(' ');
}

// Konversi Hex ke RGB
function hexToRgb(hex) {
  const bersih = hex.replace('#', '');
  return {
    r: parseInt(bersih.substring(0, 2), 16),
    g: parseInt(bersih.substring(2, 4), 16),
    b: parseInt(bersih.substring(4, 6), 16)
  };
}

// Validasi Warna Tokoh (Larang hitam/terlalu gelap, putih/terlalu terang, & warna kembar)
function validasiWarnaTokoh(hex, daftarTokohBuku) {
  const warnaLower = hex.toLowerCase();
  const { r, g, b } = hexToRgb(warnaLower);
  const kecerahan = 0.299 * r + 0.587 * g + 0.114 * b;

  if (kecerahan < 45) {
    return { valid: false, pesan: 'Warna hitam atau terlalu gelap tidak diperbolehkan.' };
  }
  if (kecerahan > 225) {
    return { valid: false, pesan: 'Warna putih atau terlalu terang tidak diperbolehkan.' };
  }

  for (const t of daftarTokohBuku) {
    const tWarna = t.warna.toLowerCase();
    if (tWarna === warnaLower) {
      return { valid: false, pesan: `Warna ini sudah dipakai oleh tokoh "${t.nama}".` };
    }
    const rgbLain = hexToRgb(tWarna);
    const jarak = Math.hypot(r - rgbLain.r, g - rgbLain.g, b - rgbLain.b);
    if (jarak < 26) {
      return { valid: false, pesan: `Warna ini terlalu mirip dengan warna tokoh "${t.nama}".` };
    }
  }

  return { valid: true, pesan: '' };
}

// Pilih warna pertama dari palet yang belum terpakai
function cariWarnaTersedia(daftarTokohBuku) {
  for (const hex of PALET_WARNA_TOKOH) {
    if (validasiWarnaTokoh(hex, daftarTokohBuku).valid) {
      return hex;
    }
  }
  return '#38bdf8';
}

function tampilkanErrorTokoh(pesan) {
  if (!pesan) {
    errorTokohEl.classList.add('hidden');
    errorTokohEl.textContent = '';
  } else {
    errorTokohEl.textContent = pesan;
    errorTokohEl.classList.remove('hidden');
  }
}

// Render Rak Buku
function renderRakBuku() {
  jumlahBukuEl.textContent = `${daftarBuku.length} Buku`;
  rakBukuEl.innerHTML = '';

  if (daftarBuku.length === 0) {
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  daftarBuku.forEach((buku) => {
    const card = document.createElement('div');
    card.className = 'buku-card';
    card.addEventListener('click', () => bukaDetailBuku(buku.id));

    const statusClass =
      buku.status === 'On-Going'
        ? 'status-ongoing'
        : buku.status === 'Tamat'
        ? 'status-tamat'
        : '';

    const coverStyle = buku.cover
      ? `background-image: url('${buku.cover}');`
      : `background-color: ${buku.warna};`;

    const coverText = buku.cover
      ? ''
      : `<span class="card-cover-title">${escapeHTML(buku.judul)}</span>`;

    card.innerHTML = `
      <div class="card-cover" style="${coverStyle}">
        <span class="status-badge ${statusClass}">${buku.status}</span>
        ${coverText}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHTML(buku.judul)}</div>
        <div class="card-meta">${buku.tokoh.length} Tokoh &bull; ${buku.bab.length} Bab &bull; Target ${Number(buku.targetKata).toLocaleString('id-ID')} kata</div>
        <div class="card-blurb">${buku.blurb ? escapeHTML(buku.blurb) : 'Belum ada sinopsis.'}</div>
      </div>
    `;

    rakBukuEl.appendChild(card);
  });
}

// Kompresi Gambar Cover via HTML5 Canvas (Maks lebar 300px)
function kompresGambar(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxWidth = 300;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      callback(compressedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Event Pilihan Warna Sampul
tombolWarna.forEach((btn) => {
  btn.addEventListener('click', () => {
    tombolWarna.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    warnaTerpilih = btn.dataset.color;
  });
});

// Event Upload Cover
inputCover.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  kompresGambar(file, (hasilBase64) => {
    coverBase64 = hasilBase64;
    previewCoverImg.src = coverBase64;
    previewCoverBox.classList.remove('hidden');
  });
});

btnHapusCover.addEventListener('click', () => {
  coverBase64 = '';
  inputCover.value = '';
  previewCoverBox.classList.add('hidden');
});

// Buka & Tutup Modal Buat Buku
function bukaModalBuat() {
  formBukuBaru.reset();
  coverBase64 = '';
  previewCoverBox.classList.add('hidden');
  warnaTerpilih = '#1e3a5f';
  tombolWarna.forEach((b, i) => b.classList.toggle('active', i === 0));
  modalBuat.classList.remove('hidden');
  inputJudul.focus();
}

function tutupModalBuat() {
  modalBuat.classList.add('hidden');
}

btnTambahBuku.addEventListener('click', bukaModalBuat);
btnTutupBuat.addEventListener('click', tutupModalBuat);
btnBatalBuat.addEventListener('click', tutupModalBuat);

// Submit Buku Baru
formBukuBaru.addEventListener('submit', (e) => {
  e.preventDefault();
  const judul = inputJudul.value.trim();
  if (!judul) return;

  const bukuBaru = {
    id: Date.now().toString(),
    judul: judul,
    status: inputStatus.value,
    targetKata: parseInt(inputTarget.value, 10) || 1000,
    warna: warnaTerpilih,
    cover: coverBase64,
    blurb: inputBlurb.value.trim(),
    tokoh: [],
    bab: [],
    dibuatPada: new Date().toISOString()
  };

  daftarBuku.unshift(bukuBaru);
  simpanKeStorage();
  renderRakBuku();
  tutupModalBuat();
});

// Render Palet Warna Tokoh
function renderPaletWarnaTokoh(buku) {
  paletWarnaTokohEl.innerHTML = '';

  PALET_WARNA_TOKOH.forEach((hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch-btn';
    btn.style.backgroundColor = hex;

    const cek = validasiWarnaTokoh(hex, buku.tokoh);
    if (!cek.valid) {
      btn.classList.add('used');
      btn.title = cek.pesan;
    } else {
      btn.title = hex;
      if (warnaTokohTerpilih.toLowerCase() === hex.toLowerCase()) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        warnaTokohTerpilih = hex;
        inputWarnaTokohCustom.value = hex;
        tampilkanErrorTokoh('');
        renderPaletWarnaTokoh(buku);
      });
    }

    paletWarnaTokohEl.appendChild(btn);
  });
}

// Event Input Warna Bebas (Color Picker)
inputWarnaTokohCustom.addEventListener('input', (e) => {
  const buku = daftarBuku.find((b) => b.id === idBukuAktif);
  if (!buku) return;

  const hex = e.target.value;
  warnaTokohTerpilih = hex;
  renderPaletWarnaTokoh(buku);

  const cek = validasiWarnaTokoh(hex, buku.tokoh);
  tampilkanErrorTokoh(cek.valid ? '' : cek.pesan);
});

// Cek apakah nama/alias sudah terdaftar di buku ini
function apakahNamaSudahAda(buku, namaBaru) {
  const target = namaBaru.toLowerCase();
  for (const t of buku.tokoh) {
    if (t.nama.toLowerCase() === target) return true;
    if (t.alias.some((a) => a.toLowerCase() === target)) return true;
  }
  return false;
}

// Render Daftar Dropdown Tokoh & Alias
function renderDaftarTokoh(buku) {
  jumlahTokohEl.textContent = `${buku.tokoh.length} Tokoh`;
  daftarTokohEl.innerHTML = '';

  if (buku.tokoh.length === 0) {
    daftarTokohEl.innerHTML = `<div class="tokoh-empty-msg">Belum ada tokoh terdaftar. Tambahkan tokoh utama di atas beserta warna khasnya.</div>`;
    return;
  }

  buku.tokoh.forEach((tokoh) => {
    const item = document.createElement('div');
    item.className = `tokoh-item ${expandedTokohId === tokoh.id ? 'open' : ''}`;

    // Header Dropdown Tokoh
    const header = document.createElement('div');
    header.className = 'tokoh-header';
    header.innerHTML = `
      <div class="tokoh-header-left">
        <span class="tokoh-dot" style="background-color: ${tokoh.warna};"></span>
        <span class="tokoh-name" style="color: ${tokoh.warna};">${escapeHTML(tokoh.nama)}</span>
      </div>
      <div class="tokoh-header-right">
        <span class="alias-count-badge">${tokoh.alias.length} Alias</span>
        <span class="tokoh-chevron">&#9662;</span>
        <button type="button" class="btn-delete-tokoh" title="Hapus tokoh">&times;</button>
      </div>
    `;

    // Toggle buka/tutup dropdown saat header diklik
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-tokoh')) return;
      expandedTokohId = expandedTokohId === tokoh.id ? null : tokoh.id;
      renderDaftarTokoh(buku);
    });

    // Tombol Hapus Tokoh
    header.querySelector('.btn-delete-tokoh').addEventListener('click', () => {
      buku.tokoh = buku.tokoh.filter((t) => t.id !== tokoh.id);
      if (expandedTokohId === tokoh.id) expandedTokohId = null;
      simpanKeStorage();
      renderRakBuku();
      warnaTokohTerpilih = cariWarnaTersedia(buku.tokoh);
      inputWarnaTokohCustom.value = warnaTokohTerpilih;
      renderPaletWarnaTokoh(buku);
      renderDaftarTokoh(buku);
    });

    // Body Dropdown (Daftar Alias & Form Tambah Alias)
    const body = document.createElement('div');
    body.className = 'tokoh-body';

    const aliasListEl = document.createElement('div');
    aliasListEl.className = 'alias-list';

    if (tokoh.alias.length === 0) {
      aliasListEl.innerHTML = `<span class="alias-empty">Belum ada alias / panggilan untuk ${escapeHTML(tokoh.nama)}.</span>`;
    } else {
      tokoh.alias.forEach((aliasText, idx) => {
        const chip = document.createElement('span');
        chip.className = 'alias-chip';
        chip.style.color = tokoh.warna;
        chip.innerHTML = `
          ${escapeHTML(aliasText)}
          <button type="button" class="btn-remove-alias" title="Hapus alias">&times;</button>
        `;
        chip.querySelector('.btn-remove-alias').addEventListener('click', () => {
          tokoh.alias.splice(idx, 1);
          simpanKeStorage();
          renderDaftarTokoh(buku);
        });
        aliasListEl.appendChild(chip);
      });
    }

    const aliasForm = document.createElement('form');
    aliasForm.className = 'alias-add-form';
    aliasForm.innerHTML = `
      <input type="text" placeholder="Tambah alias (misal: Kak ${escapeHTML(tokoh.nama)}, Ndra)..." autocomplete="off" required>
      <button type="submit" class="btn-add-alias">+ Alias</button>
    `;

    aliasForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const inputAlias = aliasForm.querySelector('input');
      const aliasKapital = formatKapital(inputAlias.value);
      if (!aliasKapital) return;

      if (apakahNamaSudahAda(buku, aliasKapital)) {
        tampilkanErrorTokoh(`Nama atau alias "${aliasKapital}" sudah terdaftar pada buku ini.`);
        return;
      }

      tampilkanErrorTokoh('');
      tokoh.alias.push(aliasKapital);
      simpanKeStorage();
      renderDaftarTokoh(buku);
    });

    body.appendChild(aliasListEl);
    body.appendChild(aliasForm);

    item.appendChild(header);
    item.appendChild(body);
    daftarTokohEl.appendChild(item);
  });
}

// Submit Tambah Tokoh Utama
formTambahTokoh.addEventListener('submit', (e) => {
  e.preventDefault();
  const buku = daftarBuku.find((b) => b.id === idBukuAktif);
  if (!buku) return;

  const namaKapital = formatKapital(inputNamaTokoh.value);
  if (!namaKapital) return;

  if (apakahNamaSudahAda(buku, namaKapital)) {
    tampilkanErrorTokoh(`Tokoh atau alias "${namaKapital}" sudah terdaftar di buku ini.`);
    return;
  }

  const cekWarna = validasiWarnaTokoh(warnaTokohTerpilih, buku.tokoh);
  if (!cekWarna.valid) {
    tampilkanErrorTokoh(cekWarna.pesan);
    return;
  }

  tampilkanErrorTokoh('');

  const tokohBaru = {
    id: Date.now().toString(),
    nama: namaKapital,
    warna: warnaTokohTerpilih,
    alias: []
  };

  buku.tokoh.push(tokohBaru);
  expandedTokohId = tokohBaru.id;
  simpanKeStorage();
  renderRakBuku();

  inputNamaTokoh.value = '';
  warnaTokohTerpilih = cariWarnaTersedia(buku.tokoh);
  inputWarnaTokohCustom.value = warnaTokohTerpilih;
  renderPaletWarnaTokoh(buku);
  renderDaftarTokoh(buku);
});

// Buka Modal Detail Buku
function bukaDetailBuku(id) {
  const buku = daftarBuku.find((b) => b.id === id);
  if (!buku) return;

  idBukuAktif = id;
  konfirmasiHapus = false;
  expandedTokohId = null;
  btnHapusBuku.textContent = 'Hapus Buku';
  tampilkanErrorTokoh('');

  detailJudul.textContent = buku.judul;
  detailStatus.textContent = buku.status;
  detailTarget.textContent = `Target: ${Number(buku.targetKata).toLocaleString('id-ID')} kata / bab`;
  detailBlurb.textContent = buku.blurb || 'Belum ada sinopsis.';

  if (buku.cover) {
    detailCoverWrap.style.backgroundImage = `url('${buku.cover}')`;
    detailCoverWrap.style.backgroundColor = 'transparent';
    detailCoverWrap.textContent = '';
  } else {
    detailCoverWrap.style.backgroundImage = 'none';
    detailCoverWrap.style.backgroundColor = buku.warna;
    detailCoverWrap.textContent = buku.judul;
  }

  warnaTokohTerpilih = cariWarnaTersedia(buku.tokoh);
  inputWarnaTokohCustom.value = warnaTokohTerpilih;
  renderPaletWarnaTokoh(buku);
  renderDaftarTokoh(buku);

  modalDetail.classList.remove('hidden');
}

btnTutupDetail.addEventListener('click', () => {
  modalDetail.classList.add('hidden');
  idBukuAktif = null;
  expandedTokohId = null;
});

// Hapus Buku (Konfirmasi 2 Langkah)
btnHapusBuku.addEventListener('click', () => {
  if (!idBukuAktif) return;

  if (!konfirmasiHapus) {
    konfirmasiHapus = true;
    btnHapusBuku.textContent = 'Yakin Hapus?';
    return;
  }

  daftarBuku = daftarBuku.filter((b) => b.id !== idBukuAktif);
  simpanKeStorage();
  renderRakBuku();
  modalDetail.classList.add('hidden');
  idBukuAktif = null;
});

// Navigasi ke Tahap 2 (Daftar Bab)
btnBukaBab.addEventListener('click', () => {
  alert('Database Tokoh & Alias sudah siap! Di tahap berikutnya, tombol ini akan membuka halaman Daftar Bab dan Area Tulis dengan pewarnaan otomatis tokoh.');
});

// Inisialisasi Awal
renderRakBuku();