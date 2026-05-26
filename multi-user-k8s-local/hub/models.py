from datetime import datetime, timezone

import aiosqlite

from config import settings


async def init_db() -> None:
    """Create the users table if it does not already exist."""
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def create_user(username: str, hashed_password: str) -> dict:
    """
    Insert a new user record and return the created user dict.
    Raises ValueError if the username is already taken.
    """
    now = datetime.now(timezone.utc).isoformat()
    try:
        async with aiosqlite.connect(settings.db_path) as db:
            cursor = await db.execute(
                "INSERT INTO users (username, hashed_password, created_at) VALUES (?, ?, ?)",
                (username, hashed_password, now),
            )
            await db.commit()
            user_id = cursor.lastrowid
    except aiosqlite.IntegrityError as exc:
        raise ValueError(f"Username '{username}' is already taken.") from exc

    return {
        "id": user_id,
        "username": username,
        "hashed_password": hashed_password,
        "created_at": now,
    }


async def get_user_by_username(username: str) -> dict | None:
    """Return a user dict for the given username, or None if not found."""
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username, hashed_password, created_at FROM users WHERE username = ?",
            (username,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)