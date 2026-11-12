import { ApiError } from "./api";

export type ImageInfo = { bytes: Buffer; mimeType: string; width: number; height: number };

function pngSize(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function gifSize(buffer: Buffer) {
  if (buffer.length < 10 || !buffer.toString("ascii", 0, 3).startsWith("GIF")) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function svgSize(buffer: Buffer) {
  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 8192));
  if (!/<svg\b/i.test(text)) return null;
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const read = (name: string) => Number.parseFloat(tag.match(new RegExp(name + "=[\"']([0-9.]+)", "i"))?.[1] ?? "0");
  let width = read("width");
  let height = read("height");
  if ((!width || !height) && /viewBox=/i.test(tag)) {
    const box = tag.match(/viewBox=[\"']\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i);
    width ||= Number.parseFloat(box?.[1] ?? "0");
    height ||= Number.parseFloat(box?.[2] ?? "0");
  }
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
}

export function imageSize(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return pngSize(buffer);
  if (mimeType === "image/jpeg") return jpegSize(buffer);
  if (mimeType === "image/gif") return gifSize(buffer);
  if (mimeType === "image/svg+xml") return svgSize(buffer);
  return null;
}

export function parseScreenshotDataUrl(value: string): ImageInfo {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new ApiError(400, "VALIDATION_ERROR", "截图必须是 base64 图片 data URL");
  const mimeType = match[1].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图仅支持 PNG、JPEG、WebP 或 SVG");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new ApiError(400, "VALIDATION_ERROR", "截图大小必须在 8MB 以内");
  const size = imageSize(bytes, mimeType);
  if (!size) throw new ApiError(400, "VALIDATION_ERROR", "无法读取截图尺寸，请上传有效的 375px 截图");
  if (size.width < 300 || size.width > 800) throw new ApiError(400, "VALIDATION_ERROR", "截图宽度应为 375px（或 2x 750px），当前为 " + size.width + "px");
  return { bytes, mimeType, ...size };
}
