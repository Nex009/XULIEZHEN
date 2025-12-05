import React from 'react';
import { NodeGroup } from '../types';
import { PreviewPlayer } from './PreviewPlayer';
import { Wand2, Download, Trash2, ArrowRight, ArrowDown, Layers, Archive } from 'lucide-react';

interface GroupGridViewProps {
  groups: Record<string, NodeGroup>;
  onSelectGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onGenerateGif: (groupId: string) => void;
  onBatchGenerateGif: () => void;
  onBatchDownload: () => void;
  selectedGroupId: string | null;
}

export const GroupGridView: React.FC<GroupGridViewProps> = ({
  groups,
  onSelectGroup,
  onDeleteGroup,
  onGenerateGif,
  onBatchGenerateGif,
  onBatchDownload,
  selectedGroupId
}) => {
  const groupList = (Object.values(groups) as NodeGroup[]).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0c10]">
      {/* Batch Toolbar (Consistent with Table View) */}
      <div className="bg-[#15171e] border-b border-slate-800 px-6 py-3 flex items-center justify-between shadow-md z-10">
          <div className="flex items-center space-x-2">
             <Layers size={16} className="text-indigo-400"/>
             <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{groupList.length} Items</span>
          </div>
          <div className="flex items-center space-x-2">
             <button 
                onClick={onBatchGenerateGif}
                className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors shadow-sm"
             >
                <Wand2 size={12} /><span>Batch Export GIF</span>
             </button>
             <button 
                onClick={onBatchDownload}
                className="flex items-center space-x-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors shadow-sm"
             >
                <Archive size={12} /><span>Batch Download</span>
             </button>
          </div>
       </div>

      <div className="flex-1 overflow-y-auto p-6">
        {groupList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Layers size={48} className="mb-4 opacity-50" />
            <p>No sprites generated yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {groupList.map((group) => (
              <div 
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`
                  relative group flex flex-col bg-[#15171e] border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-2xl hover:-translate-y-1
                  ${selectedGroupId === group.id ? 'border-indigo-500 shadow-indigo-500/20 ring-1 ring-indigo-500' : 'border-slate-800 hover:border-slate-600'}
                `}
              >
                {/* Large Preview Area */}
                <div className="aspect-square bg-slate-900 relative p-4 flex items-center justify-center border-b border-slate-800">
                  <div className="w-full h-full shadow-lg rounded overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/pixels.png')] bg-slate-800/50">
                     <PreviewPlayer imageUrl={group.imageUrl} config={group.config} dimensions={group.dimensions} />
                  </div>
                  
                  {/* Hover Overlay Actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 backdrop-blur-[1px]">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onGenerateGif(group.id); }}
                        className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg transform scale-90 hover:scale-100 transition-all"
                        title="Quick Export GIF"
                     >
                        <Wand2 size={16} />
                     </button>
                     <a 
                        href={group.imageUrl || '#'}
                        download={`source-${group.id.substring(0,6)}.png`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full shadow-lg transform scale-90 hover:scale-100 transition-all"
                        title="Download Source"
                     >
                        <Download size={16} />
                     </a>
                  </div>
                </div>

                {/* Info Footer */}
                <div className="p-3 bg-[#1a1d26]">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-indigo-400 font-bold tracking-wider">{group.id.substring(0,8).toUpperCase()}</span>
                      <div className="flex items-center space-x-1 bg-black/30 px-1.5 py-0.5 rounded text-[9px] text-slate-400 border border-slate-800">
                         <span>{group.config.rows}×{group.config.cols}</span>
                         <span className="text-slate-600">|</span>
                         <span>{group.config.fps}FPS</span>
                      </div>
                   </div>

                   <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                          {group.config.direction === 'row' ? (
                              <span className="text-[9px] flex items-center text-slate-500 bg-slate-800 px-1 rounded border border-slate-700"><ArrowRight size={10} className="mr-0.5"/> Row</span>
                          ) : (
                              <span className="text-[9px] flex items-center text-slate-500 bg-slate-800 px-1 rounded border border-slate-700"><ArrowDown size={10} className="mr-0.5"/> Col</span>
                          )}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1"
                      >
                         <Trash2 size={12} />
                      </button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};