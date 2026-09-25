import asyncio
import json
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app import cli
from app.learning import local_today


def test_import_learning_log(client: TestClient, tmp_path: Path) -> None:
    today = client.get("/api/auth/me").json()  # signed in as asha@example.com
    (tmp_path / "days").mkdir()
    from app.models import User

    user = User(email=today["email"], password_hash="", name="", timezone=today["timezone"])
    t = local_today(user)
    for offset, done, title in [(1, True, "Arrays & the two-pointer pattern"), (2, True, "HTTP caching")]:
        d = t - timedelta(days=offset)
        (tmp_path / "days" / f"{d}.json").write_text(
            json.dumps(
                {
                    "date": d.isoformat(),
                    "topicId": "dsa-01" if offset == 1 else "not-a-topic",
                    "title": title,
                    "category": "dsa" if offset == 1 else "fundamentals",
                    "blurb": "b",
                    "explore": [],
                    "completed": done,
                    "assignedAt": "2026-09-20T06:30:00.000Z",
                    "completedAt": "2026-09-20T08:00:00.000Z",
                    "source": "auto",
                }
            )
        )
    (tmp_path / "prefs.json").write_text(
        json.dumps({"focusAreas": ["dsa", "real-world"], "customQueue": [{"title": "Redis pub/sub"}]})
    )

    asyncio.run(cli.import_learning_log(today["email"], tmp_path))

    stats = client.get("/api/learn/stats").json()
    assert stats["total"] == 2 and stats["streak"] == 2  # yesterday + day before: streak carries over
    assert client.get("/api/learn/preferences").json()["focus_areas"] == ["dsa", "real-world"]
    assert [q["title"] for q in client.get("/api/learn/queue").json()] == ["Redis pub/sub"]
