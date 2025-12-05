

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Download, Sparkles, RefreshCw, 
  Monitor, LayoutTemplate, User, 
  Settings2, FileImage, Ghost, Maximize,
  Pin, Copy, Zap, Play, Grid3X3, ZoomIn, ZoomOut, X, Palette,
  ArrowRight, ArrowDown, Crop, Box, Table, Grid, Layers, Wand2, LayoutGrid, Film, SmilePlus, Keyboard, Repeat, ExternalLink
} from 'lucide-react';
import { SpriteConfig, ImageDimensions, ProcessingState, GenerationConfig, ImageResolution, SavedAsset, CanvasNodeData, StylePresetId, NodeGroup } from './types';
import { SpriteCanvas } from './components/SpriteCanvas';
import { PreviewPlayer } from './components/PreviewPlayer';
import { CanvasNode } from './components/CanvasNode';
import { ConnectionLine } from './components/ConnectionLine';
import { SplitFrameEditor } from './components/SplitFrameEditor';
import { GroupTableView } from './components/GroupTableView';
import { GroupGridView } from './components/GroupGridView';
import { analyzeSpriteSheet, generateSpriteVariant, generateActionSprite, generateMemeConceptGrid, generateInterpolatedSprite } from './services/geminiService';
import { generateGif } from './utils/gifBuilder';

const INITIAL_CONFIG: SpriteConfig = {
  rows: 4,
  cols: 4,
  totalFrames: 16,
  fps: 12,
  scale: 1,
  transparent: null,
  autoTransparent: true,
  direction: 'row',
  frameOffsets: {},
  excludedFrames: []
};

// Fixed config for Creative Mode 3x3
const CREATIVE_3x3_CONFIG: SpriteConfig = {
    ...INITIAL_CONFIG,
    rows: 3,
    cols: 3,
    totalFrames: 9,
};

const STYLE_OPTIONS: { id: StylePresetId; label: string }[] = [
  { id: 'pixel_art', label: 'Pixel Art (Default)' },
  { id: 'vector_flat', label: 'Flat Vector' },
  { id: 'anime_cel', label: 'Anime / Cel Shaded' },
  { id: 'watercolor', label: 'Watercolor' },
  { id: 'sketch', label: 'Hand Drawn Sketch' },
  { id: 'custom', label: 'Custom Style' },
];

const INTERPOLATION_GRIDS = ['3x3', '4x3', '4x4', '5x5'];

