/** Minimal Server-Sent Events parser for fetch() streams (EventSource can't POST). */

export type SSEMessage = { event: string; data: string };

export function createSSEParser(onMessage: (msg: SSEMessage) => void) {
  let buffer = "";

  function dispatch(block: string) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      let value = i === -1 ? "" : line.slice(i + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) onMessage({ event, data: data.join("\n") });
  }

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n?/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        dispatch(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    },
    flush() {
      if (buffer.trim()) dispatch(buffer);
      buffer = "";
    },
  };
}

export async function readSSE(body: ReadableStream<Uint8Array>, onMessage: (msg: SSEMessage) => void) {
  const parser = createSSEParser(onMessage);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.flush();
}
