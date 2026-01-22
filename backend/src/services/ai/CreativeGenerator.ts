import OpenAI from 'openai';
import axios from 'axios';

// Alex Hormozi-style base prompt for image and video generation
const HORMOZI_CREATIVE_BASE_PROMPT = `Act in the style of Alex Hormozi's direct-response principles. Create high-volume ad creatives built for aggressive testing. Every output must be simple, blunt, and impossible to misunderstand. One idea. One pain. One bold promise. One next step. Visuals should feel native and imperfect (phone-shot, raw framing, fast cuts, no polish). Hooks must hit in the first 1–2 seconds with outcome-first or problem-interrupt statements. Copy must be short and readable on mute. Lead with numbers and proof (specific results, timelines, comparisons). Generate multiple variations per concept (hooks, angles, formats, lengths) to maximize learning speed. Optimize for clarity over cleverness, volume over perfection, and learning over opinions—only goal: find what converts fastest at scale.`;

export class CreativeGenerator {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async generateImage(prompt: string, size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'): Promise<string> {
    try {
      const response = await this.getClient().images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
      });

      return response.data?.[0]?.url || '';
    } catch (error: any) {
      throw new Error(`DALL-E API error: ${error.message}`);
    }
  }

  async generateImageVariations(
    imageBuffer: Buffer,
    count: number = 3,
    prompt?: string
  ): Promise<string[]> {
    try {
      // Use DALL-E 3 to generate variations based on the uploaded image
      // Since DALL-E 3 doesn't support direct image input, we'll use GPT-4 Vision
      // to analyze the image and generate a descriptive prompt, then create variations
      
      // First, convert image buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${base64Image}`;

      // Analyze the image to create a variation prompt
      const analysisPrompt = prompt || `Create ${count} variations of this image with different:
- Backgrounds or settings
- Color schemes
- Compositions or angles
- Visual styles

Maintain the core subject and message but make each variation visually distinct for A/B testing.`;

      // Use GPT-4 Vision to describe the image
      const visionResponse = await this.getClient().chat.completions.create({
        model: 'gpt-4o', // Updated from deprecated gpt-4-vision-preview
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Describe this image in detail, focusing on the main subject, colors, composition, and style. This description will be used to generate variations.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        max_tokens: 200,
      });

      const imageDescription = visionResponse.choices[0]?.message.content || '';

      // Generate variations using DALL-E 3
      const variations: string[] = [];
      const variationPrompts: string[] = [];

      // Create different prompts for each variation
      for (let i = 0; i < count; i++) {
        const variationPrompt = `${imageDescription}. ${analysisPrompt} Variation ${i + 1}: Create a distinct version with different visual elements while keeping the core message.`;
        variationPrompts.push(variationPrompt);
      }

      // Generate all variations
      for (const variationPrompt of variationPrompts) {
        const response = await this.getClient().images.generate({
          model: 'dall-e-3',
          prompt: variationPrompt,
          n: 1,
          size: '1024x1024',
        });
        if (response.data?.[0]?.url) {
          variations.push(response.data[0].url);
        }
      }

      return variations;
    } catch (error: any) {
      throw new Error(`Failed to generate image variations: ${error.message}`);
    }
  }

  async analyzeCreative(imageUrl: string): Promise<{
    hookStrength: number;
    contrast: number;
    hasFace: boolean;
    colorAnalysis: string;
    recommendations: string[];
  }> {
    try {
      const prompt = `Analyze this Facebook ad image for:
1. Hook strength (0-100): How likely is it to stop scrolling?
2. Contrast level (0-100): Visual appeal and readability
3. Face detection: Does it contain a human face?
4. Color analysis: What colors dominate and their psychological impact
5. Recommendations: Specific improvements for better performance

Return your analysis as JSON with these fields.`;

      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4o', // Updated from deprecated gpt-4-vision-preview
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 500,
      });

      const content = response.choices[0]?.message.content || '{}';
      const analysis = JSON.parse(content);

      return {
        hookStrength: analysis.hookStrength || 50,
        contrast: analysis.contrast || 50,
        hasFace: analysis.hasFace || false,
        colorAnalysis: analysis.colorAnalysis || 'Neutral',
        recommendations: analysis.recommendations || [],
      };
    } catch (error: any) {
      // Fallback if vision API fails
      return {
        hookStrength: 50,
        contrast: 50,
        hasFace: false,
        colorAnalysis: 'Unable to analyze',
        recommendations: ['Ensure high contrast', 'Include human faces if relevant'],
      };
    }
  }

  /**
   * Analyze image and generate detailed description for variation generation
   */
  async analyzeImageForVariations(
    imageBuffer: Buffer,
    userInstructions?: string
  ): Promise<{
    description: string;
    aspectRatio: string;
    dimensions: { width: number; height: number };
    style: string;
    mainSubject: string;
    colors: string[];
    textElements: any[];
    composition?: string;
    background?: string;
    preserveElements?: any[];
    changeableElements?: any[];
    coreConcept?: string;
    currentStyle?: string;
    currentColors?: string[];
    currentBackground?: string;
  }> {
    try {
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${base64Image}`;

      // @ts-ignore - image-size doesn't have TypeScript types
      const sizeOf = require('image-size');
      const dimensions = sizeOf(imageBuffer);
      const aspectRatio = `${dimensions.width}:${dimensions.height}`;

      const analysisPrompt = `${HORMOZI_CREATIVE_BASE_PROMPT}

You are analyzing a Facebook ad image/video to generate variants where the CORE CONCEPT stays identical, but visual elements can vary.

CRITICAL: The core concept, main subject identity, and all text must remain EXACTLY the same. Only visual styling elements can change.

Analyze this image with extreme precision:

1. CORE CONCEPT (MUST STAY IDENTICAL):
   - What is the main message/idea of this ad?
   - What is the product/service being promoted?
   - What is the value proposition?
   - What problem does it solve?

2. MAIN SUBJECT (CORE STAYS, DETAILS CAN VARY):
   - Describe the person, product, or main focal point
   - CORE: Identity, pose, expression, positioning, what they're doing
   - CRITICAL FOR HUMANS: If humans are present, their faces and bodies must remain EXACTLY as they are - preserve facial features, body shape, proportions, and poses
   - CAN VARY: Clothing style, colors, accessories, props (can add/change)

3. TEXT ELEMENTS (MUST STAY IDENTICAL):
   - Extract ALL text exactly as it appears, including punctuation, numbers, symbols
   - Note the exact spelling, capitalization, and formatting
   - CAN VARY: Font style, font color, text effects, text position (slightly)
   - MUST STAY: Exact words, numbers, symbols, meaning

4. VISUAL ELEMENTS (CAN VARY):
   - Current style: Photography style, lighting, color grading, filters, aesthetic
   - Current colors: Dominant colors and color scheme
   - Current background: Description and type
   - Current composition: Layout structure and visual hierarchy
   - CAN ADD: People, effects, visual elements, decorative items
   - CAN CHANGE: Style, colors, background, lighting, effects

5. WHAT MUST STAY THE SAME:
   - Core concept and message
   - Main subject identity and core appearance
   - Human faces and bodies (if present): facial features, body shape, proportions, poses must remain EXACTLY as they are
   - All text content (exact words, numbers, symbols)
   - Overall composition structure
   - Product/service being shown

6. WHAT CAN VARY:
   - Visual style (professional → casual, modern → classic, etc.)
   - Font style and color (but text content stays same)
   - Background (different settings, colors, environments)
   - Colors and color scheme
   - Lighting and effects
   - Clothing and accessories on people
   - Additional visual elements (can add people, effects, decorative items)
   - Minor composition adjustments

${userInstructions ? `\nUSER VARIATION INSTRUCTIONS: ${userInstructions}\nIdentify what should change while keeping the core concept identical.` : ''}

Return your analysis as JSON with these fields:
- coreConcept: The main message/idea that must stay identical
- mainSubject: Detailed description of main subject (core identity that stays, details that can vary)
- textElements: Array of objects with {text: "exact text (MUST STAY)", position: "where it is", currentStyle: "current font style/color (CAN VARY)", size: "relative size"}
- currentStyle: Current visual style description (CAN VARY)
- currentColors: Array of current dominant colors (CAN VARY)
- currentBackground: Current background description (CAN VARY)
- composition: Current layout structure (core structure stays, details can vary)
- preserveElements: Array of core elements that must remain identical (concept, text, main subject identity)
- changeableElements: Array of elements that can be modified (style, colors, background, clothing, effects, additional elements)`;

      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: analysisPrompt,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000, // Increased for more detailed analysis
      });

      const content = response.choices[0]?.message.content || '{}';
      const analysis = JSON.parse(content);

      // Parse text elements - handle both string arrays and object arrays
      let parsedTextElements: any[] = [];
      if (analysis.textElements) {
        parsedTextElements = analysis.textElements.map((item: any) => {
          if (typeof item === 'string') {
            return { text: item, position: 'unknown', style: 'unknown', currentStyle: 'unknown' };
          }
          // Ensure currentStyle exists (use style as fallback)
          return {
            ...item,
            currentStyle: item.currentStyle || item.style || 'unknown',
          };
        });
      }
      
      return {
        description: analysis.description || 'A Facebook ad image',
        aspectRatio,
        dimensions: { width: dimensions.width, height: dimensions.height },
        style: analysis.style || 'modern',
        mainSubject: analysis.mainSubject || 'product',
        colors: analysis.colors || [],
        textElements: parsedTextElements,
        composition: analysis.composition || '',
        background: analysis.background || '',
        preserveElements: analysis.preserveElements || [],
        changeableElements: analysis.changeableElements || [],
        coreConcept: analysis.coreConcept || analysis.description || '',
        currentStyle: analysis.currentStyle || analysis.style || 'modern',
        currentColors: analysis.currentColors || analysis.colors || [],
        currentBackground: analysis.currentBackground || analysis.background || '',
      };
    } catch (error: any) {
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  /**
   * Generate image variations using OpenAI DALL-E 3
   * Analyzes the original image, creates prompts based on user instructions,
   * and generates high-quality variations preserving aspect ratio
   */
  async generateImageVariationsWithOpenAI(
    imageBuffer: Buffer,
    count: number = 3,
    userInstructions?: string
  ): Promise<{
    imageUrls: string[];
    prompts: string[];
    analysis: any;
  }> {
    try {
      // Step 1: Analyze the image
      let analysis;
      try {
        analysis = await this.analyzeImageForVariations(imageBuffer, userInstructions);
      } catch (error: any) {
        console.error('[CreativeGenerator] Image analysis failed:', error);
        throw new Error(`Image analysis failed: ${error.message || 'Unknown error'}`);
      }

      // Step 2: Determine size based on aspect ratio
      const { width, height } = analysis.dimensions;
      const ratio = width / height;
      
      let size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
      if (ratio > 1.5) {
        // Wide image (16:9 or wider)
        size = '1792x1024';
      } else if (ratio < 0.7) {
        // Tall image (9:16 or taller)
        size = '1024x1792';
      }
      // Otherwise use square (1:1)

      // Step 3: Create variation prompts with production-quality specifications
      const variationPrompts: string[] = [];
      
      // Extract text elements properly (handle both string arrays and object arrays)
      const textElements = analysis.textElements || [];
      const textStrings = textElements.map((item: any) => {
        if (typeof item === 'string') return item;
        return item.text || item;
      });
      
      // Generate variation options
      const variationOptions = [
        { type: 'style', desc: 'Change visual style (professional → casual, modern → classic, bold → minimal)' },
        { type: 'colors', desc: 'Change color scheme and palette while keeping core concept' },
        { type: 'background', desc: 'Change background setting, environment, or backdrop' },
        { type: 'font', desc: 'Change font style and text colors while keeping exact text content' },
        { type: 'effects', desc: 'Add visual effects, lighting changes, or filters' },
        { type: 'elements', desc: 'Add people, decorative elements, or additional visual components' },
        { type: 'clothing', desc: 'Change clothing, accessories, or styling on people' },
      ];

      for (let i = 0; i < count; i++) {
        // Select variation type (cycle through options)
        const variationType = variationOptions[i % variationOptions.length];
        
        // Build structured prompt
        let prompt = `${HORMOZI_CREATIVE_BASE_PROMPT}\n\n`;
        
        // Core concept (MUST STAY IDENTICAL)
        const coreConcept = analysis.coreConcept || analysis.description || `A Facebook ad for ${analysis.mainSubject || 'the product/service'}`;
        prompt += `CORE CONCEPT (MUST STAY IDENTICAL):\n${coreConcept}\n\n`;
        prompt += `⚠️ CRITICAL: The core concept, main message, and all text content must remain EXACTLY the same. Only visual styling can change.\n\n`;
        
        // Main description
        prompt += `A Facebook ad image variant that preserves the core concept but varies visual elements.\n\n`;
        
        // Layout section (core structure stays, details can vary)
        prompt += `Layout:\n`;
        if (analysis.composition) {
          prompt += `- Core structure: ${analysis.composition} (maintain core layout, can adjust details)\n`;
        }
        
        // Text elements (content stays, style can vary)
        if (textStrings.length > 0) {
          textStrings.forEach((text: string, idx: number) => {
            const textElement = analysis.textElements[idx];
            const position = textElement?.position || 'prominent position';
            const currentStyle = textElement?.currentStyle || textElement?.style || 'bold, readable font';
            prompt += `- ${position}: "${text}" (EXACT TEXT - MUST STAY SAME)\n`;
            prompt += `  Current style: ${currentStyle} (CAN VARY: change font style, color, effects)\n`;
          });
        } else {
          prompt += `- Clear, prominent headline and supporting text (exact text must stay, style can vary)\n`;
        }
        
        // Visuals section
        prompt += `\nVisuals:\n`;
        const mainSubject = analysis.mainSubject || 'the main subject';
        prompt += `- Main subject: ${mainSubject}\n`;
        prompt += `  CORE (must stay): Identity, pose, expression, what they're doing\n`;
        prompt += `  CAN VARY: Clothing style, colors, accessories, props, effects\n`;
        prompt += `  ⚠️ CRITICAL: If humans are present in the original image, their faces and bodies must remain EXACTLY as they are - do not change facial features, body shape, or proportions. Only clothing, colors, and accessories can vary.\n`;
        
        // Variation-specific instructions
        if (userInstructions) {
          prompt += `- Variation focus: ${userInstructions}\n`;
        } else {
          switch (variationType.type) {
            case 'style':
              prompt += `- Variation: Change visual style (try different aesthetic: professional/casual, modern/classic, bold/minimal)\n`;
              break;
            case 'colors':
              prompt += `- Variation: Change color scheme and palette (try different color combinations while keeping core concept)\n`;
              break;
            case 'background':
              prompt += `- Variation: Change background setting (try different environments, settings, or backdrops)\n`;
              break;
            case 'font':
              prompt += `- Variation: Change font style and text colors (try different typography while keeping exact text content)\n`;
              break;
            case 'effects':
              prompt += `- Variation: Add visual effects, change lighting, or apply filters\n`;
              break;
            case 'elements':
              prompt += `- Variation: Add people, decorative elements, or additional visual components\n`;
              break;
            case 'clothing':
              prompt += `- Variation: Change clothing, accessories, or styling on people\n`;
              break;
          }
        }
        
        if (analysis.currentBackground) {
          prompt += `- Current background: ${analysis.currentBackground} (can be changed)\n`;
        }
        if (analysis.currentColors && analysis.currentColors.length > 0) {
          const colorList = analysis.currentColors.map((c: any) => typeof c === 'string' ? c : (c as any).color || c).slice(0, 3).join(', ');
          prompt += `- Current colors: ${colorList} (can be changed)\n`;
        }
        
        // Style section
        prompt += `\nStyle:\n`;
        prompt += `- Current style: ${analysis.currentStyle || analysis.style || 'Modern, professional'} (CAN VARY)\n`;
        prompt += `- Native, authentic feel (phone-shot aesthetic, raw framing, imperfect polish)\n`;
        prompt += `- Simple, blunt, impossible to misunderstand\n`;
        prompt += `- One clear idea, one pain point, one bold promise\n`;
        prompt += `- Clean typography, high contrast for readability\n`;
        prompt += `- Text readable on mute (short, scannable)\n`;
        
        // CTA section
        const ctaText = textStrings.find((t: string) => 
          t.toLowerCase().includes('try') || 
          t.toLowerCase().includes('get') || 
          t.toLowerCase().includes('start') ||
          t.toLowerCase().includes('learn') ||
          t.toLowerCase().includes('buy')
        );
        if (ctaText) {
          prompt += `\nCTA:\n`;
          prompt += `- Clear call-to-action button or text: "${ctaText}" (exact text must stay, style can vary)\n`;
        } else {
          prompt += `\nCTA:\n`;
          prompt += `- Clear, action-oriented call-to-action button or text\n`;
        }
        
        // Aspect ratio
        prompt += `\nAspect ratio: ${analysis.aspectRatio}, ad-ready, high resolution\n`;
        
        // Critical requirements
        prompt += `\n⚠️ CRITICAL REQUIREMENTS:\n`;
        prompt += `- Core concept and message: MUST STAY IDENTICAL\n`;
        prompt += `- All text content: MUST STAY EXACTLY THE SAME (words, numbers, symbols)\n`;
        prompt += `- Main subject identity: MUST STAY THE SAME (who/what, pose, expression, what they're doing)\n`;
        prompt += `- HUMAN FACES AND BODIES: If humans are present in the original image, their faces and bodies must remain EXACTLY as they are - preserve facial features, body shape, proportions, and poses. Only clothing, colors, accessories, and styling can vary.\n`;
        prompt += `- CAN VARY: Visual style, colors, background, font style, effects, clothing, additional elements\n`;
        if (textStrings.length > 0) {
          prompt += `- Text to preserve exactly: ${textStrings.map((t: string) => `"${t}"`).join(', ')}\n`;
        }
        
        variationPrompts.push(prompt);
      }

      // Step 4: Generate all variations
      const imageUrls: string[] = [];
      const errors: string[] = [];
      
      console.log(`[CreativeGenerator] Generating ${variationPrompts.length} variations with gpt-image-1...`);
      
      for (let i = 0; i < variationPrompts.length; i++) {
        try {
          
          // Use Images API with gpt-image-1 model, with fallback to DALL-E 3
          let base64Image: string | null = null;
          let useDalle3Fallback = false;
          
          try {
            // Use images.edit() API directly - faster than Responses API
            // Create a File object from the buffer (SDK expects File, not Buffer)
            const imageFile = new File([imageBuffer], 'image.png', { type: 'image/png' });
            const result = await this.getClient().images.edit({
              model: 'gpt-image-1.5',
              image: imageFile,
              prompt: variationPrompts[i],
            });

            // Extract base64 from result
            if (result.data && result.data[0] && result.data[0].b64_json) {
              base64Image = result.data[0].b64_json;
            } else if (result.data && result.data[0] && result.data[0].url) {
              // If URL is returned instead, download it and convert to base64
              const imageResponse = await axios.get(result.data[0].url, { responseType: 'arraybuffer' });
              base64Image = Buffer.from(imageResponse.data).toString('base64');
            }
          } catch (apiError: any) {
            console.error('[CreativeGenerator] gpt-image-1 API error:', apiError.message);
            useDalle3Fallback = true;
          }
          
          // Fallback to DALL-E 3 if gpt-image-1 fails or is not available
          if (!base64Image || useDalle3Fallback) {
            try {
              
              // Enhance prompt for DALL-E 3 with even more specific instructions
              let dallePrompt = variationPrompts[i];
              
              // DALL-E 3 specific enhancements
              if (textStrings.length > 0) {
                dallePrompt += `\n\nTEXT ACCURACY IS CRITICAL: The following text must appear EXACTLY as written: ${textStrings.map((t: string) => `"${t}"`).join(', ')}. Each word must be correctly spelled and clearly readable.`;
              }
              
              const dalleResponse = await this.getClient().images.generate({
                model: 'dall-e-3',
                prompt: dallePrompt,
                n: 1,
                size: size,
                quality: 'hd', // Use HD quality for better results
                response_format: 'url',
              });

              if (dalleResponse.data?.[0]?.url) {
                // Convert URL to base64 for consistency
                const axios = require('axios');
                const imageResponse = await axios.get(dalleResponse.data[0].url, {
                  responseType: 'arraybuffer',
                });
                const buffer = Buffer.from(imageResponse.data, 'binary');
                base64Image = buffer.toString('base64');
              }
            } catch (dalleError: any) {
              throw new Error(`Both gpt-5 and DALL-E 3 failed. DALL-E 3 error: ${dalleError.message}`);
            }
          }

          if (base64Image) {
            // Convert base64 to data URL for consistency with existing download logic
            const dataUrl = `data:image/png;base64,${base64Image}`;
            imageUrls.push(dataUrl);
          } else {
            const errorMsg = `Variation ${i + 1}: No image in response`;
            console.error(`[CreativeGenerator] ${errorMsg}`);
            errors.push(errorMsg);
          }
        } catch (error: any) {
          const errorMsg = `Variation ${i + 1}: ${error.message || 'Unknown error'}`;
          console.error(`[CreativeGenerator] ${errorMsg}`, error);
          errors.push(errorMsg);
          
          // If it's an API key error, throw immediately
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            throw new Error(`OpenAI API authentication failed: ${error.message}. Please check your OPENAI_API_KEY environment variable.`);
          }
          
          // If it's a rate limit error, throw immediately
          if (error.message?.includes('rate limit') || error.status === 429) {
            throw new Error(`OpenAI rate limit exceeded: ${error.message}. Please try again later.`);
          }
          
          // Continue with other variations even if one fails
        }
      }
      
      if (imageUrls.length === 0 && errors.length > 0) {
        throw new Error(`All variations failed to generate. Errors: ${errors.join('; ')}`);
      }
      

      return {
        imageUrls,
        prompts: variationPrompts,
        analysis,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error('[CreativeGenerator] generateImageVariationsWithOpenAI failed:', {
        message: errorMessage,
        stack: error.stack,
        count,
        hasInstructions: !!userInstructions
      });
      
      // Provide more specific error messages
      if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('API key')) {
        throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.');
      }
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        throw new Error('OpenAI rate limit exceeded. Please wait a moment and try again.');
      }
      
      if (errorMessage.includes('analysis')) {
        throw new Error(`Image analysis failed: ${errorMessage}`);
      }
      
      throw new Error(`Failed to generate image variations: ${errorMessage}`);
    }
  }
}

