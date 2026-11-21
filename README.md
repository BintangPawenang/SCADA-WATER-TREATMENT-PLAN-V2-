# Industrial Water Treatment Plant (WTP) SCADA System

A modular, production-oriented SCADA platform for monitoring, visualizing, alarming, historizing, and supervising a conventional Water Treatment Plant (Process Areas A–H).

## Architecture
- **Backend (`backend/`)**: Python 3.13, FastAPI, Uvicorn, WebSocket (`/ws/telemetry`), SQLite (WAL mode), `pymodbus`, `reportlab` (PDF), `pytest`.
- **Frontend (`frontend/`)**: React 18, TypeScript, Vite, custom SVG P&ID (ISO 10628-2 / ISA-5.1) & Historian Trend Charts.
- **Configuration & Docs (`backend/config/plant_config.yaml`, `docs/`)**: Configurable process areas A–H, water quality limits, and commissioning documentation.

## Running Locally

### 1. Start Backend
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Start Frontend
```powershell
cd frontend
npm.cmd run dev
```
Open `http://localhost:5173` in your browser.

### 3. Running Tests
```powershell
# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest -v

# Frontend
cd frontend
npm.cmd test
npm.cmd run build
```
