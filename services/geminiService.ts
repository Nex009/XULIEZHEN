
import { GoogleGenAI, Type } from "@google/genai";
import { SpriteConfig, ImageResolution, StylePresetId } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isTransient = 
      error.status === 503 || 
      error.code === 503 || 
      error.status === 500 || // Also retry on Internal Server Error
      error.code === 500 ||
      (error.message && error.message.includes('overloaded'));

    if (retries > 0 && isTransient) {
      console.warn(`API Error (${error.status || error.code}). Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Helper to extract MIME type and clean base64 data from a Data URL.
 */
const getBase64Parts = (base64String: string) => {
  const match = base64String.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2]
    };
  }
  // Fallback: assume PNG if no header found, or try to strip known headers
  return {
    mimeType: 'image/png',
    data: base64String.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "")
  };
};

/**
 * Calculates the closest supported aspect ratio for the Gemini API
 * based on the input image dimensions.
 * Supported: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
const determineAspectRatio = (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      
      const supported = [
        { label: "1:1", value: 1.0 },
        { label: "3:4", value: 0.75 },
        { label: "4:3", value: 1.3333 },
        { label: "9:16", value: 0.5625 },
        { label: "16:9", value: 1.7778 },
      ];

      // Find the closest match
      let closest = supported[0];
      let minDiff = Math.abs(ratio - closest.value);

      for (let i = 1; i < supported.length; i++) {
        const diff = Math.abs(ratio - supported[i].value);
        if (diff < minDiff) {
          minDiff = diff;
          closest = supported[i];
        }
      }
      
      console.log(`Detected Template Ratio: ${ratio.toFixed(2)} (${img.width}x${img.height}) -> Using Gemini Aspect Ratio: ${closest.label}`);
      resolve(closest.label);
    };
    
    img.onerror = () => {
       console.warn("Could not load image to determine aspect ratio, defaulting to 1:1");
       resolve("1:1");
    };
    
    img.src = base64Image;
  });
};

export const analyzeSpriteSheet = async (base64Image: string): Promise<Partial<SpriteConfig>> => {
  try {
    const imageParts = getBase64Parts(base64Image);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageParts.mimeType,
              data: imageParts.data
            }
          },
          {
            text: `Analyze this sprite sheet image. It contains a sequence of animation frames arranged in a grid.
            Count the number of rows and columns. 
            Also estimate the total number of valid frames (sometimes the last row is not full).
            Return the result in JSON format.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rows: { type: Type.INTEGER, description: "Number of rows in the grid" },
            cols: { type: Type.INTEGER, description: "Number of columns in the grid" },
            totalFrames: { type: Type.INTEGER, description: "Total actual frames (sprites) in the image" },
          },
          required: ["rows", "cols", "totalFrames"],
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return {
        rows: data.rows,
        cols: data.cols,
        totalFrames: data.totalFrames
      };
    }
    throw new Error("No response text from Gemini");

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const STYLE_PRESETS: Record<StylePresetId, string> = {
  pixel_art: "high-quality pixel art style, crisp edges, retro 8-bit/16-bit game aesthetics, distinct pixels, no anti-aliasing, clean pixel grid",
  vector_flat: "flat vector art style, clean crisp lines, solid colors, modern mobile game aesthetics, svg illustration, minimal gradients, sharp geometry",
  anime_cel: "anime style, cel-shaded, vibrant colors, sharp outlines, japanese animation aesthetics, expressive features",
  watercolor: "watercolor painting style, soft edges, artistic, textured paper feel, fluid strokes, pastel or vibrant watercolor blending",
  sketch: "hand-drawn sketch style, pencil or ink lines, rough texture, artistic loose strokes, concept art feel, monochromatic or sepia",
  custom: "consistent artistic style"
};

