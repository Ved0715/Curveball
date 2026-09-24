from app.interview import FORCED_CLOSING, apply_reply, closes_too_early, plan_for
from app.schemas import InterviewState, Setup, Turn, TurnKind, TurnRequest


def req(main_asked: int = 0, followup_used: bool = False, n: int = 4, started: bool = True) -> TurnRequest:
    transcript = (
        [Turn(speaker="interviewer", text="Q", kind="question"), Turn(speaker="candidate", text="A")]
        if started
        else []
    )
    return TurnRequest(
        setup=Setup(role="Backend Engineer", question_count=n),
        interviewer="Priya",
        transcript=transcript,
        state=InterviewState(main_asked=main_asked, followup_used=followup_used),
    )


def test_first_turn_introduces_interviewer() -> None:
    assert "Priya" in plan_for(req(started=False))


def test_question_increments_count_and_resets_followup() -> None:
    t = apply_reply("question", " Next? ", req(main_asked=1, followup_used=True))
    assert t.kind == "question"
    assert t.say == "Next?"
    assert t.state == InterviewState(main_asked=2, followup_used=False, done=False)


def test_only_one_followup_per_question() -> None:
    first = apply_reply("followup", "Why?", req(main_asked=1))
    assert first.kind == "followup" and first.state.followup_used
    second = apply_reply("followup", "And why?", req(main_asked=1, followup_used=True))
    assert second.kind == "question"
    assert second.state.main_asked == 2


def test_followup_not_allowed_as_first_turn() -> None:
    t = apply_reply("followup", "Hi", req(started=False))
    assert t.kind == "question" and t.state.main_asked == 1


def test_never_more_than_n_main_questions() -> None:
    t = apply_reply("question", "One more?", req(main_asked=4, n=4))
    assert t.kind == "closing"
    assert t.say == FORCED_CLOSING
    assert t.state.done


def test_one_followup_allowed_after_last_question_then_close() -> None:
    fu = apply_reply("followup", "Numbers?", req(main_asked=4, n=4))
    assert fu.kind == "followup" and not fu.state.done
    after = apply_reply("clarify", "Sure, I meant…", req(main_asked=4, followup_used=True, n=4))
    assert after.kind == "closing" and after.state.done


def test_plan_forces_closing_when_everything_is_used() -> None:
    assert '"closing"' in plan_for(req(main_asked=4, followup_used=True, n=4))


def test_early_closing_is_detected() -> None:
    kinds: list[tuple[TurnKind, int, bool]] = [
        ("closing", 2, True),
        ("closing", 4, False),
        ("question", 1, False),
    ]
    for kind, asked, expected in kinds:
        assert closes_too_early(kind, req(main_asked=asked, n=4)) is expected
