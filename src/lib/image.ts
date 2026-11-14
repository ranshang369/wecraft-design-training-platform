import sharp from "sharp";
import { ApiError } from "./api";

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const MIN_SCREENSHOT_WIDTH = 300;

const MAX_SOURCE_PIXELS = 60_000_000;
const MAX_OUTPUT_HEIGHT = 30_000;
const TARGET_WIDTH = 375;
const RETINA_TARGET_WIDTH = 750;
const TRIM_THRESHOLD = 12;
const MIN_TRIM_AREA_RATIO = 0.01;
const MAX_EDGE_TRIM_RATIO = 0.12;
const MAX_TOTAL_TRIM_RATIO = 0.4;

export type ImageInfo = { bytes: Buffer; mimeType: string; width: number; height: number };

export type ScreenshotCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ScreenshotTransform = {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  orientation: number;
  cropped: boolean;
  crop: ScreenshotCrop | null;
  scale: number;
  mode: string;
};

export type PreparedScreenshot = {
  source: ImageInfo;
  normalized: ImageInfo;
  transform: ScreenshotTransform;
};

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

function webpSize(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 " && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function svgSize(buffer: Buffer) {
  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 8192));
  if (!/<svg\b/i.test(text)) return null;
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const read = (name: string) => Number.parseFloat(tag.match(new RegExp(name + "=[\"']([0-9.]+)", "i"))?.[1] ?? "0");
  let width = read("width");
  let height = read("height");
  if ((!width || !height) && /viewBox=/i.test(tag)) {
    const box = tag.match(/viewBox=[\"']\s+[0-9.]+\s+[0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i);
    width ||= Number.parseFloat(box?.[1] ?? "0");
    height ||= Number.parseFloat(box?.[2] ?? "0");
  }
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
}

export function imageSize(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return pngSize(buffer);
  if (mimeType === "image/jpeg") return jpegSize(buffer);
  if (mimeType === "image/gif") return gifSize(buffer);
  if (mimeType === "image/webp") return webpSize(buffer);
  if (mimeType === "image/svg+xml") return svgSize(buffer);
  return null;
}

function decodeScreenshotDataUrl(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new ApiError(400, "VALIDATION_ERROR", "截图必须是 base64 图片 data URL");
  const mimeType = match[1].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图仅支持 PNG、JPEG、WebP 或 SVG");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图大小必须在 8MB 以内");
  }
  return { bytes, mimeType };
}

export function parseScreenshotDataUrl(value: string): ImageInfo {
  const { bytes, mimeType } = decodeScreenshotDataUrl(value);
  const size = imageSize(bytes, mimeType);
  if (!size || !size.width || !size.height) {
    throw new ApiError(400, "VALIDATION_ERROR", "无法读取截图尺寸，请上传有效的 PNG、JPEG、WebP 或 SVG 图片");
  }
  if (size.width < MIN_SCREENSHOT_WIDTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图宽度至少为 " + MIN_SCREENSHOT_WIDTH + "px，当前为 " + size.width + "px");
  }
  return { bytes, mimeType, ...size };
}

function orientedSize(width: number, height: number, orientation: number) {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

async function readMetadata(bytes: Buffer) {
  try {
    return await sharp(bytes, {
      density: 72,
      limitInputPixels: MAX_SOURCE_PIXELS,
    }).metadata();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "无法解码截图，请重新导出为 PNG、JPEG、WebP 或 SVG 后再上传");
  }
}

async function safeAutoCrop(bytes: Buffer, sourceWidth: number, sourceHeight: number) {
  try {
    const result = await sharp(bytes, {
      density: 144,
      limitInputPixels: MAX_SOURCE_PIXELS,
    })
      .rotate()
      .trim({ threshold: TRIM_THRESHOLD })
      .png({ compressionLevel: 6 })
      .toBuffer({ resolveWithObject: true });

    const left = Math.max(0, -(result.info.trimOffsetLeft ?? 0));
    const top = Math.max(0, -(result.info.trimOffsetTop ?? 0));
    const width = result.info.width;
    const height = result.info.height;
    if (!width || !height) return null;
    const right = Math.max(0, sourceWidth - left - width);
    const bottom = Math.max(0, sourceHeight - top - height);
    const removedAreaRatio = 1 - (width * height) / (sourceWidth * sourceHeight);
    const withinEdgeLimit =
      left / sourceWidth <= MAX_EDGE_TRIM_RATIO &&
      right / sourceWidth <= MAX_EDGE_TRIM_RATIO &&
      top / sourceHeight <= MAX_EDGE_TRIM_RATIO &&
      bottom / sourceHeight <= MAX_EDGE_TRIM_RATIO;

    if (
      removedAreaRatio < MIN_TRIM_AREA_RATIO ||
      removedAreaRatio > MAX_TOTAL_TRIM_RATIO ||
      !withinEdgeLimit ||
      width < MIN_SCREENSHOT_WIDTH
    ) {
      return null;
    }
    return { bytes: result.data, width, height, crop: { left, top, width, height } };
  } catch {
    return null;
  }
}

