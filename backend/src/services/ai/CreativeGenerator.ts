import OpenAI from 'openai';
import axios from 'axios';

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
    textElements: string[];
  }> {
    try {
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${base64Image}`;

      // @ts-ignore - image-size doesn't have TypeScript types
      const sizeOf = require('image-size');
      const dimensions = sizeOf(imageBuffer);
      const aspectRatio = `${dimensions.width}:${dimensions.height}`;

      const analysisPrompt = `You are analyzing a Facebook ad image for high-quality variation generation. This is CRITICAL for production-ready ads.

Analyze this image with extreme precision:

1. TEXT ELEMENTS (MOST IMPORTANT):
   - Extract ALL text exactly as it appears, including punctuation, numbers, symbols
   - Note the exact spelling, capitalization, and formatting
   - Describe the font style, size, and color
   - Note the position of each text element
   - If there are numbers or currency symbols, capture them exactly (e.g., "€50K+", "90 DAYS")

2. MAIN SUBJECT:
   - Describe the person, product, or main focal point in detail
   - Include clothing, pose, expression, positioning
   - Note any props or objects they're holding/interacting with

3. VISUAL STYLE:
   - Photography style (professional, candid, studio, etc.)
   - Lighting (bright, dramatic, soft, etc.)
   - Color grading or filters
   - Overall aesthetic (modern, classic, bold, etc.)

4. COMPOSITION:
   - Layout structure (where elements are positioned)
   - Rule of thirds, symmetry, etc.
   - Focal points and visual hierarchy

5. BACKGROUND:
   - Current background description
   - What can be changed vs what must stay

6. COLORS:
   - Dominant colors and their hex codes if possible
   - Color scheme (monochromatic, complementary, etc.)

${userInstructions ? `\nUSER VARIATION INSTRUCTIONS: ${userInstructions}\nIdentify what should change vs what must remain identical.` : ''}

Return your analysis as JSON with these fields:
- description: Extremely detailed description of the entire image
- style: Precise visual style description
- mainSubject: Detailed description of main subject (person/product) with all visual details
- colors: Array of dominant colors with descriptions
- textElements: Array of objects with {text: "exact text", position: "where it is", style: "font style/color", size: "relative size"}
- composition: Detailed layout description
- background: Current background description
- preserveElements: Array of elements that must remain identical
- changeableElements: Array of elements that can be modified`;

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
            return { text: item, position: 'unknown', style: 'unknown' };
          }
          return item;
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
      console.log('[CreativeGenerator] Starting image analysis...');
      let analysis;
      try {
        analysis = await this.analyzeImageForVariations(imageBuffer, userInstructions);
        console.log('[CreativeGenerator] Image analysis completed:', {
          description: analysis.description?.substring(0, 100),
          style: analysis.style,
          aspectRatio: analysis.aspectRatio
        });
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
      
      for (let i = 0; i < count; i++) {
        let prompt = `Create a production-ready, high-quality Facebook ad image. This must be professional marketing material suitable for paid advertising. `;
        
        // Main subject - preserve exactly
        prompt += `\n\nMAIN SUBJECT (MUST BE IDENTICAL):\n${analysis.mainSubject}\nThe person/product must look exactly the same: same pose, expression, clothing, positioning, and visual appearance. `;
        
        // Composition and layout
        if (analysis.composition) {
          prompt += `\nCOMPOSITION: ${analysis.composition}. Maintain this exact layout structure. `;
        }
        
        // Style preservation
        prompt += `\nVISUAL STYLE (MUST MATCH): ${analysis.style}. Maintain the same lighting, color grading, and aesthetic quality. `;
        
        // CRITICAL: Text elements - most important part
        if (textStrings.length > 0) {
          prompt += `\n\n⚠️ CRITICAL TEXT REQUIREMENTS - THESE ARE MANDATORY:\n`;
          prompt += `The following text MUST appear in the image EXACTLY as specified below. This is a Facebook ad, so text accuracy is essential.\n\n`;
          
          textStrings.forEach((text: string, idx: number) => {
            prompt += `Text Element ${idx + 1}: "${text}"\n`;
            prompt += `- Must be spelled EXACTLY as shown above\n`;
            prompt += `- Must be clearly visible and readable\n`;
            prompt += `- Must have high contrast against background\n`;
            prompt += `- Must be in a professional, legible font\n`;
            prompt += `- Must be properly sized for easy reading\n\n`;
          });
          
          prompt += `FAILURE TO INCLUDE TEXT EXACTLY AS SPECIFIED WILL RESULT IN AN UNUSABLE AD. `;
        }
        
        // Colors
        if (analysis.colors && analysis.colors.length > 0) {
          const colorList = analysis.colors.map((c: any) => typeof c === 'string' ? c : c.color || c).join(', ');
          prompt += `\nCOLOR PALETTE: ${colorList}. `;
        }
        
        // User instructions - what to change
        if (userInstructions) {
          prompt += `\n\nVARIATION INSTRUCTIONS:\n${userInstructions}\n\n`;
          prompt += `ONLY modify the elements specified above. Everything else must remain identical to the original. `;
        } else {
          // Default: change background only
          const variations = [
            'Change ONLY the background to a different professional setting (e.g., modern office, outdoor space, studio backdrop). Keep everything else identical.',
            'Change ONLY the background colors and lighting while maintaining the same setting type. Keep all subjects and text identical.',
            'Modify ONLY the background to a complementary professional environment. All subjects, text, and composition must remain identical.',
          ];
          prompt += `\n\nVARIATION INSTRUCTIONS:\n${variations[i % variations.length]}\n\n`;
        }
        
        // Quality requirements
        prompt += `\nPRODUCTION QUALITY REQUIREMENTS:\n`;
        prompt += `- Ultra-high quality, professional photography/design quality\n`;
        prompt += `- Suitable for Facebook/Instagram paid advertising\n`;
        prompt += `- Aspect ratio: ${analysis.aspectRatio} (must match exactly)\n`;
        prompt += `- All text must be crystal clear and readable\n`;
        prompt += `- Professional color grading and lighting\n`;
        prompt += `- No artifacts, distortions, or quality issues\n`;
        prompt += `- Marketing-ready quality suitable for high-budget ad campaigns\n`;
        
        // Final emphasis
        prompt += `\nREMEMBER: This is a paid Facebook ad. Quality and text accuracy are critical. The image must be production-ready.`;
        
        variationPrompts.push(prompt);
      }

      // Step 4: Generate all variations
      const imageUrls: string[] = [];
      const errors: string[] = [];
      
      console.log(`[CreativeGenerator] Generating ${variationPrompts.length} variations with gpt-image-1...`);
      
      for (let i = 0; i < variationPrompts.length; i++) {
        try {
          console.log(`[CreativeGenerator] Generating variation ${i + 1}/${variationPrompts.length}...`);
          
          // Use Responses API with gpt-image-1 model, with fallback to DALL-E 3
          let base64Image: string | null = null;
          let useDalle3Fallback = false;
          
          try {
            // Try using responses API (for gpt-image-1)
            if ((this.getClient() as any).responses?.create) {
              const response = await (this.getClient() as any).responses.create({
                model: 'gpt-image-1',
                input: variationPrompts[i],
                tools: [{ 
                  type: 'image_generation',
                }],
                tool_choice: { type: 'image_generation' },
              });

              // Extract base64 images from the tool outputs
              const imageOutputs = response.output
                .filter((output: any) => output.type === 'image_generation_call')
                .map((output: any) => output.result);

              if (imageOutputs.length > 0 && imageOutputs[0]) {
                base64Image = imageOutputs[0];
              }
            } else {
              // Fallback: Use images.generate API directly (if responses API not available)
              throw new Error('responses.create not available in SDK');
            }
          } catch (apiError: any) {
            // If responses API fails or doesn't exist, try direct HTTP call
            console.log(`[CreativeGenerator] Trying direct API call for gpt-image-1...`);
            try {
              const axios = require('axios');
              const apiKey = process.env.OPENAI_API_KEY;
              const apiResponse = await axios.post(
                'https://api.openai.com/v1/responses',
                {
                  model: 'gpt-image-1',
                  input: variationPrompts[i],
                  tools: [{ type: 'image_generation' }],
                  tool_choice: { type: 'image_generation' },
                },
                {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              const imageOutputs = apiResponse.data.output
                .filter((output: any) => output.type === 'image_generation_call')
                .map((output: any) => output.result);

              if (imageOutputs.length > 0 && imageOutputs[0]) {
                base64Image = imageOutputs[0];
              }
            } catch (httpError: any) {
              const errorDetails = httpError.response?.data || httpError.message;
              const errorStatus = httpError.response?.status;
              
              console.error('[CreativeGenerator] gpt-image-1 API error details:', {
                status: errorStatus,
                statusText: httpError.response?.statusText,
                data: JSON.stringify(httpError.response?.data, null, 2),
                message: httpError.message,
                url: 'https://api.openai.com/v1/responses'
              });
              
              // If 400/404 error or API not available, mark for DALL-E 3 fallback
              if (errorStatus === 400 || errorStatus === 404 || errorStatus === 422) {
                console.log(`[CreativeGenerator] gpt-image-1 API returned ${errorStatus}, falling back to DALL-E 3...`);
                console.log(`[CreativeGenerator] Error details: ${JSON.stringify(httpError.response?.data, null, 2)}`);
                useDalle3Fallback = true;
              } else {
                // For other errors, still try DALL-E 3 as fallback
                console.log(`[CreativeGenerator] gpt-image-1 API error (${errorStatus}), will try DALL-E 3 fallback...`);
                useDalle3Fallback = true;
              }
            }
          }
          
          // Fallback to DALL-E 3 if gpt-image-1 fails or is not available
          if (!base64Image || useDalle3Fallback) {
            try {
              console.log(`[CreativeGenerator] Using DALL-E 3 HD for variation ${i + 1}...`);
              
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
                console.log(`[CreativeGenerator] DALL-E 3 successful for variation ${i + 1}`);
              }
            } catch (dalleError: any) {
              throw new Error(`Both gpt-image-1 and DALL-E 3 failed. DALL-E 3 error: ${dalleError.message}`);
            }
          }

          if (base64Image) {
            // Convert base64 to data URL for consistency with existing download logic
            const dataUrl = `data:image/png;base64,${base64Image}`;
            imageUrls.push(dataUrl);
            console.log(`[CreativeGenerator] Variation ${i + 1} generated successfully`);
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
      
      console.log(`[CreativeGenerator] Successfully generated ${imageUrls.length}/${variationPrompts.length} variations`);

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

