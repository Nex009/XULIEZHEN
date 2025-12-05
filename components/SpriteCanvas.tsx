import React from 'react';

interface SpriteCanvasProps {
  imageUrl: string | null;
  maxHeight?: number;
}

export const SpriteCanvas: React.FC<SpriteCanvasProps> = ({ imageUrl, maxHeight }) => {
  if (!imageUrl) {
    return (
      <div className="w-full h-full min-h-[100px] flex items-center justify-center text-slate-600 text-xs">
        No Source
      </div>
    );
  }

  return (
    <div 
        className="relative bg-[#0f1115] rounded-b-lg overflow-hidden flex items-center justify-center p-2"
        style={{
            display: 'inline-block',
            width: 'auto',
            height: 'auto',
        }}
    >
        <img
            src={imageUrl}
            alt="Source"
            className="block max-w-full object-contain" 
            style={{ 
                imageRendering: 'pixelated',
                maxHeight: maxHeight ? `${maxHeight}px` : '300px'
            }} 
        />
    </div>
  );
};
