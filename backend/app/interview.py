"""Interview state machine (prototype: interviewerTurn + interviewerPrompt).

Rules enforced here, never left to the model:
- at most one follow-up per main question;
- the interview has exactly `question_count` main questions;
- after the last main question: at most one follow-up, then a forced closing.
"""

from dataclasses import dataclass

from app.schemas import InterviewState, TurnKind, TurnRequest

FORCED_CLOSING = "Great, that's all the questions I have. Thanks for your time today."


def plan_for(req: TurnRequest) -> str:
    """What the interviewer should do next, in plain words for the prompt."""
    n = req.setup.question_count
    k = req.state.main_asked
    fu = req.state.followup_used
    if not req.transcript:
        return (
            "Start the interview now: greet the candidate warmly in one short sentence, introduce yourself as "
            f'{req.interviewer}, then ask your first main question (kind "question").'
        )
    if k >= n:
        if fu:
            return (
                "All main questions are done. Close the interview now: thank the candidate briefly and tell them "
                'that\'s the end of the session (kind "closing").'
            )
        return (
            "All main questions have been asked. Either ask ONE follow-up on the last answer if it clearly needs "
            'probing (kind "followup"), or close the interview (kind "closing").'
        )
    if fu:
        return (
            f'Move on to main question {k + 1} of {n} (kind "question"). '
            "Do not ask another follow-up on the previous topic."
        )
    return (
        'Either ask ONE follow-up on the last answer (kind "followup") if it was vague, generic, missing their '
        "personal role, missing results/numbers, or skipped part of the question, or move on to main question "
        f'{k + 1} of {n} (kind "question").'
    )


def closes_too_early(kind: TurnKind, req: TurnRequest) -> bool:
    """The model tried to end the interview before all main questions were asked."""
    return kind == "closing" and req.state.main_asked < req.setup.question_count


@dataclass(frozen=True)
class AppliedTurn:
    kind: TurnKind
    say: str
    state: InterviewState


def apply_reply(kind: TurnKind, say: str, req: TurnRequest) -> AppliedTurn:
    """Take the model's proposed turn and make it obey the rules."""
    n = req.setup.question_count
    main_asked = req.state.main_asked
    followup_used = req.state.followup_used

    if kind == "followup" and (followup_used or not req.transcript):
        kind = "question"

    if kind == "question":
        if main_asked >= n:
            kind, say = "closing", FORCED_CLOSING
        else:
            main_asked += 1
            followup_used = False
    elif kind == "followup":
        followup_used = True
    elif kind == "clarify" and main_asked >= n and followup_used:
        # Past the end of the interview; don't let it drift on.
        kind, say = "closing", FORCED_CLOSING

    return AppliedTurn(
        kind=kind,
        say=say.strip(),
        state=InterviewState(main_asked=main_asked, followup_used=followup_used, done=kind == "closing"),
    )
