"""The learning engine's rules (PRD §5.2, §6, §8), tested as pure functions and through the API."""

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.learning import (
    TRACKS,
    Past,
    TopicLite,
    completion_rate,
    level_for,
    load_curriculum,
    select_topic,
    streaks,
)
from tests.helpers import events

D = date(2026, 9, 25)
TOPICS = [TopicLite(t["id"], t["category"]) for t in load_curriculum()]


def day(n: int) -> date:
    return D - timedelta(days=n)


# ---------- Curriculum ----------


def test_curriculum_is_the_imported_learning_log() -> None:
    topics = load_curriculum()
    assert len(topics) == 56
    assert {t["category"] for t in topics} == set(TRACKS)
    assert all(t["title"] and t["blurb"] and len(t["explore"]) <= 3 for t in topics)
    assert not any("http" in e for t in topics for e in t["explore"])  # content honesty: no links


# ---------- Selection ----------


def test_first_day_starts_the_first_track_in_order() -> None:
    assert select_topic(TOPICS, [], TRACKS, D) == TopicLite("dsa-01", "dsa")


def test_only_enabled_tracks() -> None:
    for _ in range(3):
        t = select_topic(TOPICS, [], ["system-design"], D)
        assert t is not None and t.category == "system-design"


def test_never_same_track_two_days_running() -> None:
    history = [Past(day(1), "dsa-01", "dsa")]
    t = select_topic(TOPICS, history, ["dsa", "system-design"], D)
    assert t is not None and t.category == "system-design"


def test_no_repeats_within_60_days_then_least_recently_used() -> None:
    dsa = [t for t in TOPICS if t.category == "dsa"]
    history = [Past(day(i + 1), t.id, "dsa") for i, t in enumerate(dsa)]  # all used recently
    t = select_topic(TOPICS, history, ["dsa"], D)
    assert t is not None and t.id == dsa[-1].id  # oldest use: least recently used
    fresh_history = history[:-1]
    t2 = select_topic(TOPICS, fresh_history, ["dsa"], D)
    assert t2 is not None and t2.id == dsa[-1].id  # the one never used


def test_real_world_appears_at_least_every_four_days() -> None:
    history = [
        Past(day(1), "dsa-01", "dsa"),
        Past(day(2), "sysdesign-01", "system-design"),
        Past(day(3), "lang-01", "lang-depth"),
    ]
    t = select_topic(TOPICS, history, TRACKS, D)
    assert t is not None and t.category == "real-world"


def test_least_covered_track_wins_for_breadth() -> None:
    history = [Past(day(i), f"x{i}", "dsa") for i in range(2, 8)] + [Past(day(1), "real-01", "real-world")]
    t = select_topic(TOPICS, history, ["dsa", "system-design", "real-world"], D)
    assert t is not None and t.category == "system-design"


def test_swap_excludes_current_topic() -> None:
    first = select_topic(TOPICS, [], ["dsa"], D)
    assert first is not None
    second = select_topic(TOPICS, [], ["dsa"], D, exclude={first.id})
    assert second is not None and second.id != first.id


def test_no_topics_returns_none() -> None:
    assert select_topic([], [], TRACKS, D) is None


# ---------- Streaks, rates, levels ----------


def test_streak_rules() -> None:
    assert streaks([], D) == (0, 0)
    assert streaks([D], D) == (1, 1)
    assert streaks([day(1), day(2)], D) == (2, 2)  # today not done yet: streak still alive
    assert streaks([day(2), day(3)], D) == (0, 2)  # skipped yesterday: reset
    assert streaks([D, day(1), day(5), day(6), day(7)], D) == (2, 3)


def test_completion_rate_ignores_days_before_signup() -> None:
    assert completion_rate({D, day(1)}, D, 30, since=day(1)) == 1.0
    assert completion_rate({D}, D, 7) == pytest.approx(1 / 7)


def test_levels() -> None:
    assert level_for(0)["level"] == 1
    assert level_for(49)["level"] == 1
    assert level_for(50)["level"] == 2
    lv = level_for(200)
    assert lv["level"] == 3 and lv["title"] == "Builder" and 0 < lv["progress"] < 1


# ---------- API ----------


def test_today_assigns_once_and_is_stable(client: TestClient) -> None:
    a = client.get("/api/learn/today").json()
    b = client.get("/api/learn/today").json()
    assert a["assignment"]["id"] == b["assignment"]["id"]
    assert a["assignment"]["source"] == "auto"
    assert a["streak"] == 0


def test_complete_with_note_then_no_swap(client: TestClient) -> None:
    client.get("/api/learn/today")
    done = client.post("/api/learn/today/complete", json={"note": "Two pointers beat nested loops."}).json()
    assert done["completed"] and done["note"].startswith("Two pointers")
    assert client.post("/api/learn/today/complete", json={}).status_code == 409
    assert client.post("/api/learn/today/swap").status_code == 409
    t = client.get("/api/learn/today").json()
    assert t["streak"] == 1 and t["longest"] == 1


def test_swap_changes_topic(client: TestClient) -> None:
    first = client.get("/api/learn/today").json()["assignment"]
    swapped = client.post("/api/learn/today/swap").json()
    assert swapped["id"] == first["id"] and swapped["topic_id"] != first["topic_id"]


