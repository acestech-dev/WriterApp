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
    .replace(/\s+/g, ' ')}