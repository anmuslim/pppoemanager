# PPPoE Manager - Manajemen MikroTik Multi-Router

Aplikasi web full-stack modern untuk mengelola banyak router MikroTik dari satu dashboard terpusat. Dilengkapi dengan antarmuka bergaya Winbox/RouterOS yang responsif, visualisasi performa jaringan, dan toleransi kegagalan koneksi (*offline resilience*).

---

## Fitur Utama

1. **Multi-Router Management**:
   - Agregasi data dari banyak router sekaligus dalam mode **"Semua Router"** atau pantau per router individual.
   - Dukungan tiga mode koneksi: **Winbox API (port 8728)**, **API-SSL (port 8729)**, dan **RouterOS v7 REST API (port 443 / 80)**.
   - Kredensial router disimpan terenkripsi dengan algoritma **AES-256** di server dan tidak pernah dikirim ke browser.
   - Uji koneksi langsung (*Test Connection*) menampilkan System Identity, Versi RouterOS, Model Board, Uptime, CPU Load, dan Free RAM.
   - **Mode Demo** bawaan dengan data realistis 3 router (~220 secrets, ~90 sesi aktif) yang aktif otomatis untuk evaluasi tanpa router fisik.

2. **Dashboard Monitoring Realtime**:
   - Kartu metrik: router online/offline, total akun secret, user online, user disabled, dan total traffic (Rx/Tx).
   - Grafik tren pengguna aktif realtime (SVG Bezier curve) dengan polling berkala yang dapat disesuaikan (Mati, 5d, 10d, 30d).
   - Tabel utilisasi CPU dan alokasi memori per router.
   - Log sesi terkini (koneksi masuk / terputus).

3. **PPP Secrets (`/ppp/secret`)**:
   - CRUD lengkap: Name, Password (dengan tombol intip/reveal), Service, Profile, Local Address, Remote Address, Caller ID, Disabled, Comment.
   - Indikator status **Aktif / Offline** otomatis berdasarkan pencocokan sesi.
   - Aksi Massal (*Bulk Actions*): Aktifkan massal, nonaktifkan (isolir), ganti profile massal, dan hapus massal.
   - Fitur **Import CSV** dan **Export CSV** (dengan kolom yang sedang difilter).

4. **PPP Active (`/ppp/active`)**:
   - Monitoring pelanggan online secara realtime dengan laju traffic Tx/Rx per klien.
   - Fitur **Kick / Disconnect** per klien dengan modal konfirmasi nama akun.
   - Fitur **Bulk Disconnect** seluruh sesi aktif.

5. **PPP Profiles (`/ppp/profile`)**:
   - CRUD paket kecepatan dan konfigurasi klien.
   - Dropdown Remote Address otomatis mengambil daftar dari **IP Pool** pada router terkait.
   - Dropdown Parent Queue otomatis mengambil daftar dari **Simple Queues**.
   - Form builder kecepatan ramah pengguna: Upload/Download (satuan k/M/G) + pengaturan Burst (Burst Limit, Threshold, Burst Time, Priority).

6. **Simple Queues (`/queue/simple`)**:
   - Manajemen hierarki parent-child queue untuk pembatasan bandwidth agregat.
   - Deteksi otomatis child queue dan peringatan proteksi sebelum menghapus queue yang sedang dipakai profile.

7. **IP Pool (`/ip/pool`)**:
   - Pengelolaan rentang IP alokasi dinamis pelanggan dengan validasi format rentang IP (contoh `10.10.10.2-10.10.10.254`).
   - Rantai *Next Pool* dan kalkulasi jumlah IP yang sedang terpakai.

8. **Tabel Data Ala Winbox**:
   - Multi-sort kolom (Shift+klik), pengurutan cerdas untuk IP address numerik, durasi uptime, dan nilai bandwidth.
   - Pencarian global instan dan filter multi-kriteria dengan chip filter aktif.
   - Baris nonaktif (*disabled*) bergaya miring abu-abu khas RouterOS.
   - Pemilihan baris dengan tombol Shift+klik rentang dan pintasan keyboard `Ctrl+A`.
   - Menu klik-kanan (*context menu*) untuk edit, toggle aktif/nonaktif, salin teks, dan hapus.
   - Footer penanda Winbox: *"X dari Y item, Z terpilih"*.

9. **Keamanan & Audit Log**:
   - Login administrator berbasis JWT dengan hak akses operator.
   - Menu **Riwayat Aktivitas** mencatat siapa yang mengubah apa, kapan, dan di router mana.

---

## Persiapan & Menjalankan Aplikasi

### 1. Salin File Konfigurasi Environment
```bash
cp .env.example .env
```
Isi konfigurasi dalam file `.env`:
- `PORT=3000`
- `JWT_SECRET=rahasia-jwt-token-anda`
- `ENCRYPTION_KEY=kunci-aes-256-sepanjang-32-karakter!`

### 2. Jalankan Mode Pengembangan
```bash
npm run dev
```
Buka browser pada alamat: `http://localhost:3000`

### 3. Akun Login Default
- **Username**: `admin`
- **Password**: `admin123`
*(Tersedia tombol satu-klik "Coba Langsung (Mode Demo)" pada halaman login).*

---

## Konfigurasi di MikroTik RouterOS

Agar PPPoE Manager dapat terhubung ke MikroTik Anda, ikuti langkah-langkah berikut via Winbox Terminal atau SSH:

### 1. Mengaktifkan Service API
```routeros
# Aktifkan API standar (port 8728)
/ip service enable api

# Atau aktifkan API-SSL (port 8729) jika menggunakan sertifikat SSL
/ip service enable api-ssl

# Untuk RouterOS v7 dengan mode REST API, pastikan service www / www-ssl aktif
/ip service enable www
/ip service enable www-ssl
```

### 2. Membuat User Khusus dengan Hak Akses Terbatas (Best Practice Keamanan)
Disarankan tidak menggunakan user `admin` utama router. Buat grup dan user khusus untuk API:

```routeros
# Buat group dengan policy yang diperlukan saja
/user group add name=pppoe-api-group policy=api,read,write,!ftp,!reboot,!policy,!test,!winbox,!password,!sniff

# Buat user baru untuk PPPoE Manager
/user add name=api-pppoe group=pppoe-api-group password="GantiPasswordKuat123!" address=0.0.0.0/0
```

*Catatan: Anda dapat membatasi parameter `address` dengan alamat IP server PPPoE Manager untuk keamanan ekstra.*