def test_queue_goes_first_and_is_consumed(client: TestClient) -> None:
    client.post("/api/learn/queue", json={"title": "Learn Redis pub/sub", "blurb": "Fan-out messaging"})
    client.post("/api/learn/queue", json={"title": "learn redis PUB/SUB"})  # duplicate: no-op
    assert len(client.get("/api/learn/queue").json()) == 1
    today = client.get("/api/learn/today").json()
    assert today["assignment"]["title"] == "Learn Redis pub/sub"
    assert today["assignment"]["category"] == "custom" and today["assignment"]["source"] == "queue"
    assert client.get("/api/learn/queue").json() == []


def test_swapping_a_queued_topic_puts_it_back(client: TestClient) -> None:
    client.post("/api/learn/queue", json={"title": "Consistent hashing"})
    client.get("/api/learn/today")
    swapped = client.post("/api/learn/today/swap").json()
    assert swapped["source"] == "auto"
    assert [q["title"] for q in client.get("/api/learn/queue").json()] == ["Consistent hashing"]


def test_interview_weak_spot_can_be_queued(client: TestClient) -> None:
    from tests.helpers import create

    sid = create(client)
    r = client.post(
        "/api/learn/queue",
        json={"title": "Quantify impact in answers", "source": "interview", "session_id": sid},
    )
    assert r.status_code == 201 and r.json()["session_id"] == sid
    assert client.get("/api/learn/today").json()["assignment"]["source"] == "interview"


def test_preferences_validation(client: TestClient) -> None:
    assert client.get("/api/learn/preferences").json()["focus_areas"] == TRACKS
    r = client.put("/api/learn/preferences", json={"focus_areas": ["real-world", "dsa"]})
    assert r.json()["focus_areas"] == ["dsa", "real-world"]  # canonical order
    assert client.put("/api/learn/preferences", json={"focus_areas": []}).status_code == 422
    assert client.put("/api/learn/preferences", json={"focus_areas": ["cooking"]}).status_code == 422


def test_lesson_is_streamed_cached_and_checkable(client: TestClient) -> None:
    client.get("/api/learn/today")
    assert client.post("/api/learn/today/check").status_code == 409  # no lesson yet
    body = client.post("/api/learn/today/lesson").text
    names = [n for n, _ in events(body)]
    assert "progress" in names and names[-1] == "result"
    lesson: dict[str, Any] = events(body)[-1][1]
    assert len(lesson["check"]) == 3
    assert events(client.post("/api/learn/today/lesson").text) == [("result", lesson)]  # cached, free
    assert client.post("/api/learn/today/check").json()["check_done"]


def test_history_stats_and_progress(client: TestClient) -> None:
    client.get("/api/learn/today")
    client.post("/api/learn/today/complete", json={"note": "noted"})
    hist = client.get("/api/learn/history").json()
    assert len(hist) == 1 and hist[0]["completed"]
    stats = client.get("/api/learn/stats").json()
    assert stats["total"] == 1 and stats["streak"] == 1 and stats["rate_7"] == 1.0
    assert sum(stats["by_category"].values()) == 1
    p = client.get("/api/progress").json()
    assert p["learned_total"] == 1 and p["level"]["xp"] == 15  # learned 10 + reflection 5
    assert len(p["calendar"]) == 84 and p["calendar"][-1]["learned"]


def test_learning_data_is_private(client: TestClient, other: TestClient) -> None:
    client.post("/api/learn/queue", json={"title": "Secret topic"})
    item = client.get("/api/learn/queue").json()[0]
    assert other.get("/api/learn/queue").json() == []
    other.delete(f"/api/learn/queue/{item['id']}")
    assert len(client.get("/api/learn/queue").json()) == 1


def test_internal_job_assigns_everyone_and_is_idempotent(client: TestClient, other: TestClient) -> None:
    assert client.post("/internal/assign-daily").status_code == 404
    assert client.post("/internal/assign-daily", headers={"X-Internal-Token": "wrong"}).status_code == 404
    first = client.post("/internal/assign-daily", headers={"X-Internal-Token": "test-internal-token"}).json()
    assert first == {"status": "ok", "assigned": 2, "existing": 0, "failed": 0}
    again = client.post("/internal/assign-daily", headers={"X-Internal-Token": "test-internal-token"}).json()
    assert again["assigned"] == 0 and again["existing"] == 2


def test_queue_reorder_changes_what_comes_next(client: TestClient) -> None:
    for t in ["First", "Second", "Third"]:
        client.post("/api/learn/queue", json={"title": t})
    items = client.get("/api/learn/queue").json()
    assert [q["title"] for q in items] == ["First", "Second", "Third"]
    ids = {q["title"]: q["id"] for q in items}
    r = client.put("/api/learn/queue/order", json={"ids": [ids["Third"], ids["First"]]})
    assert [q["title"] for q in r.json()] == ["Third", "First", "Second"]
    assert client.get("/api/learn/today").json()["assignment"]["title"] == "Third"
    client.post("/api/learn/queue", json={"title": "Fourth"})
    assert [q["title"] for q in client.get("/api/learn/queue").json()] == ["First", "Second", "Fourth"]


def test_queue_reorder_ignores_other_users_ids(client: TestClient, other: TestClient) -> None:
    client.post("/api/learn/queue", json={"title": "Mine"})
    other.post("/api/learn/queue", json={"title": "Theirs"})
    theirs = other.get("/api/learn/queue").json()[0]["id"]
    r = client.put("/api/learn/queue/order", json={"ids": [theirs]})
    assert [q["title"] for q in r.json()] == ["Mine"]
