import { afterEach, describe, expect, it, vi } from "vitest";
import { getToday, setUnauthorizedHandler, streamReport, streamTurn } from "@/lib/api";
import { ApiError } from "@/lib/errors";

function sseResponse(events: [string, unknown][], status = 200) {
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), { status, headers: { "Content-Type": "text/event-stream" } });
}

const noop = { say: () => {}, reset: () => {} };

afterEach(() => vi.unstubAllGlobals());

describe("streamTurn", () => {
  it("streams words, then returns the validated turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          ["say", { text: "Hi" }],
          ["reset", {}],
          ["say", { text: "Hello there" }],
          ["result", { kind: "question", say: "Hello there", state: { main_asked: 1, followup_used: false, done: false } }],
        ]),
      ),
    );
    const said: string[] = [];
    let resets = 0;
    const r = await streamTurn("s1", null, { say: (t: string) => said.push(t), reset: () => resets++ });
    expect(said).toEqual(["Hi", "Hello there"]);
    expect(resets).toBe(1);
    expect(r.state.main_asked).toBe(1);
  });

  it("turns a stream error event into an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([["error", { code: "rate_limited", retryable: true }]])));
    await expect(streamTurn("s1", null, noop)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("rejects a result that fails the Zod schema", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([["result", { kind: "shout", say: "" }]])));
    await expect(streamTurn("s1", null, noop)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("maps HTTP error details and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: "interview_over" } }), { status: 409 })),
    );
    await expect(streamTurn("s1", null, noop)).rejects.toMatchObject({
      code: "interview_over",
    });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await streamTurn("s1", null, noop).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("network");
  });
});

describe("request details", () => {
  it("posts the answer to our own origin with the session cookie", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      sseResponse([["result", { kind: "question", say: "Next?", state: { main_asked: 2, followup_used: false, done: false } }]]),
    );
    vi.stubGlobal("fetch", fetchMock);
    await streamTurn("abc", { answer: "My answer", answer_seconds: 42 }, noop);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sessions/abc/turn");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ answer: "My answer", answer_seconds: 42 });
  });

  it("sends the user to login on a 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: { code: "no_session" } }), { status: 401 })),
    );
    await expect(getToday()).rejects.toMatchObject({ code: "no_session" });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    setUnauthorizedHandler(null);
  });
});

describe("streamReport", () => {
  it("reports progress and validates the report", async () => {
    const report = {
      overall: 62,
      verdict: "Borderline",
      summary: "ok",
      scores: { Content: 6, Structure: 7, Specificity: 4, Communication: 7, "Role fit": 6 },
      strengths: ["a"],
      fixes: [{ issue: "i", how: "h" }],
      answers: [{ question: "q", score: 5, worked: "w", missing: "m", better: "b" }],
      drills: ["d"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          ["stage", { stage: "resume" }],
          ["stage", { stage: "scoring" }],
          ["progress", { chars: 120 }],
          ["result", report],
        ]),
      ),
    );
    const progress: number[] = [];
    const stages: string[] = [];
    const r = await streamReport("s1", { progress: (c) => progress.push(c), stage: (st) => stages.push(st) });
    expect(progress).toEqual([120]);
    expect(stages).toEqual(["resume", "scoring"]);
    expect(r.scores["Role fit"]).toBe(6);
  });
});
