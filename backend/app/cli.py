"""Admin commands.

    uv run python -m app.cli sync-curriculum
    uv run python -m app.cli import-learning-log --email you@example.com [--dir .imports]

import-learning-log brings a Learning Log artifact export (days/*.json, prefs.json) into an
existing account, so the history and streak carry over (PRD §17 cutover). Existing days in
the account are kept; imported days fill the gaps. Safe to run twice.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import select

from app import auth, learning
from app.db import get_engine, get_sessionmaker
from app.models import Assignment, QueueItem, Topic


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


async def sync_curriculum() -> None:
    async with get_sessionmaker()() as db:
        print(f"curriculum: {await learning.sync_curriculum(db)} topic(s) added or updated")


async def import_learning_log(email: str, folder: Path) -> None:
    async with get_sessionmaker()() as db:
        await learning.sync_curriculum(db)
        user = await auth.find_user(db, email)
        if user is None:
            sys.exit(f"No account for {email}. Sign up in the app first, then re-run.")
        topic_ids = set(await db.scalars(select(Topic.id)))

        prefs_file = folder / "prefs.json"
        if prefs_file.exists():
            raw = json.loads(prefs_file.read_text())
            raw = raw.get("data", raw)
            focus = [t for t in learning.TRACKS if t in set(raw.get("focusAreas") or [])] or list(
                learning.TRACKS
            )
            prefs = await learning.preferences(db, user.id)
            prefs.focus_areas = focus
            for item in raw.get("customQueue") or []:
                db.add(
                    QueueItem(
                        user_id=user.id,
                        title=item["title"][:200],
                        blurb=item.get("blurb") or "",
                        position=await learning.next_queue_position(db, user.id),
                    )
                )
                await db.flush()
            print(f"preferences: focus areas {focus}, {len(raw.get('customQueue') or [])} queued topic(s)")

        added = skipped = 0
        for f in sorted((folder / "days").glob("*.json")):
            raw = json.loads(f.read_text())
            d = raw.get("data", raw)
            day = date.fromisoformat(d["date"])
            if await learning.assignment_for(db, user.id, day) is not None:
                skipped += 1
                continue
            source = "queue" if d.get("source") == "custom" else "auto"
            tid = d.get("topicId") if d.get("topicId") in topic_ids else None
            db.add(
                Assignment(
                    user_id=user.id,
                    date=day,
                    topic_id=tid,
                    category=d["category"],
                    title=d["title"],
                    blurb=d.get("blurb") or "",
                    explore=d.get("explore") or [],
                    source=source,
                    completed=bool(d.get("completed")),
                    assigned_at=_dt(d.get("assignedAt")) or datetime.now(UTC),
                    completed_at=_dt(d.get("completedAt")),
                )
            )
            added += 1
        await db.commit()
        print(f"days: {added} imported, {skipped} already present")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sync-curriculum")
    imp = sub.add_parser("import-learning-log")
    imp.add_argument("--email", required=True)
    imp.add_argument("--dir", default=".imports", type=Path)
    args = ap.parse_args()

    async def run() -> None:
        try:
            if args.cmd == "sync-curriculum":
                await sync_curriculum()
            else:
                await import_learning_log(args.email, args.dir)
        finally:
            await get_engine().dispose()

    asyncio.run(run())


if __name__ == "__main__":
    main()
