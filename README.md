# Industrial Water Treatment Plant (WTP) SCADA System

Platform SCADA berbasis web untuk pemantauan, visualisasi proses, manajemen alarm, pencatatan historis (*historian*), pelaporan, dan kendali supervisi Instalasi Pengolahan Air Bersih (**Process Areas A–H**).

## Fitur & Arsitektur Utama
- **Realistic 2.5D Cutaway HMI + Classic P&ID Toggle**: Tampilan visual tangki, pompa sentrifugal/dosing, valve, clarifier, dual-media filter, sensor lapangan, animasi fluida real-time berbasis debit/status, serta animasi mixer & agitator sesuai RPM aktual (dengan opsi beralih ke P&ID standar ISO 10628-2 / ISA-5.1).
- **Navigasi Cepat & Tema Dark/Light**: Sidebar dengan pencarian halaman instan (`Find page...`), indikator alarm aktif, switch tema **Dark / Light HMI**, dan kontrol `EquipmentFaceplate` interaktif.
- **Backend (`backend/`)**: Python, FastAPI, Uvicorn, WebSocket (`/ws/telemetry`), SQLite (WAL mode), `pymodbus`, `reportlab` (PDF), `pytest`.
- **Frontend (`frontend/`)**: React 18, TypeScript, Vite, SVG interaktif & Historian Trend Charts.
- **Dokumentasi & Konfigurasi (`backend/config/`, `docs/`)**: Konfigurasi Process Areas A–H, batas kualitas air ([`plant_config.yaml`](backend/config/plant_config.yaml)), dan laporan validasi di folder [`docs/`](docs/).

---

## 1. Software yang Wajib Terinstal (Prasyarat)

Sebelum memulai di komputer/laptop baru, pastikan 3 software ini sudah terinstal:

1. **Git** — https://git-scm.com/downloads
2. **Python 3.10+** — https://www.python.org/downloads/
   > **Penting untuk pengguna Windows:** Saat installer Python terbuka, **centang kotak "Add python.exe to PATH"** sebelum klik *Install Now*.
3. **Node.js 18+ (versi LTS)** — https://nodejs.org/

Untuk mengecek apakah ketiganya sudah terpasang, buka Terminal / PowerShell dan jalankan:

```powershell
git --version
python --version
node -v
npm -v
```
*(Di macOS/Linux, gunakan `python3 --version`. Di Windows, jika `python` tidak dikenali, coba `py --version`.)*

---

## 2. Download / Clone Proyek

Buka Terminal / PowerShell di folder tujuan Anda, lalu jalankan:

```bash
git clone https://github.com/BintangPawenang/SCADA-WATER-TREATMENT-PLAN-V2-.git
cd SCADA-WATER-TREATMENT-PLAN-V2-
```

---

## 3. Setup Pertama Kali (Cukup Dilakukan Sekali Saja)

> **Kenapa perlu setup dulu?** Folder environment Python (`backend/.venv/`) dan library JavaScript (`frontend/node_modules/`) berukuran besar dan spesifik per sistem operasi sehingga sengaja tidak disimpan di GitHub. Anda cukup membuatnya sekali setelah clone.

### Opsi A — Untuk Pengguna Windows (PowerShell)

**1) Setup Backend:**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```
*(Jika perintah `python` tidak ditemukan, ganti `python -m venv .venv` menjadi `py -m venv .venv`.)*

**2) Setup Frontend:**
```powershell
cd frontend
npm.cmd install
cd ..
```

### Opsi B — Untuk Pengguna macOS / Linux / Git Bash

**1) Setup Backend:**
```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
cd ..
```

**2) Setup Frontend:**
```bash
cd frontend
npm install
cd ..
```

---

## 4. Cara Menjalankan Aplikasi (Buka 2 Terminal Bersamaan)

Aplikasi ini terdiri dari **Backend** (server SCADA & simulator fisika) dan **Frontend** (tampilan antarmuka web). Jalankan keduanya di **2 jendela Terminal / PowerShell yang terpisah** dan biarkan keduanya tetap terbuka selama aplikasi dipakai.

### Terminal 1 — Jalankan Backend (Port `8000`)

**Windows (PowerShell):**
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**macOS / Linux / Git Bash:**
```bash
cd backend
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Tunggu sampai muncul tulisan `Uvicorn running on http://127.0.0.1:8000`.

