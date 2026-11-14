import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { imageSize, parseScreenshotDataUrl, prepareScreenshotDataUrl } from "@/lib/image";

function dataUrl(mimeType: string, buffer: Buffer) {
  return "data:" + mimeType + ";base64," + buffer.toString("base64");
}

function svg(width: number, height = 600) {
  return dataUrl(
    "image/svg+xml",
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect width="' + width + '" height="' + height + '" fill="#fff"/></svg>'),
  );
}

async function solidPng(width: number, height: number, background = "#f4efe5") {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

describe("截图识别与自动适配", () => {
  it("接受 375px SVG 并记录真实尺寸", () => {
    const result = parseScreenshotDataUrl(svg(375));
    expect(result.width).toBe(375);
    expect(result.height).toBe(600);
    expect(result.mimeType).toBe("image/svg+xml");
  });

  it("接受宽图而不是直接拒绝，交由自动适配处理", () => {
    const result = parseScreenshotDataUrl(svg(1200));
    expect(result.width).toBe(1200);
    expect(result.height).toBe(600);
  });

  it("把 SVG 证据栅格化并生成适配图", async () => {
    const result = await prepareScreenshotDataUrl(svg(375));
    expect(result.source.width).toBe(375);
    expect(result.source.mimeType).toBe("image/svg+xml");
    expect(result.normalized.width).toBe(750);
    expect(result.normalized.height).toBe(1200);
    expect(result.normalized.mimeType).toBe("image/png");
  });

  it("把 1440px 宽图适配为 750px 并保留原图字节", async () => {
    const source = await solidPng(1440, 900);
    const result = await prepareScreenshotDataUrl(dataUrl("image/png", source));
    expect(result.source.width).toBe(1440);
    expect(result.source.height).toBe(900);
    expect(result.source.bytes.equals(source)).toBe(true);
    expect(result.normalized.width).toBe(750);
    expect(result.normalized.height).toBe(469);
    expect(result.transform.cropped).toBe(false);
    expect(result.transform.mode).toContain("fit");
  });

  it("裁去截图外侧的均匀边框后再适配", async () => {
    const source = await sharp({ create: { width: 1200, height: 900, channels: 4, background: "#ffffff" } })
      .composite([{
        input: Buffer.from('<svg width="1000" height="700"><rect width="1000" height="700" fill="#f4efe5"/><rect x="40" y="40" width="500" height="300" fill="#c33"/></svg>'),
        left: 100,
        top: 100,
      }])
      .png()
      .toBuffer();
    const result = await prepareScreenshotDataUrl(dataUrl("image/png", source));
    expect(result.transform.cropped).toBe(true);
    expect(result.transform.crop).toEqual({ left: 100, top: 100, width: 1000, height: 700 });
    expect(result.normalized.width).toBe(750);
    expect(result.normalized.height).toBe(525);
  });

  it("支持 WebP 并读取真实尺寸", async () => {
    const source = await sharp({ create: { width: 750, height: 1100, channels: 4, background: "#fff" } }).webp({ quality: 80 }).toBuffer();
    expect(imageSize(source, "image/webp")).toEqual({ width: 750, height: 1100 });
    const result = await prepareScreenshotDataUrl(dataUrl("image/webp", source));
    expect(result.source.width).toBe(750);
    expect(result.normalized.width).toBe(750);
  });

  it("按 EXIF 方向纠正手机截图", async () => {
    const source = await sharp({ create: { width: 800, height: 400, channels: 4, background: "#fff" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await prepareScreenshotDataUrl(dataUrl("image/jpeg", source));
    expect(result.source.width).toBe(400);
    expect(result.source.height).toBe(800);
    expect(result.transform.orientation).toBe(6);
    expect(result.normalized.width).toBe(375);
    expect(result.normalized.height).toBe(750);
  });

  it("拒绝宽度不足 300px 的截图", async () => {
    const source = await solidPng(299, 600);
    await expect(prepareScreenshotDataUrl(dataUrl("image/png", source))).rejects.toThrow(/至少为 300px/);
  });

  it("拒绝非法 data URL", async () => {
    await expect(prepareScreenshotDataUrl("https://example.com/a.png")).rejects.toThrow(/base64/);
  });
});