function outputMimeType(format: string | undefined) {
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  return "image/png";
}

async function renderNormalized(input: {
  bytes: Buffer;
  rotate: boolean;
  width: number;
  height: number;
  targetWidth: number;
}) {
  const targetHeight = Math.round(input.height * input.targetWidth / input.width);
  const scale = Math.min(1, MAX_OUTPUT_HEIGHT / Math.max(1, targetHeight));
  const targetWidth = Math.max(1, Math.round(input.targetWidth * scale));
  if (targetWidth < MIN_SCREENSHOT_WIDTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图过高，自动适配后的宽度不足 " + MIN_SCREENSHOT_WIDTH + "px，请将长截图分段上传");
  }

  const createPipeline = () => {
    let pipeline = sharp(input.bytes, {
      density: 144,
      limitInputPixels: MAX_SOURCE_PIXELS,
    });
    if (input.rotate) pipeline = pipeline.rotate();
    return pipeline.resize({ width: targetWidth });
  };

  let rendered = await createPipeline().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });
  if (rendered.data.length > MAX_SCREENSHOT_BYTES) {
    rendered = await createPipeline().webp({ quality: 90, effort: 4 }).toBuffer({ resolveWithObject: true });
  }
  if (rendered.data.length > MAX_SCREENSHOT_BYTES) {
    rendered = await createPipeline().flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  }
  if (rendered.data.length > MAX_SCREENSHOT_BYTES) {
    throw new ApiError(400, "VALIDATION_ERROR", "自动适配后的截图仍超过 8MB，请降低原图分辨率后重试");
  }
  return {
    bytes: rendered.data,
    mimeType: outputMimeType(rendered.info.format),
    width: rendered.info.width,
    height: rendered.info.height,
  };
}

export async function prepareScreenshotDataUrl(value: string): Promise<PreparedScreenshot> {
  const raw = decodeScreenshotDataUrl(value);
  const metadata = await readMetadata(raw.bytes);
  if (!metadata.width || !metadata.height) {
    throw new ApiError(400, "VALIDATION_ERROR", "无法读取截图尺寸，请上传有效的 PNG、JPEG、WebP 或 SVG 图片");
  }
  if (metadata.width * metadata.height > MAX_SOURCE_PIXELS) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图像素过高，请压缩或分段后再上传");
  }

  const orientation = metadata.orientation ?? 1;
  const source = orientedSize(metadata.width, metadata.height, orientation);
  if (source.width < MIN_SCREENSHOT_WIDTH) {
    throw new ApiError(400, "VALIDATION_ERROR", "截图宽度至少为 " + MIN_SCREENSHOT_WIDTH + "px，当前为 " + source.width + "px");
  }

  const autoCrop = raw.mimeType === "image/svg+xml" ? null : await safeAutoCrop(raw.bytes, source.width, source.height);
  const effectiveWidth = autoCrop?.width ?? source.width;
  const effectiveHeight = autoCrop?.height ?? source.height;
  const targetWidth = raw.mimeType === "image/svg+xml" || effectiveWidth >= RETINA_TARGET_WIDTH ? RETINA_TARGET_WIDTH : TARGET_WIDTH;
  const normalized = await renderNormalized({
    bytes: autoCrop?.bytes ?? raw.bytes,
    rotate: !autoCrop,
    width: effectiveWidth,
    height: effectiveHeight,
    targetWidth,
  });

  const modeParts = [];
  if (orientation >= 2 && orientation <= 8) modeParts.push("orientation");
  if (autoCrop) modeParts.push("auto-crop");
  modeParts.push("fit");

  return {
    source: { bytes: raw.bytes, mimeType: raw.mimeType, ...source },
    normalized,
    transform: {
      sourceWidth: source.width,
      sourceHeight: source.height,
      width: normalized.width,
      height: normalized.height,
      orientation,
      cropped: Boolean(autoCrop),
      crop: autoCrop?.crop ?? null,
      scale: normalized.width / effectiveWidth,
      mode: modeParts.join("+"),
    },
  };
}

export function imageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

export function screenshotAltText(prefix: string, image: ImageInfo) {
  return prefix + " " + image.width + "×" + image.height;
}