const App: React.FC = () => {
  // -- App Mode --
  const [viewMode, setViewMode] = useState<'canvas' | 'table' | 'grid'>('canvas');

  // -- Multi-Group State --
  const [groups, setGroups] = useState<Record<string, NodeGroup>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Nodes for the Infinite Canvas
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);

  // Generation Configuration (Global Inputs)
  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    mode: 'template',
    createSubMode: 'manual', // Default to manual input
    templateImage: null,
    templateFiles: [], 
    characterImage: null,
    startImage: null,
    endImage: null,
    interpolationGrid: '3x3',
    prompt: "",
    actionPrompt: "",
    size: '2K',
    stylePresetId: 'pixel_art'
  });
  
  // State to hold the configuration derived from an uploaded GIF in 'gif_match' mode
  const [gifGridConfig, setGifGridConfig] = useState<Partial<SpriteConfig> | null>(null);
  
  const [isTemplateSaved, setIsTemplateSaved] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({ status: 'idle', progress: 0 });

  // Assets Manager State
  const [savedAssets, setSavedAssets] = useState<SavedAsset[]>([]);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);

  // -- Infinite Canvas & Viewport State --
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scale: 0.6, x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const [isDraggingNode, setIsDraggingNode] = useState<string | null>(null);
  const nodeDragStart = useRef({ x: 0, y: 0 });
  const initialNodePos = useRef({ x: 0, y: 0 });

  // Load saved template
  useEffect(() => {
    try {
      const savedTemplate = localStorage.getItem('spriteMotion_template');
      if (savedTemplate) {
        setGenConfig(prev => ({ ...prev, templateImage: savedTemplate }));
        setIsTemplateSaved(true);
      }
    } catch (e) { console.error(e); }
  }, []);

  // -- Helpers --

  const createGroup = (imageUrl: string, dimensions: ImageDimensions, config: SpriteConfig, originalSourceUrl?: string | null): string => {
      const groupId = crypto.randomUUID();
      const newGroup: NodeGroup = {
          id: groupId,
          imageUrl,
          originalSourceUrl: originalSourceUrl || null,
          dimensions,
          config,
          createdAt: Date.now()
      };
      setGroups(prev => ({ ...prev, [groupId]: newGroup }));
      // Select the new group automatically
      setSelectedGroupId(groupId);
      return groupId;
  };

  const deleteGroup = (groupId: string) => {
      const newGroups = { ...groups };
      delete newGroups[groupId];
      setGroups(newGroups);
      
      setNodes(prev => prev.filter(n => n.groupId !== groupId));
      if (selectedGroupId === groupId) setSelectedGroupId(null);
  };

  /**
   * Layout Calculation Logic
   * Recalculates all node positions to ensure no overlap and correct spacing.
   */
  const recalculateLayout = (currentGroups: Record<string, NodeGroup>) => {
    const sortedGroups = Object.values(currentGroups).sort((a, b) => a.createdAt - b.createdAt);
    
    let currentY = 100;
    const newNodes: CanvasNodeData[] = [];
    const GAP_X = 150; 
    const GAP_Y = 150;
    const RAW_WIDTH = 250; // Widened for comparison mode

    sortedGroups.forEach(group => {
        // 1. Raw Node Stats (Dynamic Height based on content)
        // Shows 2 images stacked
        const rawH = 400; 

        // 2. Editor Node Stats (Dynamic Width)
        const aspect = group.dimensions.width > 0 ? group.dimensions.width / group.dimensions.height : 1;
        
        // Fix for "Missing Pixels":
        // The SplitFrameEditor uses CSS Grid with `gap-1` (4px).
        // If there are `cols` columns, we have `cols - 1` gaps horizontally.
        // We must add this to the width so the image 'cells' don't shrink.
        const gapTotal = Math.max(0, (group.config.cols - 1) * 4); 
        
        // Padding Buffer: 
        //  - SplitFrameEditor (p-4 = 32px horizontal)
        //  - CanvasNode (p-1 approx)
        //  - Safety/Scrollbar (~20px)
        const totalPadding = 64; 
        
        // Exact container width needed to house the image pixels + gaps + padding
        const idealWidth = group.dimensions.width + gapTotal + totalPadding;
        
        const editorWidth = Math.min(1200, Math.max(500, idealWidth));
        
        // Approximate height based on aspect ratio + UI chrome
        // We calculate height based on width excluding chrome
        const effectiveImageW = editorWidth - totalPadding;
        const editorImageH = effectiveImageW / aspect;
        const editorHeight = editorImageH + 160; 

        // 3. Preview Node Stats
        const frameW = group.dimensions.width / group.config.cols;
        const frameH = group.dimensions.height / group.config.rows;
        const frameAspect = frameH > 0 ? frameW / frameH : 1;
        
        let previewW = 320;
        let previewH = 360;
        
        if (frameAspect > 1) {
           previewH = (previewW / frameAspect) + 120; 
        } else {
           previewW = (previewH - 120) * frameAspect;
        }
        previewW = Math.max(300, previewW);

        // Max Row Height
        const rowHeight = Math.max(rawH, editorHeight, previewH);

        // X Positions
        const xRaw = 50;
        const xEditor = xRaw + RAW_WIDTH + GAP_X;
        const xPreview = xEditor + editorWidth + GAP_X;

        newNodes.push({
            id: `raw-${group.id}`,
            groupId: group.id,
            type: 'raw',
            title: `Raw Source`,
            position: { x: xRaw, y: currentY },
            width: RAW_WIDTH,
            height: rawH
        });

        newNodes.push({
            id: `editor-${group.id}`,
            groupId: group.id,
            type: 'editor',
            title: `Editor`,
            position: { x: xEditor, y: currentY },
            width: editorWidth,
            height: editorHeight
        });

        newNodes.push({
            id: `preview-${group.id}`,
            groupId: group.id,
            type: 'preview',
            title: `Preview`,
            position: { x: xPreview, y: currentY },
            width: previewW,
            height: previewH
        });

        currentY += rowHeight + GAP_Y;
    });

    setNodes(newNodes);
  };

  // -- Handlers --

  const handleToggleSaveTemplate = () => {
    if (!genConfig.templateImage) return;
    if (isTemplateSaved) {
      localStorage.removeItem('spriteMotion_template');
      setIsTemplateSaved(false);
    } else {
      try {
        localStorage.setItem('spriteMotion_template', genConfig.templateImage);
        setIsTemplateSaved(true);
      } catch (e) {
        alert("Storage full.");
      }
    }
  };

  // Load Template directly as a new Group
  const handleLoadTemplateToCanvas = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (genConfig.templateImage) {
        const img = new Image();
        img.onload = () => {
            createGroup(genConfig.templateImage!, { width: img.width, height: img.height }, { ...INITIAL_CONFIG, scale: 1 });
            setProcessingState({ status: 'idle', progress: 0 });
        };
        img.src = genConfig.templateImage;
    }
  };

  // Helper: Decompose GIF into Sprite Sheet
  const processGifToSpriteSheet = async (file: File) => {
      try {
          const buffer = await file.arrayBuffer();
          // Use modern ImageDecoder API (Chromium based browsers)
          if (!('ImageDecoder' in window)) {
              alert("Your browser does not support ImageDecoder. Please use Chrome/Edge.");
              return;
          }

          // @ts-ignore
          const decoder = new ImageDecoder({ data: buffer, type: 'image/gif' });
          await decoder.tracks.ready;
          
          const frameCount = decoder.tracks.selectedTrack?.frameCount || 1;
          
          // Decode first frame to get dims
          const firstFrameResult = await decoder.decode({ frameIndex: 0 });
          const frameW = firstFrameResult.image.displayWidth;
          const frameH = firstFrameResult.image.displayHeight;
          
          // Calculate Grid (Square-ish)
          const cols = Math.ceil(Math.sqrt(frameCount));
          const rows = Math.ceil(frameCount / cols);
          
          // Determine FPS from first frame duration (duration is in microseconds)
          const duration = firstFrameResult.image.duration; 
          let fps = 12;
          if (duration) {
              fps = Math.round(1000000 / duration);
          }

          // Draw to Canvas
          const canvas = document.createElement('canvas');
          canvas.width = cols * frameW;
          canvas.height = rows * frameH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Draw first frame
          ctx.drawImage(firstFrameResult.image, 0, 0);
          firstFrameResult.image.close();

          setProcessingState({ status: 'analyzing', progress: 0 });

          for (let i = 1; i < frameCount; i++) {
              const result = await decoder.decode({ frameIndex: i });
              const col = i % cols;
              const row = Math.floor(i / cols);
              ctx.drawImage(result.image, col * frameW, row * frameH);
              result.image.close();
              setProcessingState({ status: 'analyzing', progress: (i / frameCount) * 100 });
          }

          const dataUrl = canvas.toDataURL('image/png');
          
          setGenConfig(prev => ({ ...prev, templateImage: dataUrl }));
          setGifGridConfig({
              rows,
              cols,
              totalFrames: frameCount,
              fps,
              direction: 'row'
          });
          setProcessingState({ status: 'idle', progress: 0 });

      } catch (e) {
          console.error("GIF Decode Error", e);
          setProcessingState({ status: 'idle', progress: 0, error: 'Failed to process GIF' });
      }
  };

  // Helper: Slice a 3x3 Grid into 9 Base64 images
  const sliceGridImage = async (base64Grid: string): Promise<string[]> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
              const slices: string[] = [];
              const cols = 3;
              const rows = 3;
              const cellW = img.width / cols;
              const cellH = img.height / rows;

              const canvas = document.createElement('canvas');
              canvas.width = cellW;
              canvas.height = cellH;
              const ctx = canvas.getContext('2d');
              
              if (!ctx) { resolve([]); return; }

              for (let i = 0; i < 9; i++) {
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  
                  ctx.clearRect(0, 0, cellW, cellH);
                  ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
                  slices.push(canvas.toDataURL('image/png'));
              }
              resolve(slices);
          };
          img.src = base64Grid;
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'main' | 'template' | 'character' | 'start' | 'end') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (target === 'template' && genConfig.mode === 'multi_template') {
        setGenConfig(prev => ({ ...prev, templateFiles: Array.from(files) }));
        return;
    }
    
    // Handle GIF Upload specifically for gif_match mode
    if (target === 'template' && genConfig.mode === 'gif_match') {
        const file = files[0];
        if (file.type === 'image/gif') {
            processGifToSpriteSheet(file);
        } else {
            alert("Please upload a GIF file for motion source.");
        }
        return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        const res = ev.target.result;
        if (target === 'main') {
           const img = new Image();
           img.onload = () => {
              createGroup(res, { width: img.width, height: img.height }, { ...INITIAL_CONFIG, scale: 1 });
           };
           img.src = res;
        } else if (target === 'template') {
          setGenConfig(prev => ({ ...prev, templateImage: res }));
          setIsTemplateSaved(false); 
        } else if (target === 'character') {
          setGenConfig(prev => ({ ...prev, characterImage: res }));
        } else if (target === 'start') {
          setGenConfig(prev => ({ ...prev, startImage: res }));
        } else if (target === 'end') {
          setGenConfig(prev => ({ ...prev, endImage: res }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAutoDetect = async () => {
    if (!selectedGroupId || !groups[selectedGroupId]?.imageUrl) return;
    const group = groups[selectedGroupId];
    setProcessingState({ status: 'analyzing', progress: 0 });
    try {
      const result = await analyzeSpriteSheet(group.imageUrl!);
      
      handleGridUpdate(
          selectedGroupId, 
          result.rows ?? group.config.rows, 
          result.cols ?? group.config.cols
      );
      
      setProcessingState({ status: 'idle', progress: 0 });
    } catch (error) {
      setProcessingState({ status: 'idle', progress: 0, error: 'Detection failed.' });
    }
  };

  const handleGenerateSprite = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio && !(await aiStudio.hasSelectedApiKey())) {
        try { await aiStudio.openSelectKey(); } catch (e) { return; }
    }

    if (genConfig.mode === 'interpolated') {
        if (!genConfig.startImage) {
            setProcessingState({ status: 'idle', progress: 0, error: 'Start Frame required' });
            return;
        }
        setProcessingState({ status: 'generating', progress: 10 });
        try {
            const resultBase64 = await generateInterpolatedSprite(
                genConfig.startImage,
                genConfig.endImage,
                genConfig.templateImage,
                genConfig.interpolationGrid,
                genConfig.stylePresetId,
                genConfig.size
            );

            const [rows, cols] = genConfig.interpolationGrid.split('x').map(Number);
            const totalFrames = rows * cols;
            
            await new Promise<void>((resolve) => {
                 const img = new Image();
                 img.onload = () => {
                     createGroup(resultBase64, { width: img.width, height: img.height }, { ...INITIAL_CONFIG, rows, cols, totalFrames }, genConfig.startImage);
                     resolve();
                 };
                 img.src = resultBase64;
            });
            setProcessingState({ status: 'idle', progress: 0 });
        } catch (e) {
            console.error(e);
            setProcessingState({ status: 'idle', progress: 0, error: 'Interpolation Failed' });
        }
        return;
    }
    
    // --- MODE: ACTION / CREATE ---
    if (genConfig.mode === 'action') {
        // Validation
        if (!genConfig.characterImage) {
            setProcessingState({ status: 'idle', progress: 0, error: 'Character required' });
            return;
        }

        // SUB-MODE: AUTO MEME PACK
        if (genConfig.createSubMode === 'meme_pack') {
             setProcessingState({ status: 'generating', progress: 5 });
             try {
                 // 1. Generate 9-Grid
                 const memeGridBase64 = await generateMemeConceptGrid(genConfig.characterImage, genConfig.stylePresetId);
                 setProcessingState({ status: 'analyzing', progress: 20 });
                 
                 // 2. Slice Grid
                 const slices = await sliceGridImage(memeGridBase64);
                 
                 // 3. Generate 9 animations
                 for (let i = 0; i < slices.length; i++) {
                     const slice = slices[i];
                     const progress = 20 + Math.round(((i + 1) / slices.length) * 70);
                     setProcessingState({ status: 'generating', progress });
     
                     // Use the slice as the Layout/Pose reference for the animation
                     const animatedSprite = await generateActionSprite(
                         genConfig.characterImage,
                         "Animate this sticker", 
                         "Matches the style and text of the reference image.",
                         genConfig.size,
                         genConfig.stylePresetId,
                         null, 
                         slice // Layout Reference is the static sticker
                     );
     
                     await new Promise<void>((resolve) => {
                         const img = new Image();
                         img.onload = () => {
                             createGroup(animatedSprite, { width: img.width, height: img.height }, CREATIVE_3x3_CONFIG, slice);
                             resolve();
                         };
                         img.src = animatedSprite;
                     });
                 }
                 setProcessingState({ status: 'idle', progress: 0 });
             } catch (e) {
                 console.error(e);
                 setProcessingState({ status: 'idle', progress: 0, error: 'Meme Pack Gen Failed' });
             }
             return;
        } 
        
        // SUB-MODE: MANUAL ACTIONS
        else {
             if (!genConfig.actionPrompt.trim()) {
                 setProcessingState({ status: 'idle', progress: 0, error: 'Enter actions.' });
                 return;
             }
             
             setProcessingState({ status: 'generating', progress: 0 });
             try {
                  const prompts = genConfig.actionPrompt.split('\n').map(p => p.trim()).filter(p => p.length > 0);
                  let referenceImage: string | null = null;
        
                  for (let i = 0; i < prompts.length; i++) {
                      const prompt = prompts[i];
                      setProcessingState({ status: 'generating', progress: Math.round(((i) / prompts.length) * 100) });
                      
                      const resultBase64 = await generateActionSprite(
                          genConfig.characterImage!, 
                          prompt, 
                          genConfig.prompt, 
                          genConfig.size, 
                          genConfig.stylePresetId,
                          referenceImage,
                          null // No layout reference, just prompts
                      );
                      
                      // Use the first result as reference for style consistency
                      referenceImage = resultBase64;
        
                      await new Promise<void>((resolve) => {
                          const img = new Image();
                          img.onload = () => {
                              createGroup(resultBase64, { width: img.width, height: img.height }, CREATIVE_3x3_CONFIG, null);
                              resolve();
                          };
                          img.src = resultBase64;
                      });
                  }
                  setProcessingState({ status: 'idle', progress: 0 });
             } catch(e) {
                  console.error(e);
                  setProcessingState({ status: 'idle', progress: 0, error: 'Generation Failed' });
             }
             return;
        }
    }

    // --- OTHER MODES ---
    if (genConfig.mode === 'multi_template' && genConfig.templateFiles.length === 0) {
         setProcessingState({ status: 'idle', progress: 0, error: 'Select template files.' });
         return;
    }
    if (genConfig.mode === 'gif_match' && !genConfig.templateImage) {
        setProcessingState({ status: 'idle', progress: 0, error: 'Upload a GIF first.' });
        return;
    }
    if (genConfig.mode === 'template' && !genConfig.templateImage) {
        setProcessingState({ status: 'idle', progress: 0, error: 'Template required.' });
        return;
    }
    
    setProcessingState({ status: 'generating', progress: 0 });

    try {
      if (genConfig.mode === 'template' || genConfig.mode === 'gif_match') {
          // If GIF Match, use the template (which is now the stitched GIF)
          const resultBase64 = await generateSpriteVariant(genConfig.templateImage!, genConfig.characterImage!, genConfig.prompt, genConfig.size, genConfig.stylePresetId);
          const img = new Image();
          img.onload = () => {
             // If GIF match, use the extracted config, otherwise default
             const configToUse = genConfig.mode === 'gif_match' && gifGridConfig 
                ? { ...INITIAL_CONFIG, ...gifGridConfig } 
                : INITIAL_CONFIG;
             
             createGroup(resultBase64, { width: img.width, height: img.height }, configToUse as SpriteConfig, genConfig.templateImage);
          };
          img.src = resultBase64;

      } else if (genConfig.mode === 'multi_template') {
          const files = genConfig.templateFiles;
          for (let i = 0; i < files.length; i++) {
              setProcessingState({ status: 'generating', progress: Math.round((i / files.length) * 100) });
              const file = files[i];
              const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target?.result as string);
                  reader.readAsDataURL(file);
              });
              const resultBase64 = await generateSpriteVariant(base64, genConfig.characterImage!, genConfig.prompt, genConfig.size, genConfig.stylePresetId);
              await new Promise<void>((resolve) => {
                  const img = new Image();
                  img.onload = () => {
                      createGroup(resultBase64, { width: img.width, height: img.height }, INITIAL_CONFIG, base64);
                      resolve();
                  };
                  img.src = resultBase64;
              });
          }
      }
      setProcessingState({ status: 'idle', progress: 0 });
    } catch (error: any) {
      console.error(error);
      setProcessingState({ status: 'idle', progress: 0, error: 'Generation failed.' });
    }
  };

  const handleExportGridImage = () => {
    if (!selectedGroupId) return;
    const group = groups[selectedGroupId];
    if (!group.imageUrl || group.dimensions.width === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = group.dimensions.width;
    canvas.height = group.dimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = '#00e5ff'; 
        ctx.lineWidth = 2;
        ctx.beginPath();
        const rowHeight = group.dimensions.height / group.config.rows;
        const colWidth = group.dimensions.width / group.config.cols;
        for (let i = 1; i < group.config.rows; i++) {
            const y = i * rowHeight;
            ctx.moveTo(0, y);
            ctx.lineTo(group.dimensions.width, y);
        }
        for (let i = 1; i < group.config.cols; i++) {
            const x = i * colWidth;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, group.dimensions.height);
        }
        ctx.stroke();

        const dataUrl = canvas.toDataURL('image/png');
        
        const newAsset: SavedAsset = {
            id: crypto.randomUUID(),
            type: 'sheet',
            url: dataUrl,
            name: `grid-${selectedGroupId.substring(0,4)}.png`,
            timestamp: Date.now(),
            dimensions: group.dimensions
        };
        setSavedAssets(prev => [newAsset, ...prev]);

        const link = document.createElement('a');
        link.download = newAsset.name;
        link.href = dataUrl;
        link.click();
    };
    img.src = group.imageUrl!;
  };

  // Reusable GIF Generation Function
  const generateGifAsset = async (group: NodeGroup): Promise<void> => {
      if (!group.imageUrl) return;
      try {
        const img = new Image();
        img.src = group.imageUrl;
        await img.decode();
        const blob = await generateGif(img, group.config, group.dimensions, (pct) => {
             // If we are processing a batch, maybe don't update global progress for single items?
             // For single item, update global state
             if (processingState.status !== 'generating') { // only if not in batch mode
                 setProcessingState(prev => ({ ...prev, status: 'rendering', progress: pct }));
             }
        });
        const url = URL.createObjectURL(blob);
        const fileName = `sprite-${group.id.substring(0,4)}.gif`;
        
        const newAsset: SavedAsset = {
            id: crypto.randomUUID(),
            type: 'gif',
            url: url,
            name: fileName,
            timestamp: Date.now(),
            dimensions: group.dimensions
        };
        setSavedAssets(prev => [newAsset, ...prev]);
        
        // Auto download
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
      } catch (e) {
          console.error("GIF Gen Failed", e);
          throw e;
      }
  };

  // Wrapper for Single GIF Export (Sidebar/Context)
  const handleExportGif = async (groupId?: string) => {
    const targetId = groupId || selectedGroupId;
    if (!targetId || !groups[targetId]) return;
    
    setProcessingState({ status: 'rendering', progress: 0 });
    try {
        await generateGifAsset(groups[targetId]);
        setProcessingState({ status: 'completed', progress: 100 });
        setTimeout(() => setProcessingState({ status: 'idle', progress: 0 }), 1500);
    } catch(e) {
        setProcessingState({ status: 'idle', progress: 0, error: 'Failed' });
    }
  };

  // BATCH: Generate GIFs for all groups
  const handleBatchGenerateGif = async () => {
      const allGroups: NodeGroup[] = Object.values(groups);
      if (allGroups.length === 0) return;
      
      setProcessingState({ status: 'generating', progress: 0 });
      let completed = 0;
      
      // Process sequentially to avoid memory spikes
      for (const group of allGroups) {
          try {
              await generateGifAsset(group);
          } catch(e) { console.error(e); }
          completed++;
          setProcessingState({ status: 'generating', progress: (completed / allGroups.length) * 100 });
      }
      setProcessingState({ status: 'idle', progress: 0 });
  };

  // BATCH: Download source images
  const handleBatchDownload = () => {
      Object.values(groups).forEach((group: NodeGroup, index) => {
         if (!group.imageUrl) return;
         setTimeout(() => {
             const a = document.createElement('a');
             a.href = group.imageUrl!;
             a.download = `source-${group.id.substring(0,6)}.png`;
             a.click();
         }, index * 200);
      });
  };

  const updateGroupConfig = (groupId: string, newConfig: SpriteConfig) => {
      setGroups(prev => ({
          ...prev,
          [groupId]: {
              ...prev[groupId],
              config: newConfig
          }
      }));
  };

  // Atomic update for Grid Dimensions to avoid Sync issues
  const handleGridUpdate = (groupId: string, newRows: number, newCols: number) => {
      if (!groups[groupId]) return;
      const currentConfig = groups[groupId].config;
      const newTotalFrames = newRows * newCols;
      updateGroupConfig(groupId, {
          ...currentConfig,
          rows: newRows,
          cols: newCols,
          totalFrames: newTotalFrames
      });
  };

  const updateConfigFromSidebar = (key: keyof SpriteConfig, value: any) => {
    if (!selectedGroupId) return;
    if (key === 'rows') {
        handleGridUpdate(selectedGroupId, value, groups[selectedGroupId].config.cols);
        return;
    }
    if (key === 'cols') {
        handleGridUpdate(selectedGroupId, groups[selectedGroupId].config.rows, value);
        return;
    }
    const currentConfig = groups[selectedGroupId].config;
    updateConfigFromEditor(selectedGroupId, key, value);
  };

  const updateConfigFromEditor = (groupId: string, key: keyof SpriteConfig, value: any) => {
    if (!groups[groupId]) return;
    const currentConfig = groups[groupId].config;
    updateGroupConfig(groupId, { ...currentConfig, [key]: value });
  };

  // -- Viewport Logic --
  const handleWheel = (e: React.WheelEvent) => {
    // Zoom Logic: Mouse Wheel or Two-Finger Drag (Trackpad)
    // Zoom centered on pointer
    
    // Scale factor. 1.001 ^ -deltaY provides smooth exponential zoom
    const zoomFactor = Math.pow(1.001, -e.deltaY);
    const newScale = Math.min(Math.max(0.1, viewport.scale * zoomFactor), 5);
    
    // Calculate new viewport position to keep pointer stationary relative to content
    const localX = (e.clientX - viewport.x) / viewport.scale;
    const localY = (e.clientY - viewport.y) / viewport.scale;
    
    const newViewportX = e.clientX - localX * newScale;
    const newViewportY = e.clientY - localY * newScale;
    
    setViewport({ scale: newScale, x: newViewportX, y: newViewportY });
  };
  
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (isDraggingNode) return;
    if (e.button === 0 || e.button === 1) {
        setIsPanning(true);
        panStart.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
    }
  };
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      setIsDraggingNode(nodeId);
      nodeDragStart.current = { x: e.clientX, y: e.clientY };
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
          initialNodePos.current = { x: node.position.x, y: node.position.y };
          if (node.groupId) setSelectedGroupId(node.groupId);
      }
  };
  const handleGlobalMouseMove = (e: React.MouseEvent) => {
      if (isPanning) {
          setViewport(prev => ({ ...prev, x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }));
      }
      if (isDraggingNode) {
          const deltaX = (e.clientX - nodeDragStart.current.x) / viewport.scale;
          const deltaY = (e.clientY - nodeDragStart.current.y) / viewport.scale;
          setNodes(prev => prev.map(n => n.id === isDraggingNode ? { ...n, position: { x: initialNodePos.current.x + deltaX, y: initialNodePos.current.y + deltaY } } : n));
      }
  };
  const handleGlobalMouseUp = () => { setIsPanning(false); setIsDraggingNode(null); };

  // Sync Nodes with Groups using Smart Layout
  useEffect(() => {
    recalculateLayout(groups);
  }, [groups]); 

  const renderConnections = () => {
      const connections = [];
      const groupedNodes: Record<string, CanvasNodeData[]> = {};
      nodes.forEach(n => {
          if (!groupedNodes[n.groupId]) groupedNodes[n.groupId] = [];
          groupedNodes[n.groupId].push(n);
      });

      Object.values(groupedNodes).forEach(groupNodes => {
          const raw = groupNodes.find(n => n.type === 'raw');
          const editor = groupNodes.find(n => n.type === 'editor');
          const preview = groupNodes.find(n => n.type === 'preview');

          if (raw && editor) {
              connections.push(
                  <ConnectionLine 
                    key={`${raw.id}-${editor.id}`}
                    start={{ x: raw.position.x + (raw.width || 200), y: raw.position.y + 40 }} 
                    end={{ x: editor.position.x, y: editor.position.y + 40 }} 
                  />
              );
          }
          if (editor && preview) {
               connections.push(
                  <ConnectionLine 
                    key={`${editor.id}-${preview.id}`}
                    start={{ x: editor.position.x + (editor.width || 400), y: editor.position.y + 40 }} 
                    end={{ x: preview.position.x, y: preview.position.y + 40 }} 
                  />
              );
          }
      });
      return <>{connections}</>;
  };

  const activeGroup = selectedGroupId ? groups[selectedGroupId] : null;

  return (
    <div className="h-screen bg-[#0f1115] text-slate-300 flex font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-[340px] flex-shrink-0 bg-[#15171e] border-r border-slate-800 flex flex-col h-full z-20 shadow-2xl relative">
        <div className="flex flex-col border-b border-slate-800 bg-[#1a1d26]">
            {/* Title Section */}
           <div className="flex items-center justify-between px-4 py-3">
               <div className="flex items-center space-x-2 text-indigo-400 overflow-hidden">
                  <Ghost size={24} className="text-pink-500 flex-shrink-0" />
                  <div className="flex flex-col">
                      <span className="font-bold text-lg text-slate-100 whitespace-nowrap">地质大学博士说AI</span>
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider">序列帧实验室</span>
                  </div>
               </div>
               <button onClick={() => setIsAssetsOpen(true)} className="p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors relative flex-shrink-0" title="Assets & History">
                  <Box size={18} />
                  {savedAssets.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-pink-500 rounded-full"></span>}
               </button>
           </div>
           
           {/* Referral Link */}
           <div className="px-4 pb-3">
               <a 
                 href="https://space.bilibili.com/43149384" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center justify-center space-x-2 w-full py-2 bg-[#fb7299]/10 hover:bg-[#fb7299]/20 border border-[#fb7299]/30 rounded-md text-xs text-[#fb7299] transition-all font-medium group"
               >
                   <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 group-hover:scale-110 transition-transform"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773-1.004.996-2.262 1.52-3.773 1.574H5.333c-1.51-.054-2.77-.578-3.773-1.574-1.004-.996-1.524-2.262-1.56-3.773V9.987c.036-1.511.556-2.765 1.56-3.76 1.003-.996 2.262-1.52 3.773-1.574h.854l-1.9-2.257.646-.672 2.618 3.097h8.897l2.619-3.097.646.672-1.9 2.257Zm-3.607 8.356c0-.682-.56-1.233-1.253-1.233-.692 0-1.253.551-1.253 1.233 0 .682.561 1.233 1.253 1.233.693 0 1.253-.551 1.253-1.233Zm-6.666 0c0-.682-.56-1.233-1.253-1.233-.693 0-1.253.551-1.253 1.233 0 .682.56 1.233 1.253 1.233.693 0 1.253-.551 1.253-1.233Z"></path></svg>
                   <span>地质大学博士说AI专栏</span>
                   <ExternalLink size={10} className="ml-1 opacity-70" />
               </a>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 p-4 space-y-6">
           {/* GENERATION SECTION */}
           <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                <Sparkles size={12} className="text-violet-500" /><span>Synthesis</span>
              </div>
              
              <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700 gap-0.5 overflow-x-auto">
                <button onClick={() => setGenConfig(prev => ({...prev, mode: 'template'}))} className={`flex-1 min-w-fit px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'template' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                   <Copy size={12} /><span>Replica</span>
                </button>
                <button onClick={() => setGenConfig(prev => ({...prev, mode: 'gif_match'}))} className={`flex-1 min-w-fit px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'gif_match' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                   <Film size={12} /><span>GIF Sync</span>
                </button>
                <button onClick={() => setGenConfig(prev => ({...prev, mode: 'interpolated'}))} className={`flex-1 min-w-fit px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'interpolated' ? 'bg-orange-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                   <Repeat size={12} /><span>Morph</span>
                </button>
                <button onClick={() => setGenConfig(prev => ({...prev, mode: 'multi_template'}))} className={`flex-1 min-w-fit px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'multi_template' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                   <Layers size={12} /><span>Batch</span>
                </button>
                <button onClick={() => setGenConfig(prev => ({...prev, mode: 'action'}))} className={`flex-1 min-w-fit px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'action' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                   <Zap size={12} /><span>Create</span>
                </button>
              </div>

              {genConfig.mode === 'action' ? (
                 <div className="space-y-3">
                     {/* Sub-Mode Toggle for Action */}
                     <div className="flex p-1 bg-black/40 rounded border border-white/5">
                        <button 
                            onClick={() => setGenConfig(prev => ({...prev, createSubMode: 'manual'}))}
                            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${genConfig.createSubMode === 'manual' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Keyboard size={10} /><span>Custom Actions</span>
                        </button>
                        <button 
                            onClick={() => setGenConfig(prev => ({...prev, createSubMode: 'meme_pack'}))}
                            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${genConfig.createSubMode === 'meme_pack' ? 'bg-orange-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <SmilePlus size={10} /><span>Meme Pack</span>
                        </button>
                     </div>

                     <div className="h-32 relative">
                         <label className="block relative cursor-pointer group h-full">
                            <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.characterImage ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                                {genConfig.characterImage ? <img src={genConfig.characterImage} className="w-full h-full object-contain" /> : <><User size={24} className="mb-2 text-slate-500" /><span className="text-xs text-slate-500 font-medium">Character Reference</span></>}
                            </div>
                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'character')} className="hidden" />
                         </label>
                     </div>

                     {genConfig.createSubMode === 'manual' ? (
                         <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                              <p className="text-[10px] text-slate-500 mb-1 flex items-center justify-between">
                                  <span>Action Prompts (1 per line)</span>
                                  <span className="text-cyan-500 font-mono">3x3 Auto-Grid</span>
                              </p>
                              <textarea 
                                value={genConfig.actionPrompt} 
                                onChange={(e) => setGenConfig(prev => ({...prev, actionPrompt: e.target.value}))} 
                                placeholder="Walk cycle&#10;Attack animation&#10;Idle breathing" 
                                className="w-full h-24 bg-[#0f1115] border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-indigo-500 outline-none resize-none placeholder-slate-600 font-mono" 
                              />
                         </div>
                     ) : (
                         <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-orange-500/10 border border-orange-500/20 p-3 rounded text-[10px] text-orange-200">
                            <div className="flex items-start space-x-2">
                                <SmilePlus size={16} className="mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-bold mb-1">AUTO MEME GENERATOR</p>
                                    <ul className="list-disc pl-3 space-y-1 opacity-80">
                                        <li>Generates a 3x3 grid of unique stickers</li>
                                        <li>Includes handwritten Chinese text</li>
                                        <li>Automatically animates all 9 stickers</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                     )}
                 </div>
              ) : genConfig.mode === 'interpolated' ? (
                 <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-2">
                          <label className="block relative cursor-pointer group h-24">
                             <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-1 transition-all h-full ${genConfig.startImage ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                                 {genConfig.startImage ? <img src={genConfig.startImage} className="w-full h-full object-contain" /> : <><Play size={16} className="mb-1 text-emerald-500" /><span className="text-[9px] text-emerald-500 font-bold">Start Frame</span></>}
                             </div>
                             <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'start')} className="hidden" />
                          </label>
                          <label className="block relative cursor-pointer group h-24">
                             <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-1 transition-all h-full ${genConfig.endImage ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                                 {genConfig.endImage ? <img src={genConfig.endImage} className="w-full h-full object-contain" /> : <><LayoutGrid size={16} className="mb-1 text-pink-500" /><span className="text-[9px] text-pink-500 font-bold">End Frame (Opt)</span></>}
                             </div>
                             <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'end')} className="hidden" />
                          </label>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Template Ref (Optional)</label>
                          <label className="block relative cursor-pointer group h-16">
                             <div className={`rounded-lg border border-dashed flex items-center justify-center text-center p-1 transition-all h-full ${genConfig.templateImage ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/30 hover:border-slate-500'}`}>
                                 {genConfig.templateImage ? <img src={genConfig.templateImage} className="w-full h-full object-contain" /> : <span className="text-[9px] text-slate-500">Upload Reference Sheet</span>}
                             </div>
                             <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'template')} className="hidden" />
                          </label>
                      </div>

                      <div className="flex items-center space-x-2">
                           <span className="text-[10px] text-slate-400">Grid Preset:</span>
                           <select 
                                value={genConfig.interpolationGrid} 
                                onChange={(e) => setGenConfig(prev => ({...prev, interpolationGrid: e.target.value}))}
                                className="bg-black/50 border border-slate-700 text-xs rounded px-2 py-1 flex-1 outline-none focus:border-indigo-500 text-slate-200"
                           >
                               {INTERPOLATION_GRIDS.map(g => <option key={g} value={g}>{g}</option>)}
                           </select>
                      </div>
                 </div>
              ) : genConfig.mode === 'template' || genConfig.mode === 'gif_match' || genConfig.mode === 'multi_template' ? (
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1 relative h-32">
                      <label className="block relative cursor-pointer group h-full">
                         <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.templateImage || genConfig.templateFiles.length > 0 ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                            {genConfig.mode === 'multi_template' ? (
                                genConfig.templateFiles.length > 0 ? (
                                    <div className="text-center">
                                        <Layers size={20} className="mx-auto mb-2 text-cyan-500" />
                                        <span className="text-[10px] text-cyan-400 font-bold">{genConfig.templateFiles.length} files</span>
                                    </div>
                                ) : (
                                    <><Layers size={20} className="mb-1 text-slate-500" /><span className="text-[10px] text-slate-500">Templates</span></>
                                )
                            ) : (
                                genConfig.templateImage ? (
                                    // Show preview, but if GIF match, show it as a stitched grid with info
                                    genConfig.mode === 'gif_match' ? (
                                        <div className="relative w-full h-full">
                                            <img src={genConfig.templateImage} className="w-full h-full object-contain opacity-50" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="bg-black/70 px-2 py-1 rounded text-white text-[10px] font-mono">
                                                    GIF READY<br/>
                                                    {gifGridConfig?.totalFrames} Frames
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={genConfig.templateImage} className="w-full h-full object-contain" />
                                    )
                                ) : (
                                    genConfig.mode === 'gif_match' ? (
                                        <><Film size={20} className="mb-1 text-emerald-500" /><span className="text-[10px] text-emerald-500">Upload GIF</span></>
                                    ) : (
                                        <><LayoutTemplate size={20} className="mb-1 text-slate-500" /><span className="text-[10px] text-slate-500">Template</span></>
                                    )
                                )
                            )}
                         </div>
                         <input 
                            type="file" 
                            accept={genConfig.mode === 'gif_match' ? "image/gif" : "image/*"}
                            multiple={genConfig.mode === 'multi_template'}
                            onChange={(e) => handleFileChange(e, 'template')} 
                            className="hidden" 
                         />
                      </label>
                      {genConfig.templateImage && genConfig.mode === 'template' && (
                        <>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleSaveTemplate(); }} className={`absolute -top-2 -right-2 p-1.5 rounded-full shadow-md border border-slate-700 transition-all z-20 ${isTemplateSaved ? 'bg-indigo-500 text-white hover:bg-red-500' : 'bg-slate-800 text-slate-400 hover:text-white'}`}><Pin size={10} /></button>
                            <button onClick={handleLoadTemplateToCanvas} className="absolute bottom-1 right-1 p-1.5 rounded bg-black/50 hover:bg-cyan-500 text-white backdrop-blur-sm transition-all z-20 border border-white/10 shadow-sm"><Play size={10} fill="currentColor" /></button>
                        </>
                      )}
                   </div>
                   <div className="space-y-1 h-32">
                      <label className="block relative cursor-pointer group h-full">
                         <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.characterImage ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                            {genConfig.characterImage ? <img src={genConfig.characterImage} className="w-full h-full object-contain" /> : <><User size={20} className="mb-1 text-slate-500" /><span className="text-[10px] text-slate-500">Character</span></>}
                         </div>
                         <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'character')} className="hidden" />
                      </label>
                   </div>
                </div>
              ) : null}

              <div className="space-y-2">
                 <div className="space-y-1">
                   <div className="flex items-center space-x-2 text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                      <Palette size={10} className="text-orange-400" /><span>Art Style</span>
                   </div>
                   <select value={genConfig.stylePresetId} onChange={(e) => setGenConfig(prev => ({...prev, stylePresetId: e.target.value as StylePresetId}))} className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none">
                      {STYLE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                   </select>
                 </div>
                 {genConfig.createSubMode !== 'meme_pack' && (
                     <input type="text" value={genConfig.prompt} onChange={(e) => setGenConfig(prev => ({...prev, prompt: e.target.value}))} placeholder="Extra style details..." className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none placeholder-slate-600" />
                 )}
                 <div className="flex space-x-1">
                    {(['1K', '2K', '4K'] as ImageResolution[]).map((res) => (
                       <button key={res} onClick={() => setGenConfig(prev => ({...prev, size: res}))} className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${genConfig.size === res ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'}`}>{res}</button>
                    ))}
                 </div>
                 <button onClick={handleGenerateSprite} disabled={processingState.status === 'generating'} className="w-full py-2.5 rounded bg-gradient-to-r from-violet-600 to-pink-600 text-white font-bold text-xs shadow-lg hover:shadow-pink-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                     {processingState.status === 'generating' ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                     <span>
                        {genConfig.mode === 'multi_template' ? 'BATCH TEMPLATES' : 
                         genConfig.mode === 'gif_match' ? 'SYNC & GENERATE' : 
                         genConfig.mode === 'interpolated' ? 'INTERPOLATE' :
                         genConfig.mode === 'action' ? (genConfig.createSubMode === 'meme_pack' ? 'GENERATE MEME PACK' : 'CREATE ACTIONS') : 
                         'REPLICATE'}
                     </span>
                 </button>
                 {processingState.status === 'generating' && (
                     <div className="w-full h-1 bg-slate-800 rounded overflow-hidden">
                         <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${processingState.progress}%` }} />
                     </div>
                 )}
              </div>
           </div>

           <div className="h-px bg-slate-800 w-full" />

           {/* CONFIG SECTION */}
           <div className={`space-y-4 transition-opacity ${!selectedGroupId ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <Settings2 size={12} className="text-cyan-500" /><span>Selected Config</span>
                </div>
                <label className="cursor-pointer text-[10px] text-indigo-400 flex items-center bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    <Upload size={10} className="mr-1"/> Override
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'main')} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                 <div><span className="text-slate-500 block mb-1">Rows</span><input type="number" value={activeGroup?.config.rows || 4} onChange={(e) => updateConfigFromSidebar('rows', parseInt(e.target.value) || 1)} className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-1 text-slate-200" /></div>
                 <div><span className="text-slate-500 block mb-1">Cols</span><input type="number" value={activeGroup?.config.cols || 4} onChange={(e) => updateConfigFromSidebar('cols', parseInt(e.target.value) || 1)} className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-1 text-slate-200" /></div>
              </div>

               <div className="grid grid-cols-2 gap-2 text-xs">
                    <button onClick={() => updateConfigFromSidebar('direction', 'row')} className={`flex items-center justify-center space-x-1 py-1.5 rounded border ${activeGroup?.config.direction === 'row' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><ArrowRight size={12} /><span>Horz</span></button>
                    <button onClick={() => updateConfigFromSidebar('direction', 'column')} className={`flex items-center justify-center space-x-1 py-1.5 rounded border ${activeGroup?.config.direction === 'column' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><ArrowDown size={12} /><span>Vert</span></button>
               </div>

              <div className="space-y-3">
                 <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Frames</span><span className="text-cyan-400">{activeGroup?.config.totalFrames || 0}</span></div>
                    <input type="range" min="1" max={(activeGroup?.config.rows || 1) * (activeGroup?.config.cols || 1)} value={activeGroup?.config.totalFrames || 0} onChange={(e) => updateConfigFromSidebar('totalFrames', parseInt(e.target.value))} className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none" />
                 </div>
                 <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>FPS</span><span className="text-cyan-400">{activeGroup?.config.fps || 12}</span></div>
                    <input type="range" min="1" max={60} value={activeGroup?.config.fps || 12} onChange={(e) => updateConfigFromSidebar('fps', parseInt(e.target.value))} className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none" />
                 </div>
              </div>
              
              <button onClick={handleAutoDetect} disabled={!activeGroup?.imageUrl} className="w-full py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-400 flex items-center justify-center space-x-2 disabled:opacity-50">
                   {processingState.status === 'analyzing' ? <RefreshCw size={12} className="animate-spin" /> : <Monitor size={12} />}<span>Detect Grid</span>
              </button>

               <div className="h-px bg-slate-800 w-full my-2" />

               <div className="space-y-3 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                     <input type="checkbox" checked={activeGroup?.config.autoTransparent || false} onChange={(e) => updateConfigFromSidebar('autoTransparent', e.target.checked)} className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0" />
                     <span className="text-xs text-slate-400">Transparent BG</span>
                  </label>
                  <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Export Scale</span>
                      <div className="flex space-x-1">
                          {[1, 2, 4].map((scaleVal) => (
                              <button key={scaleVal} onClick={() => updateConfigFromSidebar('scale', scaleVal)} className={`px-2 py-0.5 text-[10px] rounded border ${activeGroup?.config.scale === scaleVal ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'}`}>{scaleVal}x</button>
                          ))}
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleExportGridImage} disabled={!activeGroup?.imageUrl} className="w-full py-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                         <Grid3X3 size={14} /><span>GRID IMG</span>
                      </button>
                      <button onClick={() => handleExportGif()} disabled={!activeGroup?.imageUrl || processingState.status === 'rendering'} className="w-full py-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                         {processingState.status === 'rendering' ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}<span>GIF</span>
                      </button>
                  </div>
               </div>
           </div>
        </div>
        
        <div className="p-3 border-t border-slate-800 bg-[#0f1115] text-[10px] text-slate-500 font-mono">
            {processingState.error ? <span className="text-red-400">{processingState.error}</span> : <span className="truncate">{processingState.status === 'idle' ? 'Ready' : processingState.status + '...'}</span>}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col bg-[#111217] relative">
         <div className="h-14 flex items-center justify-between px-6 z-20 border-b border-slate-800 bg-[#15171e] relative">
             <div className="flex items-center space-x-4">
                <div className="flex bg-black/30 rounded p-0.5 border border-white/5">
                   <button onClick={() => setViewMode('canvas')} className={`px-3 py-1 text-xs rounded transition-all flex items-center space-x-2 ${viewMode === 'canvas' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                      <Grid size={12} /><span>Canvas</span>
                   </button>
                   <button onClick={() => setViewMode('table')} className={`px-3 py-1 text-xs rounded transition-all flex items-center space-x-2 ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                      <Table size={12} /><span>Data Table</span>
                   </button>
                   <button onClick={() => setViewMode('grid')} className={`px-3 py-1 text-xs rounded transition-all flex items-center space-x-2 ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                      <LayoutGrid size={12} /><span>Data Grid</span>
                   </button>
                </div>
             </div>
             <div className="flex items-center space-x-2 bg-black/30 rounded p-1 border border-white/5">
                 <button onClick={() => setViewport(p => ({...p, scale: Math.max(0.1, p.scale - 0.1)}))} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><ZoomOut size={14} /></button>
                 <span className="text-[10px] w-8 text-center text-slate-500 font-mono">{Math.round(viewport.scale * 100)}%</span>
                 <button onClick={() => setViewport(p => ({...p, scale: Math.min(3, p.scale + 0.1)}))} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><ZoomIn size={14} /></button>
                 <div className="w-px h-4 bg-white/10 mx-1"></div>
                 <button onClick={() => setViewport({scale: 0.6, x: 50, y: 50})} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><Maximize size={14} /></button>
             </div>
         </div>

         {viewMode === 'canvas' ? (
            <div 
                ref={viewportRef}
                className="flex-1 overflow-hidden relative bg-[#0b0c10] cursor-default"
                onWheel={handleWheel}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleGlobalMouseMove}
                onMouseUp={handleGlobalMouseUp}
                onMouseLeave={handleGlobalMouseUp}
            >
                <div 
                    className="absolute inset-0 pointer-events-none opacity-20"
                    style={{
                        backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
                        backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
                        backgroundPosition: `${viewport.x}px ${viewport.y}px`
                    }}
                />

                <div 
                    className="w-full h-full transform origin-top-left will-change-transform"
                    style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
                >
                    {renderConnections()}

                    {nodes.map(node => {
                        const group = groups[node.groupId];
                        if (!group) return null;

                        return (
                            <CanvasNode 
                            key={node.id} 
                            data={node} 
                            isSelected={selectedGroupId === node.groupId} 
                            onMouseDown={handleNodeMouseDown}
                            >
                                {node.type === 'raw' && (
                                    <div className="relative min-w-[200px] bg-black/40 rounded-b-lg overflow-hidden flex flex-col items-center justify-center p-2 space-y-2">
                                        {/* Generated Result */}
                                        <div className="w-full flex justify-center bg-slate-900 rounded border border-slate-700 p-1">
                                             <SpriteCanvas imageUrl={group.imageUrl} maxHeight={150} />
                                        </div>
                                        {/* Original Reference (if exists) */}
                                        {group.originalSourceUrl && (
                                            <div className="w-full flex flex-col justify-center bg-slate-900/50 rounded border border-slate-800 p-1">
                                                <div className="text-[9px] text-slate-500 mb-1 text-center font-bold uppercase tracking-wider">Reference</div>
                                                <div className="flex justify-center opacity-80 hover:opacity-100 transition-opacity">
                                                    <SpriteCanvas imageUrl={group.originalSourceUrl} maxHeight={120} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {node.type === 'editor' && (
                                    <div className="bg-[#0f1115] rounded-b-lg flex flex-col" style={{ width: node.width }}>
                                    <SplitFrameEditor 
                                        imageUrl={group.imageUrl} 
                                        config={group.config} 
                                        dimensions={group.dimensions} 
                                        onUpdateConfig={(key, val) => {
                                            if (key === 'rows' || key === 'cols') {
                                                const newRows = key === 'rows' ? val : group.config.rows;
                                                const newCols = key === 'cols' ? val : group.config.cols;
                                                handleGridUpdate(node.groupId, newRows, newCols);
                                            } else {
                                                updateConfigFromEditor(node.groupId, key, val);
                                            }
                                        }} 
                                    />
                                    </div>
                                )}
                                {node.type === 'preview' && (
                                    <div className="bg-black/50 rounded-b-lg p-2 flex flex-col" style={{ width: node.width, height: node.height }}>
                                        <div className="flex-1 flex items-center justify-center">
                                            <PreviewPlayer 
                                                imageUrl={group.imageUrl} 
                                                config={group.config} 
                                                dimensions={group.dimensions} 
                                                originalSourceUrl={group.originalSourceUrl}
                                            />
                                        </div>
                                        {/* Canvas View: In-Node Generator Button */}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleExportGif(group.id); }}
                                            className="mt-2 w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center space-x-1 transition-colors"
                                        >
                                            <Wand2 size={12} /><span>Export GIF</span>
                                        </button>
                                    </div>
                                )}
                            </CanvasNode>
                        );
                    })}
                    
                    {Object.keys(groups).length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                            <div className="text-center">
                                <Ghost size={64} className="mx-auto mb-4" />
                                <p className="text-lg font-light">Create a Sprite to Begin...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
         ) : viewMode === 'table' ? (
             <GroupTableView 
                groups={groups} 
                onUpdateConfig={(groupId, key, val) => {
                     if (key === 'rows') {
                        handleGridUpdate(groupId, val, groups[groupId].config.cols);
                     } else if (key === 'cols') {
                        handleGridUpdate(groupId, groups[groupId].config.rows, val);
                     } else {
                        updateGroupConfig(groupId, { ...groups[groupId].config, [key]: val });
                     }
                }}
                onDeleteGroup={deleteGroup}
                onSelectGroup={setSelectedGroupId}
                selectedGroupId={selectedGroupId}
                onGenerateGif={handleExportGif}
                onBatchGenerateGif={handleBatchGenerateGif}
                onBatchDownload={handleBatchDownload}
             />
         ) : (
             <GroupGridView 
                groups={groups} 
                onSelectGroup={setSelectedGroupId}
                onDeleteGroup={deleteGroup}
                selectedGroupId={selectedGroupId}
                onGenerateGif={handleExportGif}
                onBatchGenerateGif={handleBatchGenerateGif}
                onBatchDownload={handleBatchDownload}
             />
         )}
      </main>

      {isAssetsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#15171e] w-[800px] max-w-[90vw] h-[600px] max-h-[90vh] rounded-xl border border-slate-800 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2"><Box size={18}/> Assets Library</h2>
                    <button onClick={() => setIsAssetsOpen(false)}><X size={20} className="text-slate-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {savedAssets.length === 0 ? (
                        <div className="text-center text-slate-600 mt-20">No assets saved yet.</div>
                    ) : (
                        <div className="grid grid-cols-4 gap-4">
                            {savedAssets.map((asset) => (
                                <div key={asset.id} className="bg-slate-800 p-2 rounded border border-slate-700 hover:border-indigo-500 transition-colors group relative">
                                    <div className="aspect-square bg-slate-900 rounded overflow-hidden flex items-center justify-center mb-2">
                                        <img src={asset.url} className="max-w-full max-h-full object-contain" alt="asset" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] text-slate-500 truncate flex-1">{asset.name}</div>
                                        <span className={`text-[9px] px-1 rounded uppercase ${asset.type === 'gif' ? 'bg-pink-900 text-pink-300' : 'bg-cyan-900 text-cyan-300'}`}>{asset.type}</span>
                                    </div>
                                    <a href={asset.url} download={asset.name} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-600"><Download size={12}/></a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;