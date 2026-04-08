import os
import psycopg2
from psycopg2 import sql
import json

# আপনার ডাটাবেস URL
DATABASE_URL = "postgresql://postgres:password@helium/heliumdb?sslmode=disable"

def backup_db():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # সব টেবিলের নাম খুঁজে বের করা
        cur.execute("""SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public'""")
        tables = cur.fetchall()

        db_data = {}

        for table in tables:
            table_name = table[0]
            cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table_name)))
            rows = cur.fetchall()
            # কলামের নাম পাওয়া
            colnames = [desc[0] for desc in cur.description]
            db_data[table_name] = [dict(zip(colnames, row)) for row in rows]

        # JSON ফাইল হিসেবে সেভ করা
        with open('database_dump.json', 'w') as f:
            json.dump(db_data, f, indent=4, default=str)

        print("Success! database_dump.json ফাইলটি তৈরি হয়েছে।")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    backup_db()