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

# Max retries for transient connection errors (SSL reset, idle timeout).
_MAX_RETRIES = 2

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS data_store (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);
"""


def _is_connection_error(exc: Exception) -> bool:
    """Return True for errors caused by a stale/broken connection."""
    msg = str(exc).lower()
    return any(s in msg for s in (
        "ssl connection has been closed",
        "connection reset",
        "server closed the connection",
        "could not receive data",
        "connection timed out",
        "terminating connection",
    ))


def _reset_pool() -> None:
    """Close the existing pool so next call to get_pool() creates a fresh one."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            try:
                _pool.closeall()
            except Exception:
                pass
            _pool = None


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
    for attempt in range(_MAX_RETRIES + 1):
        pool = get_pool()
        conn = pool.getconn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT data FROM data_store WHERE key = %s", (key,)
                )
                row = cur.fetchone()
            return row["data"] if row else {}
        except psycopg2.OperationalError as e:
            pool.putconn(conn, close=True)
            conn = None
            if attempt < _MAX_RETRIES and _is_connection_error(e):
                logger.warning("DB connection lost (attempt %d), reconnecting: %s", attempt + 1, e)
                _reset_pool()
                continue
            raise
        finally:
            if conn is not None:
                pool.putconn(conn)


def db_save(key: str, data: dict | list) -> None:
    """Upsert a JSONB value by key."""
    for attempt in range(_MAX_RETRIES + 1):
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
            return
        except psycopg2.OperationalError as e:
            pool.putconn(conn, close=True)
            conn = None
            if attempt < _MAX_RETRIES and _is_connection_error(e):
                logger.warning("DB connection lost (attempt %d), reconnecting: %s", attempt + 1, e)
                _reset_pool()
                continue
            raise
        finally:
            if conn is not None:
                pool.putconn(conn)


def db_exists(key: str) -> bool:
    """Check whether a key exists in data_store."""
    for attempt in range(_MAX_RETRIES + 1):
        pool = get_pool()
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM data_store WHERE key = %s", (key,)
                )
                return cur.fetchone() is not None
        except psycopg2.OperationalError as e:
            pool.putconn(conn, close=True)
            conn = None
            if attempt < _MAX_RETRIES and _is_connection_error(e):
                logger.warning("DB connection lost (attempt %d), reconnecting: %s", attempt + 1, e)
                _reset_pool()
                continue
            raise
        finally:
            if conn is not None:
                pool.putconn(conn)


def db_list_keys(prefix: str) -> list[str]:
    """Return all keys that start with *prefix*."""
    for attempt in range(_MAX_RETRIES + 1):
        pool = get_pool()
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key FROM data_store WHERE key LIKE %s",
                    (prefix + "%",),
                )
                return [row[0] for row in cur.fetchall()]
        except psycopg2.OperationalError as e:
            pool.putconn(conn, close=True)
            conn = None
            if attempt < _MAX_RETRIES and _is_connection_error(e):
                logger.warning("DB connection lost (attempt %d), reconnecting: %s", attempt + 1, e)
                _reset_pool()
                continue
            raise
        finally:
            if conn is not None:
                pool.putconn(conn)


def db_delete(key: str) -> None:
    """Delete a row by key."""
    for attempt in range(_MAX_RETRIES + 1):
        pool = get_pool()
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM data_store WHERE key = %s", (key,))
            conn.commit()
            return
        except psycopg2.OperationalError as e:
            pool.putconn(conn, close=True)
            conn = None
            if attempt < _MAX_RETRIES and _is_connection_error(e):
                logger.warning("DB connection lost (attempt %d), reconnecting: %s", attempt + 1, e)
                _reset_pool()
                continue
            raise
        finally:
            if conn is not None:
                pool.putconn(conn)
