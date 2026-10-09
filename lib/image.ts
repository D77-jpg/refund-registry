'use client';

/**
 * 收款码截图压缩：手机原图动辄 3~8MB，直接上传会很慢且可能超过体积限制。
 * 这里统一缩到长边 1280px、JPEG 质量 0.82，通常 150KB~500KB，二维码依然清晰可扫。
 */
export interface CompressResult {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
}

export async function compressImage(file: File, maxEdge = 1280, quality = 0.82): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件（png / jpg / webp）');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(bitmapUrl);
    let { width, height } = img;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持图片处理，请换用微信/Chrome 打开');
    // 白底，避免 PNG 透明区域转 JPEG 变黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    // 若仍偏大，再降一档质量
    if (estimateBytes(dataUrl) > 900 * 1024) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }
    return { dataUrl, bytes: estimateBytes(dataUrl), width, height };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function estimateBytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败，请重新选择'));
    img.src = src;
  });
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
