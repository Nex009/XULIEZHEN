import React from 'react';
import { SpriteConfig, ImageDimensions } from '../types';
import { Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCcw, Settings, ArrowRight, ArrowDown } from 'lucide-react';

interface SplitFrameEditorProps {
  imageUrl: string | null;
  config: SpriteConfig;
  dimensions: ImageDimensions;
  onUpdateConfig: (key: keyof SpriteConfig, value: any) => void;
}

export const SplitFrameEditor: React.FC<SplitFrameEditorProps> = ({
  imageUrl,
  config,
  dimensions,
  onUpdateConfig
}) => {
  if (!imageUrl || dimensions.width === 0) {
    return (
        <div className="flex items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-700 rounded-lg bg-slate-900/50">
            Awaiting Source Image...
        </div>
    );
  }

  // Calculate strict frame dimensions
  const frameWidth = dimensions.width / config.cols;
  const frameHeight = dimensions.height / config.rows;

  const handleNudge = (e: React.MouseEvent, index: number, dx: number, dy: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentOffset = config.frameOffsets?.[index] || { x: 0, y: 0 };
    const newOffsets = {
      ...config.frameOffsets,
      [index]: {
        x: currentOffset.x + dx,
        y: currentOffset.y + dy
      }
    };
    onUpdateConfig('frameOffsets', newOffsets);
  };
  
  const handleResetOffset = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const newOffsets = { ...config.frameOffsets };
    delete newOffsets[index];
    onUpdateConfig('frameOffsets', newOffsets);
  };

  const toggleExclusion = (e: React.MouseEvent, index: number) => {
    e.preventDefault(); 
    e.stopPropagation();
    const currentExcluded = config.excludedFrames || [];
    let newExcluded;
    if (currentExcluded.includes(index)) {
      newExcluded = currentExcluded.filter(i => i !== index);
    } else {
      newExcluded = [...currentExcluded, index];
    }
    onUpdateConfig('excludedFrames', newExcluded);
  };

  // Generate an array of indices based on totalFrames
  const frames = Array.from({ length: config.totalFrames }, (_, i) => i);

  return (
    <div 
        className="bg-[#0f1115] rounded-b-lg select-none flex flex-col"
        style={{ width: '100%', minWidth: '300px' }}
    >
      {/* --- IN-NODE TOOLBAR --- */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800 text-[10px]">
         <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
                <span className="text-slate-500 font-bold">GRID</span>
                <input 
                    type="number" 
                    value={config.rows} 
                    onChange={(e) => onUpdateConfig('rows', e.target.valueAsNumber)}
                    className="w-8 bg-black/50 border border-slate-700 rounded px-1 text-center text-slate-300 focus:border-indigo-500 outline-none" 
                    title="Rows"
                />
                <span className="text-slate-600">×</span>
                <input 
                    type="number" 
                    value={config.cols} 
                    onChange={(e) => onUpdateConfig('cols', e.target.valueAsNumber)}
                    className="w-8 bg-black/50 border border-slate-700 rounded px-1 text-center text-slate-300 focus:border-indigo-500 outline-none" 
                    title="Columns"
                />
            </div>
            <div className="w-px h-3 bg-slate-700"></div>
            <div className="flex bg-black/50 rounded border border-slate-800 p-0.5">
                <button 
                    onClick={() => onUpdateConfig('direction', 'row')} 
                    className={`p-1 rounded ${config.direction === 'row' ? 'bg-indigo-500/50 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Horizontal Order"
                >
                    <ArrowRight size={10} />
                </button>
                <button 
                    onClick={() => onUpdateConfig('direction', 'column')} 
                    className={`p-1 rounded ${config.direction === 'column' ? 'bg-indigo-500/50 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Vertical Order"
                >
                    <ArrowDown size={10} />
                </button>
            </div>
         </div>
         <div className="text-slate-500 flex items-center gap-1">
             <Settings size={10} />
             <span>{config.totalFrames} Frames</span>
         </div>
      </div>

      <div className="p-4">
        <div 
            className="grid gap-1"
            style={{ 
            gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
            maxWidth: '100%' 
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
            const hasOffset = offset.x !== 0 || offset.y !== 0;

            const xOffsetPct = (offset.x / frameWidth) * 100;
            const yOffsetPct = (offset.y / frameHeight) * 100;

            return (
                <div 
                key={index}
                onContextMenu={(e) => toggleExclusion(e, index)}
                className={`relative group overflow-hidden border border-slate-800 bg-slate-900 transition-colors ${isExcluded ? 'opacity-30 grayscale' : 'hover:border-indigo-500'}`}
                style={{
                    aspectRatio: `${frameWidth}/${frameHeight}`,
                }}
                >
                <img
                    src={imageUrl}
                    className="max-w-none pointer-events-none"
                    style={{
                        position: 'absolute',
                        width: `${config.cols * 100}%`,
                        height: `${config.rows * 100}%`,
                        left: `calc(-${col * 100}% + ${xOffsetPct}%)`,
                        top: `calc(-${row * 100}% + ${yOffsetPct}%)`,
                        imageRendering: 'pixelated'
                    }}
                    alt=""
                />
                
                {!isExcluded && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 z-10">
                        <button 
                            onClick={(e) => handleNudge(e, index, 0, -1)}
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/4 flex items-start justify-center pt-0.5 hover:bg-indigo-500/20 active:bg-indigo-500/40"
                        >
                            <ChevronUp size={12} className="text-white drop-shadow-md" />
                        </button>
                        <button 
                            onClick={(e) => handleNudge(e, index, 0, 1)}
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-1/4 flex items-end justify-center pb-0.5 hover:bg-indigo-500/20 active:bg-indigo-500/40"
                        >
                            <ChevronDown size={12} className="text-white drop-shadow-md" />
                        </button>
                        <button 
                            onClick={(e) => handleNudge(e, index, -1, 0)}
                            className="absolute top-1/2 left-0 -translate-y-1/2 h-full w-1/4 flex items-center justify-start pl-0.5 hover:bg-indigo-500/20 active:bg-indigo-500/40"
                        >
                            <ChevronLeft size={12} className="text-white drop-shadow-md" />
                        </button>
                        <button 
                            onClick={(e) => handleNudge(e, index, 1, 0)}
                            className="absolute top-1/2 right-0 -translate-y-1/2 h-full w-1/4 flex items-center justify-end pr-0.5 hover:bg-indigo-500/20 active:bg-indigo-500/40"
                        >
                            <ChevronRight size={12} className="text-white drop-shadow-md" />
                        </button>
                        
                        {hasOffset && (
                            <button 
                                onClick={(e) => handleResetOffset(e, index)}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 hover:bg-red-500/80 text-white"
                                title="Reset Offset"
                            >
                                <RefreshCcw size={8} />
                            </button>
                        )}
                    </div>
                )}
                
                <div className="absolute bottom-0.5 left-1 text-[8px] font-mono text-slate-500 pointer-events-none opacity-50 z-20 mix-blend-difference text-white">
                    {index + 1}
                </div>

                {isExcluded && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 bg-black/40">
                        <Trash2 size={16} className="text-red-500" />
                    </div>
                )}
                </div>
            );
            })}
        </div>
      </div>
    </div>
  );
};