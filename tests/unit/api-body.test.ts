import { describe, expect, it } from "vitest";
import { z } from "zod";
import { body, MAX_JSON_BODY_BYTES } from "@/lib/api";

const schema = z.object({ ok: z.boolean() });

describe("API JSON body", () => {
  it("parses a bounded JSON request", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ ok: true }) });
    await expect(body(request, schema)).resolves.toEqual({ ok: true });
  });

  it("rejects a declared oversized request before parsing", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
    });
    await expect(body(request, schema)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: "{" });
    await expect(body(request, schema)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });
});
