const judulInput = document.getElementById('judul-bab');
const ceritaInput = document.getElementById('isi-cerita');
const statusSimpan = document.getElementById('status-simpan');
const jumlahKataEl = document.getElementById('jumlah-kata');
const btnExport = document.getElementById('btn-export');

// 1. Muat draf terakhir saat aplikasi dibuka
window.addEventListener('DOMContentLoaded', () => {
  judulInput.value = localStorage.getItem('aces_novel_judul') || '';
  ceritaInput.value = localStorage.getItem('aces_novel_isi') || '';
  hitungKata();
});

// 2. Fungsi hitung jumlah kata
function hitungKata() {
  const teks = ceritaInput.value.trim();
  const jumlah = teks === '' ? 0 : teks.split(/\s+/).length;
  jumlahKataEl.textContent = `${jumlah} Kata`;
}

// 3. Auto-save setiap kali mengetik
function simpanOtomatis() {
  statusSimpan.textContent = 'Menyimpan...';
  localStorage.setItem('aces_novel_judul', judulInput.value);
  localStorage.setItem('aces_novel_isi', ceritaInput.value);
  
  setTimeout(() => {
    statusSimpan.textContent = 'Tersimpan';
  }, 400);
}

judulInput.addEventListener('input', simpanOtomatis);
ceritaInput.addEventListener('input', () => {
  hitungKata();
  simpanOtomatis();
});

// 4. Unduh naskah ke file .txt
btnExport.addEventListener('click', () => {
  const judul = judulInput.value.trim() || 'Draf_Novel';
  const konten = `${judul}\n\n${ceritaInput.value}`;
  const blob = new Blob([konten], { type: 'text/plain;charset=utf-8' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${judul.replace(/\s+/g, '_')}.txt`;
  link.click();
});