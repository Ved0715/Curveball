import { describe, expect, it } from "vitest";
import { createSSEParser, type SSEMessage } from "@/lib/sse";

function parse(chunks: string[]) {
  const out: SSEMessage[] = [];
  const p = createSSEParser((m) => out.push(m));
  chunks.forEach((c) => p.push(c));
  p.flush();
  return out;
}

describe("createSSEParser", () => {
  it("parses complete events", () => {
    expect(parse(['event: say\ndata: {"text":"Hi"}\n\n'])).toEqual([{ event: "say", data: '{"text":"Hi"}' }]);
  });

  it("handles events split across chunks", () => {
    expect(parse(["event: res", 'ult\ndata: {"a"', ":1}\n", "\n"])).toEqual([{ event: "result", data: '{"a":1}' }]);
  });

  it("handles CRLF, comments, multi-line data and a trailing event without blank line", () => {
    const out = parse([": ping\r\n\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\ndata: last"]);
    expect(out).toEqual([
      { event: "x", data: "a\nb" },
      { event: "message", data: "last" },
    ]);
  });
});
