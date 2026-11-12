import { describe, expect, it } from "vitest";
import { parseScreenshotDataUrl } from "@/lib/image";

function svg(width: number, height = 600) {
  const content = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect width="375" height="600" fill="#fff"/></svg>';
  return "data:image/svg+xml;base64," + Buffer.from(content).toString("base64");
}

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return "data:image/png;base64," + buffer.toString("base64");
}

describe("375px 截图校验", () => {
  it("接受 375px SVG 并记录真实尺寸", () => {
    const result = parseScreenshotDataUrl(svg(375));
    expect(result.width).toBe(375);
    expect(result.height).toBe(600);
    expect(result.mimeType).toBe("image/svg+xml");
  });

  it("接受 2x 750px PNG", () => {
    const result = parseScreenshotDataUrl(png(750, 1200));
    expect(result.width).toBe(750);
    expect(result.height).toBe(1200);
  });

  it("拒绝明显不是移动端的宽图", () => {
    expect(() => parseScreenshotDataUrl(svg(1200))).toThrow(/宽度应为 375px/);
  });

  it("拒绝非法 data URL", () => {
    expect(() => parseScreenshotDataUrl("https://example.com/a.png")).toThrow(/base64/);
  });
});
