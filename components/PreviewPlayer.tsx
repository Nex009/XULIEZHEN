import React, { useRef, useEffect, useState } from 'react';
import { SpriteConfig, ImageDimensions } from '../types';
import { Play, Pause, SplitSquareHorizontal } from 'lucide-react';

interface PreviewPlayerProps {
  imageUrl: string | null;
  config: SpriteConfig;
  dimensions: ImageDimensions;
  originalSourceUrl?: string | null; // For comparison
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({ imageUrl, config, dimensions, originalSourceUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const comparisonCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [showCompare, setShowCompare] = useState(false);
  const [sliderPos, setSliderPos] = useState(50); // 0 to 100

  // Filter valid frame indices
  const getValidFrames = () => {
    const frames = [];
    for (let i = 0; i < config.totalFrames; i++) {
      if (!config.excludedFrames || !config.excludedFrames.includes(i)) {
        frames.push(i);
      }
    }
    return frames;
  };

  useEffect(() => {
    if (!imageUrl || !canvasRef.current || dimensions.width === 0) return;

    const img = new Image();
    img.src = imageUrl;

    let compareImg: HTMLImageElement | null = null;
    if (originalSourceUrl) {
        compareImg = new Image();
        compareImg.src = originalSourceUrl;
    }
    
    const animate = (time: number) => {
      if (!canvasRef.current) return;
      
      const frameInterval = 1000 / config.fps;
      const validFrames = getValidFrames();
      
      if (validFrames.length === 0) {
         const ctx = canvasRef.current.getContext('2d');
         if(ctx) ctx.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
         return;
      }

      const stepIndex = Math.floor(time / frameInterval) % validFrames.length;
      const actualFrameIndex = validFrames[stepIndex];
      
      setCurrentFrameIndex(actualFrameIndex);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const frameWidth = dimensions.width / config.cols;
      const frameHeight = dimensions.height / config.rows;

      let col, row;
      if (config.direction === 'column') {
        row = actualFrameIndex % config.rows;
        col = Math.floor(actualFrameIndex / config.rows);
      } else {
        col = actualFrameIndex % config.cols;
        row = Math.floor(actualFrameIndex / config.cols);
      }

      canvasRef.current.width = frameWidth;
      canvasRef.current.height = frameHeight;
      
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.imageSmoothingEnabled = false;

      // --- Draw Result Image ---
      const offset = config.frameOffsets?.[actualFrameIndex] || { x: 0, y: 0 };
      const sourceX = (col * frameWidth) - offset.x;
      const sourceY = (row * frameHeight) - offset.y;

      ctx.drawImage(
        img,
        sourceX, sourceY,
        frameWidth, frameHeight,
        0, 0,
        frameWidth, frameHeight
      );

      // --- Draw Comparison Image (if enabled) ---
      if (showCompare && compareImg && compareImg.complete) {
          // We assume original source follows the SAME layout as generated result 
          // (which is true for gif_match mode)
          // Draw it masked by slider
          ctx.save();
          ctx.beginPath();
          const splitX = (frameWidth * sliderPos) / 100;
          
          // Draw divider line
          ctx.fillStyle = "#00e5ff";
          ctx.fillRect(splitX - 1, 0, 2, frameHeight);

          // Clip to the right side for comparison (or left, let's say Right is Original)
          // Let's make Left = New, Right = Original
          ctx.rect(splitX, 0, frameWidth - splitX, frameHeight);
          ctx.clip();
          
          // Draw Original (No offsets usually, or same offsets? Original is reference, so no offsets)
          // Wait, if we are correcting the new one to match original, original should be static at grid pos.
          const origSourceX = col * frameWidth; // Original Grid has no offsets
          const origSourceY = row * frameHeight;

          ctx.drawImage(
             compareImg,
             origSourceX, origSourceY,
             frameWidth, frameHeight,
             0, 0,
             frameWidth, frameHeight
          );
          
          ctx.restore();
      }

      if (isPlaying) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [imageUrl, config, dimensions, isPlaying, showCompare, sliderPos, originalSourceUrl]);

  if (!imageUrl) return null;

  const validFrameCount = getValidFrames().length;

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden relative group">
      <div className="flex-1 w-full relative bg-[url('https://www.transparenttextures.com/patterns/pixels.png')] bg-slate-800/50 flex items-center justify-center p-2">
        <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain image-pixelated"
            style={{ imageRendering: 'pixelated' }}
        />
        
        {/* Controls Overlay */}
        <div className="absolute bottom-2 right-2 flex space-x-1">
             {originalSourceUrl && (
                 <button 
                    onClick={() => setShowCompare(!showCompare)}
                    className={`p-1.5 rounded backdrop-blur-sm transition-colors border ${showCompare ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-black/50 border-white/10 text-white hover:bg-slate-700'}`}
                    title="Compare with Original"
                 >
                    <SplitSquareHorizontal size={12} />
                 </button>
             )}
             <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 rounded bg-black/50 hover:bg-indigo-500/80 text-white backdrop-blur-sm transition-colors border border-white/10"
             >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
             </button>
        </div>

        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[10px] font-mono text-slate-300 border border-white/10">
            {validFrameCount > 0 ? `Frame ${currentFrameIndex}` : 'No Frames'}
        </div>
        
        {/* Slider for Compare */}
        {showCompare && (
            <div className="absolute bottom-10 left-4 right-4 flex items-center z-20">
                <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={sliderPos} 
                    onChange={(e) => setSliderPos(parseInt(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-black/50 rounded-lg appearance-none cursor-ew-resize"
                />
            </div>
        )}
      </div>
    </div>
  );
};
