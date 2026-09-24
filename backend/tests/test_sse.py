from app.sse import event, partial_json_string


def test_event_format() -> None:
    assert event("say", {"text": "hi"}) == 'event: say\ndata: {"text": "hi"}\n\n'


def test_partial_string_not_started() -> None:
    assert partial_json_string('{"kind":"question"', "say") is None


def test_partial_string_in_progress_and_complete() -> None:
    assert partial_json_string('{"kind":"question","say":"Tell me ab', "say") == "Tell me ab"
    assert partial_json_string('{"say": "Done.", "kind": "closing"}', "say") == "Done."


def test_partial_string_escapes() -> None:
    assert partial_json_string(r'{"say":"He said \"hi\"\nok', "say") == 'He said "hi"\nok'
    assert partial_json_string(r'{"say":"café', "say") == "café"
    # incomplete escapes are held back until the rest arrives
    assert partial_json_string('{"say":"a\\', "say") == "a"
    assert partial_json_string(r'{"say":"a\u00', "say") == "a"