export const generateSpriteVariant = async (
  templateBase64: string,
  characterBase64: string,
  prompt: string,
  size: ImageResolution,
  stylePresetId: StylePresetId
): Promise<string> => {
  // Determine best aspect ratio from the template image
  const targetAspectRatio = await determineAspectRatio(templateBase64);

  return retryOperation(async () => {
    try {
      const templateParts = getBase64Parts(templateBase64);
      const characterParts = getBase64Parts(characterBase64);

      const styleDescription = STYLE_PRESETS[stylePresetId] || STYLE_PRESETS['pixel_art'];

      // Construct the prompt
      const textPrompt = `
        Create a high-quality sprite sheet in ${styleDescription}.
        The sprite sheet must be based on the visual style of the character provided in the second image, but rendered in the requested art style.
        
        CRITICAL INSTRUCTIONS:
        1. The layout, grid structure, and poses MUST EXACTLY match the first image (the template sprite sheet).
        2. Visual Style: ${styleDescription}. You MUST maintain this style consistently across all frames.
        3. DO NOT STRETCH the sprites. Maintain the original internal aspect ratio of the characters.
        4. If the output aspect ratio (${targetAspectRatio}) differs from the template, add padding (empty space) rather than stretching the content.
        5. Apply the character's appearance (colors, clothing, features) to the poses in the template.
        6. BACKGROUND: Use a Pure Solid White Background (#FFFFFF). 
           - The background must be #FFFFFF (255, 255, 255).
           - Do NOT use checkerboard patterns.
           - Do NOT use gray/white grid patterns.
           - Do NOT use alpha transparency.
           - Just pure white.
        
        ${prompt ? `Additional instructions: ${prompt}` : ''}
      `;

      // We must recreate the AI client here to ensure it picks up any newly selected API key
      const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const response = await genClient.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType: templateParts.mimeType,
                data: templateParts.data
              }
            },
             {
              inlineData: {
                mimeType: characterParts.mimeType,
                data: characterParts.data
              }
            }
          ]
        },
        config: {
          imageConfig: {
            imageSize: size,
            aspectRatio: targetAspectRatio 
          }
        }
      });

      // Iterate to find the image part
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }

      throw new Error("No image generated in response");

    } catch (error) {
      console.error("Gemini Generation Error:", error);
      throw error;
    }
  });
};

export const generateMemeConceptGrid = async (
  characterBase64: string,
  stylePresetId: StylePresetId
): Promise<string> => {
  return retryOperation(async () => {
    try {
      const characterParts = getBase64Parts(characterBase64);
      const styleDescription = STYLE_PRESETS[stylePresetId] || STYLE_PRESETS['pixel_art'];

      const textPrompt = `
        Create a "Funny Meme/Sticker Pack" for the provided character.
        
        OUTPUT FORMAT:
        1. Generate a single square image containing a perfect 3x3 GRID (9 cells).
        2. Each cell must contain a UNIQUE, HIGHLY EXAGGERATED expression or pose of the character.
        
        CONTENT REQUIREMENTS:
        - The character must match the provided reference image exactly in terms of design.
        - Style: ${styleDescription}.
        - EXPRESSIONS: Go for MAXIMUM EMOTION. Do not make subtle expressions.
          - Use "Anime/Cartoon Physics" exaggeration.
          - Examples: Eyes popping out, flooding tears, exploding with anger, turning into stone, rolling on floor laughing.
          - Poses should be DYNAMIC (not just standing still). Use action lines.
        - TEXT: Each sticker MUST include a handwritten-style CHINESE (Simplified) caption.
          - Text examples: 收到, 疑惑, 哈哈哈, 好的, 加油, 震惊, 摸鱼, 离谱, 哭死.
          - Text should be large, readable, and integrated into the sticker fun.
        
        TECHNICAL REQUIREMENTS:
        - Grid: Strictly 3 rows, 3 columns.
        - Spacing: Leave clear white space between the 9 items.
        - Background: Pure Solid White (#FFFFFF).
      `;

      const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await genClient.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType: characterParts.mimeType,
                data: characterParts.data
              }
            }
          ]
        },
        config: {
          imageConfig: {
            imageSize: '2K', // High res for good slicing
            aspectRatio: "1:1"
          }
        }
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
      throw new Error("No meme grid generated");
    } catch (error) {
      console.error("Gemini Meme Grid Error:", error);
      throw error;
    }
  });
};

