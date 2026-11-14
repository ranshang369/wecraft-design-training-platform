export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
export const MAX_SCREENSHOT_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ClientScreenshot = {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片文件"));
    reader.readAsDataURL(file);
  });
}

function dataUrlDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法识别图片尺寸，请重新导出后再上传"));
    image.src = dataUrl;
  });
}

export async function readScreenshotFile(file: File): Promise<ClientScreenshot> {
  if (!SCREENSHOT_ACCEPT.split(",").includes(file.type)) {
    throw new Error("截图仅支持 PNG、JPEG、WebP 或 SVG");
  }
  if (file.size <= 0 || file.size > MAX_SCREENSHOT_UPLOAD_BYTES) {
    throw new Error("截图大小必须在 8MB 以内");
  }
  const dataUrl = await fileToDataUrl(file);
  const dimensions = await dataUrlDimensions(dataUrl);
  if (dimensions.width < 300) {
    throw new Error("截图宽度至少为 300px，当前为 " + dimensions.width + "px");
  }
  return { dataUrl, ...dimensions, sizeBytes: file.size, mimeType: file.type };
}

export function screenshotFitHint(image: ClientScreenshot | null) {
  if (!image) return "支持任意 300px 以上宽度的 PNG、JPEG、WebP、SVG；平台会自动识别尺寸。";
  const targetWidth = image.width >= 750 ? 750 : 375;
  return "已识别 " + image.width + "×" + image.height + "px；提交后自动纠正方向、裁去均匀外框并等比适配为 " + targetWidth + "px 或 750px 宽，原图完整保留。";
}
