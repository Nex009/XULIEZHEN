
export interface SpriteConfig {
  rows: number;
  cols: number;
  totalFrames: number; // Useful if the last row isn't full
  fps: number;
  scale: number;
  transparent: string | null; // Hex color for transparency replacement if needed, usually null
  autoTransparent: boolean; // New flag for automatic background removal
  direction: 'row' | 'column'; // 'row' = Horizontal (Standard), 'column' = Vertical
  frameOffsets: Record<number, { x: number; y: number }>; // Custom X/Y shift per frame index
  excludedFrames: number[]; // Array of frame indices to skip/delete
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessingState {
  status: 'idle' | 'analyzing' | 'rendering' | 'generating' | 'completed';
  progress: number; // 0 to 100
  error?: string;
}

export type ImageResolution = '1K' | '2K' | '4K';

export type GenerationMode = 'template' | 'action' | 'multi_template' | 'gif_match' | 'interpolated';

export type CreateSubMode = 'manual' | 'meme_pack';

export type StylePresetId = 'pixel_art' | 'vector_flat' | 'anime_cel' | 'watercolor' | 'sketch' | 'custom';

export interface GenerationConfig {
  mode: GenerationMode;
  createSubMode: CreateSubMode; // Toggle for the 'action' mode
  templateImage: string | null;
  templateFiles: File[]; // New: For multi-template mode
  characterImage: string | null;
  startImage: string | null; // New: For interpolation mode
  endImage: string | null;   // New: For interpolation mode
  interpolationGrid: string; // New: Preset grid for interpolation (e.g., '3x3')
  prompt: string; // Style prompt / Additional instructions
  actionPrompt: string; // Specific action description for 'action' mode
  size: ImageResolution;
  stylePresetId: StylePresetId;
}

export type AssetType = 'gif' | 'sheet';

export interface SavedAsset {
  id: string;
  type: AssetType;
  url: string;
  name: string;
  timestamp: number;
  dimensions: { width: number; height: number };
}

export interface Position {
  x: number;
  y: number;
}

export interface CanvasNodeData {
  id: string;
  groupId: string; // Link to the NodeGroup
  type: 'raw' | 'editor' | 'preview';
  title: string;
  position: Position;
  width?: number;
  height?: number;
}

export interface NodeGroup {
  id: string;
  imageUrl: string | null;
  originalSourceUrl?: string | null; // Store original template/gif for comparison
  dimensions: ImageDimensions;
  config: SpriteConfig;
  createdAt: number;
}
