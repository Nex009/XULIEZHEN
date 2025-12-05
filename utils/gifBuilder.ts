import { SpriteConfig, ImageDimensions } from "../types";

// Define the GIF type from the library (loaded via CDN in index.html)
declare class GIF {
  constructor(options: any);
  addFrame(element: any, options?: any): void;
  on(event: string, callback: (data: any) => void): void;
  render(): void;
}

/**
 * Fetches the gif.worker.js code from CDN and creates a Blob URL.
 */
const getWorkerBlobUrl = async () => {
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
  const text = await response.text();
  const blob = new Blob([text], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};

// Magenta as the key color for transparency
const KEY_COLOR_RGB = [255, 0, 255]; 
const KEY_COLOR_HEX = 0xff00ff;

/**
 * Replaces the detected background color with the Key Color (Magenta).
 * This allows gif.js to treat Magenta as transparent.
 */
const applyChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const frameData = ctx.getImageData(0, 0, width, height);
  const data = frameData.data;
  
  // Sample top-left pixel as the background reference
  const rBg = data[0];
  const gBg = data[1];
  const bBg = data[2];
  
  // Tolerance for compression artifacts
  const tolerance = 20; 

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // If pixel matches the background color OR is already transparent
    if (
      (Math.abs(r - rBg) < tolerance &&
      Math.abs(g - gBg) < tolerance &&
      Math.abs(b - bBg) < tolerance) || 
      a < 10
    ) {
      // Set to Key Color (Magenta) and fully opaque
      data[i] = KEY_COLOR_RGB[0];
      data[i + 1] = KEY_COLOR_RGB[1];
      data[i + 2] = KEY_COLOR_RGB[2];
      data[i + 3] = 255; 
    }
  }

  ctx.putImageData(frameData, 0, 0);
};

export const generateGif = async (
  image: HTMLImageElement,
  config: SpriteConfig,
  dimensions: ImageDimensions,
  onProgress: (progress: number) => void
): Promise<Blob> => {
  const workerUrl = await getWorkerBlobUrl();

  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: dimensions.width / config.cols,
      height: dimensions.height / config.rows,
      workerScript: workerUrl,
      transparent: config.autoTransparent ? KEY_COLOR_HEX : null,
      background: config.autoTransparent ? '#ffffff' : '#000000' 
    });

    // Create an offscreen canvas for frame processing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) {
      reject(new Error("Could not create canvas context"));
      return;
    }

    const frameWidth = dimensions.width / config.cols;
    const frameHeight = dimensions.height / config.rows;

    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const framesToRender = [];
    for (let i = 0; i < config.totalFrames; i++) {
        if (!config.excludedFrames?.includes(i)) {
            framesToRender.push(i);
        }
    }

    if (framesToRender.length === 0) {
        reject(new Error("No valid frames to render"));
        return;
    }

    framesToRender.forEach(index => {
      // Clear canvas
      ctx.clearRect(0, 0, frameWidth, frameHeight);
      
      // OPTIMIZATION: Fill with WHITE (or background color) before drawing.
      // This ensures that if the image is shifted, the "empty" space is white.
      // Since `applyChromaKey` removes the background color (usually white), 
      // this ensures the shifted gap becomes transparent instead of black/undefined.
      if (config.autoTransparent) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, frameWidth, frameHeight);
      }

      let row, col;
      if (config.direction === 'column') {
        row = index % config.rows;
        col = Math.floor(index / config.rows);
      } else {
        col = index % config.cols;
        row = Math.floor(index / config.cols);
      }

      const offset = config.frameOffsets?.[index] || { x: 0, y: 0 };
      
      // Source coordinates (inverse of visual offset)
      const sourceX = (col * frameWidth) - offset.x;
      const sourceY = (row * frameHeight) - offset.y;

      ctx.drawImage(
        image,
        sourceX, sourceY,
        frameWidth, frameHeight,
        0, 0,
        frameWidth, frameHeight
      );

      if (config.autoTransparent) {
        applyChromaKey(ctx, frameWidth, frameHeight);
      }

      gif.addFrame(ctx, { copy: true, delay: 1000 / config.fps });
    });

    gif.on('progress', (p: number) => {
      onProgress(Math.round(p * 100));
    });

    gif.on('finished', (blob: Blob) => {
      URL.revokeObjectURL(workerUrl);
      resolve(blob);
    });

    gif.render();
  });
};
