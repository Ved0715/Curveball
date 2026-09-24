"""Server-Sent Events helpers and a tolerant reader for a JSON string still being streamed."""

import contextlib
import json
import re
from typing import Any


def event(name: str, data: Any) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def partial_json_string(buffer: str, key: str) -> str | None:
    """Return the decoded value of `"key": "...` from incomplete JSON, or None if not started.

    Lets us show the interviewer's words as they stream, before the JSON is finished.
    """
    m = re.search(r'"' + re.escape(key) + r'"\s*:\s*"', buffer)
    if not m:
        return None
    raw = buffer[m.end() :]
    out: list[str] = []
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch == '"':
            break
        if ch == "\\":
            if i + 1 >= len(raw):
                break  # escape sequence not finished yet
            nxt = raw[i + 1]
            if nxt == "u":
                if i + 6 > len(raw):
                    break
                with contextlib.suppress(ValueError):
                    out.append(chr(int(raw[i + 2 : i + 6], 16)))
                i += 6
                continue
            out.append({"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f"}.get(nxt, nxt))
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)
