"""PostgreSQL adapter for cloud deployment (Neon).

When DATABASE_URL is set, all JSON file storage is redirected to a single
JSONB table in PostgreSQL. This module provides the low-level DB operations.
"""

import json
import logging
from threading import Lock

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from .config import settings

logger = logging.getLogger(__name__)

_pool: SimpleConnectionPool | None = None
_pool_lock = Lock()

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS data_store (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);
"""


def get_pool() -> SimpleConnectionPool:
    """Return a lazily-initialised connection pool (thread-safe singleton)."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = SimpleConnectionPool(
                    minconn=1,
                    maxconn=5,
                    dsn=settings.database_url,
                )
    return _pool


def init_db() -> None:
    """Create the data_store table if it doesn't exist."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(_CREATE_TABLE)
        conn.commit()
        logger.info("Database initialised (data_store table ready)")
    finally:
        pool.putconn(conn)


def db_load(key: str) -> dict | list:
    """Load a JSONB value by key. Returns empty dict if not found."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT data FROM data_store WHERE key = %s", (key,)
            )
            row = cur.fetchone()
        return row["data"] if row else {}
    finally:
        pool.putconn(conn)


def db_save(key: str, data: dict | list) -> None:
    """Upsert a JSONB value by key."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO data_store (key, data, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (key) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                """,
                (key, json.dumps(data)),
            )
        conn.commit()
    finally:
        pool.putconn(conn)


def db_exists(key: str) -> bool:
    """Check whether a key exists in data_store."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM data_store WHERE key = %s", (key,)
            )
            return cur.fetchone() is not None
    finally:
        pool.putconn(conn)


def db_list_keys(prefix: str) -> list[str]:
    """Return all keys that start with *prefix*."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT key FROM data_store WHERE key LIKE %s",
                (prefix + "%",),
            )
            return [row[0] for row in cur.fetchall()]
    finally:
        pool.putconn(conn)


def db_delete(key: str) -> None:
    """Delete a row by key."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM data_store WHERE key = %s", (key,))
        conn.commit()
    finally:
        pool.putconn(conn)
