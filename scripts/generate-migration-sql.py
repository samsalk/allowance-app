#!/usr/bin/env python3
"""
One-time migration helper: turns a "Backup Data" JSON export from the old
localStorage-based app into a SQL statement that loads it into the new
Supabase `family_data` table.

Usage:
    python3 scripts/generate-migration-sql.py path/to/save-spend-share-backup-*.json

Prints a single UPDATE statement to stdout -- paste it into the Supabase
SQL editor (Project -> SQL Editor) and run it once, after the schema in
supabase/migrations/0001_family_data.sql has already been applied.
"""
import json
import sys


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    # Basic sanity check -- catches pointing this at the wrong file.
    for key in ("kids", "settings", "transactions"):
        if key not in data:
            print(f"Error: backup JSON is missing '{key}' -- is this the right file?", file=sys.stderr)
            sys.exit(1)

    # json.dumps produces valid JSON; escape single quotes for SQL string literal.
    json_text = json.dumps(data).replace("'", "''")

    print(f"""update family_data
set data = '{json_text}'::jsonb,
    version = version + 1,
    updated_at = now()
where id = 1;""")


if __name__ == "__main__":
    main()
