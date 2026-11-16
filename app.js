const STORAGE_KEY = 'writerapp_books_v1';

// State Aplikasi
let daftarBuku = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let warnaTerpilih = '#1e3a5f';
let coverBase64 = '';
let idBukuAktif = null;
let konfirmasiHapus = false;

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

// Elemen Modal Detail Buku
const modalDetail = document.getElementById('modal-detail-buku');
const btnTutupDetail = document.getElementById('btn-tutup-detail');
const detailCoverWrap = document.getElementById('detail-cover-wrap');
const detailStatus = document.getElementById('detail-status');
const detailJudul = document.getElementById('detail-judul');
const detailTarget = document.getElementById('detail-target');
const detailBlurb = document.getElementById('detail-blurb');
const btnHapusBuku = document.getElementById('btn-hapus-buku');
const btnBukaBab = document.getElementById('btn-buka-bab');

// Simpan ke LocalStorage
function simpanKeStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(daftarBuku));
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
        <div class="card-meta">Target: ${Number(buku.targetKata).toLocaleString('id-ID')} kata/bab &bull; ${buku.bab.length} Bab</div>
        <div class="card-blurb">${buku.blurb ? escapeHTML(buku.blurb) : 'Belum ada sinopsis.'}</div>
      </div>
    `;

    rakBukuEl.appendChild(card);
  });
}

// Mencegah XSS pada teks input user
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    bab: [],
    dibuatPada: new Date().toISOString()
  };

  daftarBuku.unshift(bukuBaru);
  simpanKeStorage();
  renderRakBuku();
  tutupModalBuat();
});

// Buka Modal Detail Buku
function bukaDetailBuku(id) {
  const buku = daftarBuku.find((b) => b.id === id);
  if (!buku) return;

  idBukuAktif = id;
  konfirmasiHapus = false;
  btnHapusBuku.textContent = 'Hapus Buku';

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

  modalDetail.classList.remove('hidden');
}

btnTutupDetail.addEventListener('click', () => {
  modalDetail.classList.add('hidden');
  idBukuAktif = null;
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
  alert('Tahap 1 selesai! Di Tahap 2 nanti, tombol ini akan membuka halaman Daftar Bab khusus untuk buku yang dipilih.');
});

// Inisialisasi Awal
renderRakBuku();