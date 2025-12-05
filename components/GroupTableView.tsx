import React from 'react';
import { NodeGroup, SpriteConfig } from '../types';
import { ArrowRight, ArrowDown, Trash2, Download, Image as ImageIcon, Wand2, Layers, Archive, FileImage } from 'lucide-react';
import { PreviewPlayer } from './PreviewPlayer';

interface GroupTableViewProps {
  groups: Record<string, NodeGroup>;
  onUpdateConfig: (groupId: string, key: keyof SpriteConfig, value: any) => void;
  onDeleteGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  selectedGroupId: string | null;
  onGenerateGif: (groupId: string) => void;
  onBatchGenerateGif: () => void;
  onBatchDownload: () => void;
}

export const GroupTableView: React.FC<GroupTableViewProps> = ({
  groups,
  onUpdateConfig,
  onDeleteGroup,
  onSelectGroup,
  selectedGroupId,
  onGenerateGif,
  onBatchGenerateGif,
  onBatchDownload
}) => {
  const groupList = (Object.values(groups) as NodeGroup[]).sort((a, b) => b.createdAt - a.createdAt);

  if (groupList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
         <ImageIcon size={48} className="mb-4 opacity-50" />
         <p>No generations yet. Switch to Canvas mode to create content.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0c10]">
       {/* Batch Toolbar */}
       <div className="bg-[#15171e] border-b border-slate-800 px-6 py-2 flex items-center justify-between shadow-md z-10 h-12">
          <div className="flex items-center space-x-2">
             <Layers size={14} className="text-indigo-400"/>
             <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{groupList.length} Items</span>
          </div>
          <div className="flex items-center space-x-2">
             <button 
                onClick={onBatchGenerateGif}
                className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded transition-colors shadow-sm"
             >
                <Wand2 size={10} /><span>Batch GIF</span>
             </button>
             <button 
                onClick={onBatchDownload}
                className="flex items-center space-x-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] rounded transition-colors shadow-sm"
             >
                <Archive size={10} /><span>Batch Source</span>
             </button>
          </div>
       </div>

       <div className="flex-1 overflow-auto p-4">
           <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#15171e] shadow-2xl">
             <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1a1d26] text-slate-400 uppercase font-medium tracking-wider border-b border-slate-700 text-[10px]">
                   <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2 w-20 text-center">Source</th>
                      <th className="px-3 py-2 w-32">Preview</th>
                      <th className="px-2 py-2">Dimensions</th>
                      <th className="px-2 py-2 w-24 text-center">Config</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                   {groupList.map((group, index) => {
                      return (
                        <tr 
                            key={group.id} 
                            onClick={() => onSelectGroup(group.id)}
                            className={`group transition-colors cursor-pointer ${selectedGroupId === group.id ? 'bg-indigo-900/10' : 'hover:bg-slate-800/30'}`}
                        >
                            <td className="px-3 py-1 text-center font-mono text-slate-500">{groupList.length - index}</td>
                            
                            <td className="px-3 py-1 text-center">
                                <div className="w-12 h-12 bg-slate-800 rounded border border-slate-700 overflow-hidden inline-flex items-center justify-center">
                                    <img 
                                        src={group.originalSourceUrl || group.imageUrl || ''} 
                                        className="max-w-full max-h-full object-cover"
                                        alt="Src"
                                    />
                                </div>
                            </td>

                            <td className="px-3 py-1">
                                <div className="relative w-24 h-24 bg-slate-900 rounded border border-slate-700 overflow-hidden flex items-center justify-center shadow-inner group-hover:border-slate-500 transition-colors">
                                    <div className="w-full h-full pointer-events-none transform scale-90 origin-center">
                                        <PreviewPlayer imageUrl={group.imageUrl} config={group.config} dimensions={group.dimensions} />
                                    </div>
                                </div>
                            </td>

                            <td className="px-2 py-1 align-middle">
                                <div className="flex items-center space-x-2">
                                    <div className="flex flex-col space-y-0.5">
                                        <label className="text-[7px] text-slate-500 font-bold uppercase">Rows</label>
                                        <input 
                                            type="number" 
                                            className="w-10 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-1 py-0.5 text-slate-200 text-center font-mono font-bold text-[10px]"
                                            value={group.config.rows}
                                            onChange={(e) => {
                                                const val = Math.max(1, e.target.valueAsNumber || 1);
                                                onUpdateConfig(group.id, 'rows', val);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <span className="text-slate-600 text-[10px] pt-3">×</span>
                                    <div className="flex flex-col space-y-0.5">
                                        <label className="text-[7px] text-slate-500 font-bold uppercase">Cols</label>
                                        <input 
                                            type="number" 
                                            className="w-10 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-1 py-0.5 text-slate-200 text-center font-mono font-bold text-[10px]"
                                            value={group.config.cols}
                                            onChange={(e) => {
                                                const val = Math.max(1, e.target.valueAsNumber || 1);
                                                onUpdateConfig(group.id, 'cols', val);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </td>

                            <td className="px-2 py-1 text-center align-middle">
                                <div className="inline-flex flex-col items-center space-y-1">
                                    <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 scale-90">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onUpdateConfig(group.id, 'direction', 'row'); }}
                                            className={`p-1 rounded ${group.config.direction === 'row' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                        >
                                            <ArrowRight size={10} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onUpdateConfig(group.id, 'direction', 'column'); }}
                                            className={`p-1 rounded ${group.config.direction === 'column' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                        >
                                            <ArrowDown size={10} />
                                        </button>
                                    </div>
                                    <div className="bg-black/20 px-1.5 py-0.5 rounded border border-slate-800">
                                        <span className="text-[9px] text-cyan-400 font-mono font-bold">{group.config.fps} FPS</span>
                                    </div>
                                </div>
                            </td>

                            <td className="px-4 py-1 text-right align-middle">
                                <div className="flex justify-end items-center space-x-1">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onGenerateGif(group.id); }}
                                        className="flex items-center space-x-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded shadow-sm transition-colors text-[9px] font-bold uppercase tracking-wide"
                                    >
                                        <Wand2 size={10} /><span>GIF</span>
                                    </button>
                                    <a 
                                        href={group.imageUrl || '#'} 
                                        download={`sheet-${group.id.substring(0,6)}.png`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 hover:border-slate-500 transition-all shadow-sm"
                                    >
                                        <Download size={12} />
                                    </a>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
                                        className="p-1 bg-red-900/10 hover:bg-red-900/30 text-red-500/70 hover:text-red-400 rounded border border-red-900/20 hover:border-red-500/50 transition-all shadow-sm"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                      );
                   })}
                </tbody>
             </table>
           </div>
       </div>
    </div>
  );
};