export const generateActionSprite = async (
  characterBase64: string,
  actionPrompt: string,
  stylePrompt: string, // This maps to 'prompt' in config, used for additional details
  size: ImageResolution,
  stylePresetId: StylePresetId,
  referenceSpriteSheet?: string | null,
  layoutReference?: string | null // NEW: User uploaded template to enforce grid OR a single image for pose reference
): Promise<string> => {
  return retryOperation(async () => {
    try {
      const characterParts = getBase64Parts(characterBase64);
      
      const styleDescription = STYLE_PRESETS[stylePresetId] || STYLE_PRESETS['pixel_art'];

      let textPrompt = `
        Create a high-quality sprite sheet for game animation in ${styleDescription}.
        
        REFERENCE CHARACTER:
        See the attached character image. You MUST maintain the exact identity, colors, and design of this character.

        ACTION:
        ${actionPrompt}
      `;

      if (layoutReference) {
         // If layoutReference is used, we need to check if it's a grid or a single pose reference.
         // For the Meme Pack feature, layoutReference is a single static sticker image.
         textPrompt += `
         
         POSE REFERENCE:
         A reference image is provided.
         1. Analyze the pose, expression, and text in this reference image.
         2. Animate this specific reference image into a 3x3 loopable sprite sheet.
         3. Keep the Chinese text (if present) visible in the animation (e.g. bouncing, shaking, or static).
         4. Grid: Strictly 3x3 (9 frames).
         
         CRITICAL ANIMATION STYLE - EXAGGERATION:
         - The animation MUST BE HIGH ENERGY and EXAGGERATED.
         - Do NOT create a subtle idle animation.
         - Use "SQUASH AND STRETCH" principles.
         - Make the movement large, bouncy, and distinct.
         - The movement must loop perfectly.
         `;
      } else {
         // STANDARD CREATE MODE (Optimized)
         textPrompt += `
         STRICT GRID LAYOUT REQUIREMENT:
         1. You MUST generate exactly a 3x3 GRID (9 frames total).
         2. DO NOT generate 3x2, 2x3, or 4x4 grids.
         3. Each frame MUST be of equal size.
         4. Ensure strict alignment. Sprites must be centered in their grid cells.
         
         ANIMATION DYNAMICS & QUALITY:
         - The action MUST be dynamic and clear. 
         - Use exaggerated motion ("Cartoon Physics") to make the action readable at small sizes.
         - Squash and Stretch: Deform the character slightly during motion to emphasize weight and speed.
         - Loop: The 9th frame should seamlessly transition back to the 1st frame.
         - Clarity: Keep limbs distinct. Avoid muddy clusters of pixels.
         `;
      }

      textPrompt += `
        REQUIREMENTS:
        1. Visual Style: ${styleDescription}. ${stylePrompt ? `Additional details: ${stylePrompt}` : ''}.
        2. Generate a sequence of animation frames showing the character performing the action.
        3. BACKGROUND: Use a Pure Solid White Background (#FFFFFF). 
           - The background must be #FFFFFF (255, 255, 255).
           - Do NOT use checkerboard patterns.
           - Do NOT use gray/white grid patterns.
           - Do NOT use alpha transparency.
           - Just pure white.
      `;

      if (referenceSpriteSheet) {
        textPrompt += `
        
        CONSISTENCY REQUIREMENT:
        A reference sprite sheet from a previous action is provided.
        You MUST match the visual style, pixel density, stroke width, and color palette of this reference sheet exactly.
        The character in the new action must look like it belongs to the same game asset pack as the reference.
        CRITICAL: Maintain the exact same grid scale and cell size as the reference.
        `;
      }

      textPrompt += `
        OUTPUT FORMAT:
        A single image file containing the sprite sheet.
      `;

      const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const parts: any[] = [{ text: textPrompt }];
      
      // Order matters: Character first
      parts.push({
          inlineData: {
            mimeType: characterParts.mimeType,
            data: characterParts.data
          }
      });

      // If Layout Reference exists, add it (PRIORITY for structure/pose)
      if (layoutReference) {
          const layoutParts = getBase64Parts(layoutReference);
          parts.push({
              inlineData: {
                  mimeType: layoutParts.mimeType,
                  data: layoutParts.data
              }
          });
      }

      // If Style Reference exists, add it (PRIORITY for style)
      if (referenceSpriteSheet) {
          const refParts = getBase64Parts(referenceSpriteSheet);
          parts.push({
              inlineData: {
                  mimeType: refParts.mimeType,
                  data: refParts.data
              }
          });
      }

      const response = await genClient.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: {
          imageConfig: {
            imageSize: size,
            aspectRatio: "1:1" // Default to square for new actions unless layout dictates otherwise
          }
        }
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }

      throw new Error("No image generated in response");

    } catch (error) {
      console.error("Gemini Action Generation Error:", error);
      throw error;
    }
  });
};

