'use client';

export type AcademicImageFormat = 'tiff' | 'png' | 'jpeg' | 'webp';

export type AcademicImageOptions = {
  format: AcademicImageFormat;
  dpi: number;
  quality: number;
};

export type AcademicImageResult = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
};

const MIME_BY_FORMAT: Record<AcademicImageFormat, string> = {
  tiff: 'image/tiff',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const EXT_BY_FORMAT: Record<AcademicImageFormat, string> = {
  tiff: 'tiff',
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

function dataUrlToBlob(dataUrl: string, type: string): Blob {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be loaded by this browser'));
    };
    img.src = url;
  });
}

function baseName(name: string): string {
  return (name.replace(/\.[^.]+$/, '') || 'image')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .trim()
    .replace(/\s+/g, '_') || 'image';
}

export async function convertAcademicImage(
  dataUrl: string,
  name: string,
  sourceType: string,
  options: AcademicImageOptions,
): Promise<AcademicImageResult> {
  const dpi = Math.max(72, Math.min(1200, Math.round(options.dpi || 300)));
  const quality = Math.max(0.1, Math.min(1, options.quality || 0.92));
  const sourceBlob = dataUrlToBlob(dataUrl, sourceType || 'application/octet-stream');
  const img = await loadImageFromBlob(sourceBlob);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(img, 0, 0);

  let blob: Blob;
  if (options.format === 'tiff') {
    blob = encodeAsTiff(canvas, dpi);
  } else if (options.format === 'png') {
    blob = await encodeAsPng(canvas, dpi);
  } else if (options.format === 'jpeg') {
    blob = await encodeAsJpeg(canvas, dpi, quality);
  } else {
    blob = await canvasToBlob(canvas, MIME_BY_FORMAT.webp, quality);
  }

  return {
    blob,
    filename: `${baseName(name)}_${dpi}dpi.${EXT_BY_FORMAT[options.format]}`,
    width: canvas.width,
    height: canvas.height,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Image encoding failed'));
    }, type, quality);
  });
}

function encodeAsTiff(canvas: HTMLCanvasElement, dpi: number): Blob {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const rowsPerStrip = 8;
  const strips: Uint8Array[] = [];

  for (let y = 0; y < height; y += rowsPerStrip) {
    const rowCount = Math.min(rowsPerStrip, height - y);
    const strip = new Uint8Array(rowCount * width * 3);
    let si = 0;
    for (let r = 0; r < rowCount; r += 1) {
      const base = (y + r) * width * 4;
      for (let x = 0; x < width; x += 1) {
        strip[si++] = pixels[base + x * 4];
        strip[si++] = pixels[base + x * 4 + 1];
        strip[si++] = pixels[base + x * 4 + 2];
      }
    }
    strips.push(strip);
  }

  const numStrips = strips.length;
  const stripByteCounts = strips.map((strip) => strip.length);
  const ifdOffset = 8;
  const numIfd = 12;
  const ifdSize = 2 + numIfd * 12 + 4;
  const extraOffset = ifdOffset + ifdSize;
  const xResOff = extraOffset;
  const yResOff = extraOffset + 8;
  const stripOffsetsArrOff = yResOff + 8;
  const stripByteCountsArrOff = stripOffsetsArrOff + numStrips * 4;
  const bpsOff = stripByteCountsArrOff + numStrips * 4;
  const imageDataStart = bpsOff + 6;

  const stripOffsets: number[] = [];
  let off = imageDataStart;
  for (const strip of strips) {
    stripOffsets.push(off);
    off += strip.length;
  }

  const buf = new ArrayBuffer(off);
  const dv = new DataView(buf);
  const le = true;
  let p = 0;
  dv.setUint16(p, 0x4949, le); p += 2;
  dv.setUint16(p, 42, le); p += 2;
  dv.setUint32(p, ifdOffset, le); p += 4;
  dv.setUint16(p, numIfd, le); p += 2;

  const writeIfd = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, le); p += 2;
    dv.setUint16(p, type, le); p += 2;
    dv.setUint32(p, count, le); p += 4;
    dv.setUint32(p, value, le); p += 4;
  };

  writeIfd(256, 4, 1, width);
  writeIfd(257, 4, 1, height);
  writeIfd(258, 3, 3, bpsOff);
  writeIfd(259, 3, 1, 1);
  writeIfd(262, 3, 1, 2);
  writeIfd(273, 4, numStrips, numStrips === 1 ? stripOffsets[0] : stripOffsetsArrOff);
  writeIfd(277, 3, 1, 3);
  writeIfd(278, 4, 1, rowsPerStrip);
  writeIfd(279, 4, numStrips, numStrips === 1 ? stripByteCounts[0] : stripByteCountsArrOff);
  writeIfd(282, 5, 1, xResOff);
  writeIfd(283, 5, 1, yResOff);
  writeIfd(296, 3, 1, 2);
  dv.setUint32(p, 0, le);

  dv.setUint32(xResOff, dpi, le);
  dv.setUint32(xResOff + 4, 1, le);
  dv.setUint32(yResOff, dpi, le);
  dv.setUint32(yResOff + 4, 1, le);
  if (numStrips > 1) {
    for (let i = 0; i < numStrips; i += 1) {
      dv.setUint32(stripOffsetsArrOff + i * 4, stripOffsets[i], le);
      dv.setUint32(stripByteCountsArrOff + i * 4, stripByteCounts[i], le);
    }
  }
  new Uint8Array(buf, bpsOff, 6).set([8, 0, 8, 0, 8, 0]);

  let imgOff = imageDataStart;
  for (const strip of strips) {
    new Uint8Array(buf, imgOff, strip.length).set(strip);
    imgOff += strip.length;
  }
  return new Blob([buf], { type: MIME_BY_FORMAT.tiff });
}

async function encodeAsPng(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const png = await canvasToBlob(canvas, MIME_BY_FORMAT.png);
  const pngBuf = await png.arrayBuffer();
  const ppm = Math.round(dpi * 39.3701);
  const phys = new Uint8Array(9);
  const pdv = new DataView(phys.buffer);
  pdv.setUint32(0, ppm, false);
  pdv.setUint32(4, ppm, false);
  phys[8] = 1;

  const physChunk = buildPngChunk('pHYs', phys);
  const insertAt = 33;
  const original = new Uint8Array(pngBuf);
  const output = new Uint8Array(original.length + physChunk.length);
  output.set(original.slice(0, insertAt));
  output.set(physChunk, insertAt);
  output.set(original.slice(insertAt), insertAt + physChunk.length);
  return new Blob([output], { type: MIME_BY_FORMAT.png });
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  dv.setInt32(8 + data.length, crc32(chunk.slice(4, 8 + data.length)), false);
  return chunk;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

async function encodeAsJpeg(canvas: HTMLCanvasElement, dpi: number, quality: number): Promise<Blob> {
  const jpeg = await canvasToBlob(canvas, MIME_BY_FORMAT.jpeg, quality);
  const buf = new Uint8Array(await jpeg.arrayBuffer());
  if (
    buf[2] === 0xff && buf[3] === 0xe0 &&
    buf[6] === 0x4a && buf[7] === 0x46 && buf[8] === 0x49 && buf[9] === 0x46
  ) {
    buf[13] = 1;
    buf[14] = (dpi >> 8) & 0xff;
    buf[15] = dpi & 0xff;
    buf[16] = (dpi >> 8) & 0xff;
    buf[17] = dpi & 0xff;
  }
  return new Blob([buf], { type: MIME_BY_FORMAT.jpeg });
}
