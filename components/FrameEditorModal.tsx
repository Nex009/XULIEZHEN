import React, { useState, useEffect } from 'react';
import { X, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { SpriteConfig, ImageDimensions } from '../types';

interface FrameEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  config: SpriteConfig;
  dimensions: ImageDimensions;
  onUpdateConfig: (newConfig: SpriteConfig) => void;
}

export const FrameEditorModal: React.FC<FrameEditorModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  config,
  dimensions,
  onUpdateConfig
}) => {
  if (!isOpen || !imageUrl) return null;

  const frameWidth = dimensions.width / config.cols;
  const frameHeight = dimensions.height / config.rows;

  const toggleFrameExclusion = (index: number) => {
    const currentExcluded = config.excludedFrames || [];
    let newExcluded;
    if (currentExcluded.includes(index)) {
      newExcluded = currentExcluded.filter(i => i !== index);
    } else {
      newExcluded = [...currentExcluded, index];
    }
    onUpdateConfig({ ...config, excludedFrames: newExcluded });
  };

  const updateFrameOffset = (index: number, dx: number, dy: number) => {
    const currentOffsets = config.frameOffsets || {};
    const currentOffset = currentOffsets[index] || { x: 0, y: 0 };
    
    const newOffsets = {
      ...currentOffsets,
      [index]: {
        x: currentOffset.x + dx,
        y: currentOffset.y + dy
      }
    };
    onUpdateConfig({ ...config, frameOffsets: newOffsets });
  };

  const resetFrameOffset = (index: number) => {
     const currentOffsets = { ...config.frameOffsets };
     delete currentOffsets[index];
     onUpdateConfig({ ...config, frameOffsets: currentOffsets });
  };

  // Generate an array of indices based on totalFrames
  const frames = Array.from({ length: config.totalFrames }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-[#15171e] w-[95vw] h-[90vh] rounded-xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#1a1d26]">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Frame Editor</h2>
            <p className="text-xs text-slate-500">Fine-tune offsets or delete keyframes</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f1115]">
          <div 
            className="grid gap-4"
            style={{ 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' 
            }}
          >
            {frames.map((index) => {
              // Determine visual row/col based on configuration
              let row, col;
              if (config.direction === 'column') {
                row = index % config.rows;
                col = Math.floor(index / config.rows);
              } else {
                col = index % config.cols;
                row = Math.floor(index / config.cols);
              }

              const isExcluded = config.excludedFrames?.includes(index);
              const offset = config.frameOffsets?.[index] || { x: 0, y: 0 };

              // Calculate background position to show correct sprite slice
              const bgPosX = -(col * frameWidth);
              const bgPosY = -(row * frameHeight);

              return (
                <div 
                  key={index} 
                  className={`relative bg-slate-800 border-2 rounded-lg p-2 flex flex-col items-center transition-all ${isExcluded ? 'border-red-900/50 opacity-50 grayscale' : 'border-slate-700 hover:border-indigo-500'}`}
                >
                  {/* Sprite Preview Box */}
                  <div className="relative w-24 h-24 bg-[url('https://www.transparenttextures.com/patterns/pixels.png')] bg-slate-900 rounded overflow-hidden mb-2 border border-slate-700 shadow-inner">
                     <div 
                        className="w-full h-full"
                        style={{
                            backgroundImage: `url(${imageUrl})`,
                            backgroundRepeat: 'no-repeat',
                            // The actual size of the background image needs to be the original dimensions scaled to fit this 96x96 box
                            // Actually, simpler approach: set the container to overflow hidden, and transform the inner div
                            width: frameWidth,
                            height: frameHeight,
                            // Scale down to fit preview box if frame is large
                            transform: `scale(${Math.min(96 / frameWidth, 96 / frameHeight)}) translate(${offset.x}px, ${offset.y}px)`, 
                            transformOrigin: 'top left',
                            backgroundPosition: `${bgPosX}px ${bgPosY}px`
                        }}
                     />
                     {/* Cross line for deleted state */}
                     {isExcluded && (
                         <div className="absolute inset-0 flex items-center justify-center">
                             <div className="w-full h-0.5 bg-red-500 rotate-45 absolute" />
                             <div className="w-full h-0.5 bg-red-500 -rotate-45 absolute" />
                         </div>
                     )}
                  </div>

                  {/* Frame ID */}
                  <div className="text-[10px] font-mono text-slate-500 mb-2">FRAME {index + 1}</div>

                  {/* Controls */}
                  <div className="w-full grid grid-cols-3 gap-1 mb-2">
                     <div />
                     <button onClick={() => updateFrameOffset(index, 0, -1)} className="bg-slate-700 hover:bg-indigo-600 rounded p-1 flex justify-center text-white"><ArrowUp size={12}/></button>
                     <div />
                     
                     <button onClick={() => updateFrameOffset(index, -1, 0)} className="bg-slate-700 hover:bg-indigo-600 rounded p-1 flex justify-center text-white"><ArrowLeft size={12}/></button>
                     <button onClick={() => resetFrameOffset(index)} className="bg-slate-700 hover:bg-indigo-600 rounded p-1 flex justify-center text-white"><RotateCcw size={12}/></button>
                     <button onClick={() => updateFrameOffset(index, 1, 0)} className="bg-slate-700 hover:bg-indigo-600 rounded p-1 flex justify-center text-white"><ArrowRight size={12}/></button>
                     
                     <div />
                     <button onClick={() => updateFrameOffset(index, 0, 1)} className="bg-slate-700 hover:bg-indigo-600 rounded p-1 flex justify-center text-white"><ArrowDown size={12}/></button>
                     <div />
                  </div>

                  <button 
                    onClick={() => toggleFrameExclusion(index)}
                    className={`w-full py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center space-x-1 transition-colors ${isExcluded ? 'bg-emerald-900 text-emerald-400 hover:bg-emerald-800' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'}`}
                  >
                     {isExcluded ? <span>Restore</span> : <><Trash2 size={12} /><span>Delete</span></>}
                  </button>

                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};