### Terminal 2 — Jalankan Frontend (Port `5173`)

**Windows (PowerShell):**
```powershell
cd frontend
npm.cmd run dev
```

**macOS / Linux / Git Bash:**
```bash
cd frontend
npm run dev
```

### Buka di Browser
Setelah kedua terminal berjalan, buka browser (Chrome / Edge / Firefox) dan kunjungi:

**http://localhost:5173**

*(Untuk pemakaian berikutnya di komputer yang sama, Anda tidak perlu mengulang Langkah 3—langsung jalankan Langkah 4 saja.)*

---

## 5. Login Pertama Kali (Mode Simulasi)

Saat pertama kali berjalan, backend otomatis membuat database simulasi lokal beserta akun bawaan berikut:

| Peran (*Role*) | Username | Password | Hak Akses Utama |
|---|---|---|---|
| **Operator** *(Disarankan untuk testing)* | `operator` | `Oper@WTP2026!` | Pantau P&ID, kontrol pompa/mixer/valve/backwash, acknowledge alarm, input lab |
| **Administrator** | `admin` | `Admin@WTP2026!` | Semua fitur termasuk manajemen user, mode operasi, dan simulasi fault |
| **Viewer** | `viewer` | `Viewer@WTP2026!` | Hanya melihat (*read-only*) tanpa mengubah alat |

> **Catatan Keamanan:** Kredensial di atas hanya untuk mode simulasi/testing lokal. Segera ubah kata sandi bawaan dan konfigurasi `WTP_SCADA_SECRET` apabila sistem akan digunakan di lingkungan produksi.

---

## 6. Masalah Umum & Solusinya (*Troubleshooting*)

- **Error `.\.venv\Scripts\python.exe : The term ... is not recognized` / `command not found`**
  - Pastikan Anda sudah menjalankan **Langkah 3 (Setup Pertama Kali)** untuk membuat folder `.venv` dan menginstal `requirements.txt`.
  - Pastikan posisi folder terminal Anda sudah berada di dalam folder `backend` (`cd backend`) sebelum menjalankan perintahnya.
  - Jika memakai **macOS, Linux, atau Git Bash**, gunakan `./.venv/bin/python` (bukan `.\.venv\Scripts\python.exe`).

- **Error `npm : File ... npm.ps1 cannot be loaded because running scripts is disabled on this system` (Windows PowerShell)**
  - Gunakan `npm.cmd` sebagai pengganti `npm` (contoh: `npm.cmd install` dan `npm.cmd run dev`).

- **Halaman web terbuka tetapi muncul `WS: RETRY` atau gagal login**
  - Pastikan **Terminal 1 (Backend)** sudah menyala dan tidak ditutup. Frontend membutuhkan backend di port `8000` untuk autentikasi dan streaming WebSocket.

- **Perintah `python` tidak dikenali di Windows**
  - Coba ganti `python` menjadi `py` (`py -m venv .venv`), atau jalankan ulang installer Python dan pastikan opsi **"Add python.exe to PATH"** dicentang.

---

## 7. Menjalankan Automated Tests & Build (Opsional)

### Backend (`pytest`)
```powershell
# Windows (PowerShell)
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

```bash
# macOS / Linux / Git Bash
cd backend
./.venv/bin/python -m pytest -v
```

### Frontend (`vitest` & `vite build`)
```powershell
# Windows (PowerShell) - di macOS/Linux gunakan "npm"
cd frontend
npm.cmd test
npm.cmd run build
```
