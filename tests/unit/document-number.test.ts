import { describe, expect, it } from "vitest";
import { formatDocumentNumber } from "@/lib/document-number";

describe("document number", () => {
  it("formats four-digit workspace document numbers", () => {
    expect(formatDocumentNumber("BR", 1)).toBe("BR-0001");
    expect(formatDocumentNumber("DS", 42)).toBe("DS-0042");
    expect(formatDocumentNumber("EX", 10000)).toBe("EX-10000");
  });

  it("rejects invalid prefixes and sequence values", () => {
    expect(() => formatDocumentNumber("br", 1)).toThrow();
    expect(() => formatDocumentNumber("TOOLONG", 1)).toThrow();
    expect(() => formatDocumentNumber("BR", 0)).toThrow();
    expect(() => formatDocumentNumber("BR", 1.5)).toThrow();
  });
});
