"""One-time migration: load JSON files from backend/data/ into Neon PostgreSQL.

Usage:
    DATABASE_URL="postgresql://..." uv run python scripts/migrate_to_neon.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Top-level JSON files -> DB keys
TOP_LEVEL_FILES = {
    "employees.json": "employees",
    "forms.json": "forms",
    "history.json": "history",
    "users.json": "users",
    "exchanges.json": "exchanges",
    "chat_history.json": "chat_history",
    "page_access.json": "page_access",
    "oauth_states.json": "oauth_states",
}


def migrate():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL environment variable is required")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Create table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS data_store (
            key TEXT PRIMARY KEY,
            data JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)
    conn.commit()

    migrated = 0

    # Migrate top-level files
    for filename, key in TOP_LEVEL_FILES.items():
        filepath = DATA_DIR / filename
        if filepath.exists():
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            cur.execute(
                """INSERT INTO data_store (key, data, updated_at)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()""",
                (key, json.dumps(data)),
            )
            migrated += 1
            print(f"  Migrated {filename} -> {key}")

    # Migrate assignment files: data/assignments/YYYY/MM/assignment.json
    assignments_dir = DATA_DIR / "assignments"
    if assignments_dir.exists():
        for year_dir in sorted(assignments_dir.iterdir()):
            if not year_dir.is_dir():
                continue
            for month_dir in sorted(year_dir.iterdir()):
                if not month_dir.is_dir():
                    continue
                assignment_file = month_dir / "assignment.json"
                if assignment_file.exists():
                    with open(assignment_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    key = f"assignments/{year_dir.name}-{month_dir.name}"
                    cur.execute(
                        """INSERT INTO data_store (key, data, updated_at)
                           VALUES (%s, %s, NOW())
                           ON CONFLICT (key) DO UPDATE
                               SET data = EXCLUDED.data, updated_at = NOW()""",
                        (key, json.dumps(data)),
                    )
                    migrated += 1
                    print(f"  Migrated {assignment_file.relative_to(DATA_DIR)} -> {key}")

    conn.commit()
    cur.close()
    conn.close()
    print(f"\nDone! Migrated {migrated} entries to Neon.")


if __name__ == "__main__":
    migrate()
