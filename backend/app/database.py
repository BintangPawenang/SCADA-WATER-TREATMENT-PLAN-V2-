from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Generator


class Database:
    def __init__(self, db_path: str = "data/scada.db") -> None:
        self.db_path = db_path
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        self._init_schema()

    @contextmanager
    def connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_login TEXT
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    username TEXT NOT NULL,
                    role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target TEXT NOT NULL,
                    result TEXT NOT NULL,
                    details TEXT
                );

                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    process_area TEXT NOT NULL,
                    category TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    description TEXT NOT NULL,
                    state TEXT NOT NULL,
                    active INTEGER NOT NULL,
                    acknowledged INTEGER NOT NULL DEFAULT 0,
                    shelved INTEGER NOT NULL DEFAULT 0,
                    shelved_until TEXT,
                    shelve_reason TEXT,
                    ack_user TEXT,
                    ack_time TEXT,
                    raised_at TEXT NOT NULL,
                    cleared_at TEXT,
                    value_at_raise TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_alarms_active ON alarms(active, state);
                CREATE INDEX IF NOT EXISTS idx_alarms_source ON alarms(source, raised_at);

                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    source TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    description TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'INFO'
                );
                CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp);

                CREATE TABLE IF NOT EXISTS historian_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tag_name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    value REAL,
                    raw_value TEXT,
                    quality TEXT NOT NULL,
                    simulated INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_hist_tag_ts ON historian_samples(tag_name, timestamp);

                CREATE TABLE IF NOT EXISTS equipment_runtime (
                    equipment_id TEXT PRIMARY KEY,
                    runtime_hours REAL NOT NULL DEFAULT 0.0,
                    start_count INTEGER NOT NULL DEFAULT 0,
                    stop_count INTEGER NOT NULL DEFAULT 0,
                    last_state TEXT,
                    last_state_change TEXT,
                    maintenance_note TEXT
                );

                CREATE TABLE IF NOT EXISTS maintenance_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    equipment_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    entry_type TEXT NOT NULL,
                    description TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS lab_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parameter TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    sample_id TEXT NOT NULL,
                    sample_point TEXT NOT NULL,
                    analyst TEXT NOT NULL,
                    sampled_at TEXT NOT NULL,
                    entered_at TEXT NOT NULL,
                    notes TEXT
                );
                """
            )