export const generateInterpolatedSprite = async (
  startImageBase64: string,
  endImageBase64: string | null,
  templateReference: string | null,
  gridConfig: string, // e.g., "3x3", "4x3"
  stylePresetId: StylePresetId,
  size: ImageResolution
): Promise<string> => {
    return retryOperation(async () => {
        try {
            const startParts = getBase64Parts(startImageBase64);
            const styleDescription = STYLE_PRESETS[stylePresetId] || STYLE_PRESETS['pixel_art'];
            
            const [rows, cols] = gridConfig.split('x').map(Number);
            const totalFrames = rows * cols;

            let textPrompt = `
                Create a high-quality sprite sheet using the provided START FRAME image.
                
                LAYOUT REQUIREMENT:
                - Grid: Strictly ${rows} rows and ${cols} columns (${gridConfig}).
                - Total Frames: ${totalFrames}.
                - Frame Order: Reading order (Row by Row, Left to Right).
                
                ANIMATION TASK:
                Generate a smooth animation sequence on this grid.
                1. Frame 1 (Top-Left) MUST look exactly like the provided START FRAME image.
            `;

            if (endImageBase64) {
                textPrompt += `
                2. The FINAL FRAME (Bottom-Right) MUST look exactly like the provided END FRAME image.
                3. The frames in between must visually morph and animate smoothly from the Start Frame to the End Frame.
                4. The transition must be natural. Preserve volume, mass, and style throughout the transformation.
                `;
            } else {
                textPrompt += `
                2. Generate a looping animation that starts from this frame, performs a natural action, and loops back.
                3. The animation should be coherent and fluid.
                `;
            }

            textPrompt += `
                VISUAL STYLE:
                - Style: ${styleDescription}.
                - If a template reference is provided, strictly follow its layout density and character proportions.
                - BACKGROUND: Pure Solid White (#FFFFFF). No transparency, no artifacts.
            `;

            const parts: any[] = [
                { text: textPrompt },
                {
                    inlineData: {
                        mimeType: startParts.mimeType,
                        data: startParts.data
                    }
                }
            ];

            if (endImageBase64) {
                const endParts = getBase64Parts(endImageBase64);
                parts.push({
                    inlineData: {
                        mimeType: endParts.mimeType,
                        data: endParts.data
                    }
                });
            }

            if (templateReference) {
                const refParts = getBase64Parts(templateReference);
                parts.push({
                    inlineData: {
                        mimeType: refParts.mimeType,
                        data: refParts.data
                    }
                });
            }

            const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await genClient.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts },
                config: {
                    imageConfig: {
                        imageSize: size,
                        aspectRatio: "1:1" // Typically grids are somewhat square, Gemini handles aspect well
                    }
                }
            });

             if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                  }
                }
             }
             
             throw new Error("No interpolated image generated");

        } catch (e) {
            console.error("Interpolation Gen Error", e);
            throw e;
        }
    });
};
