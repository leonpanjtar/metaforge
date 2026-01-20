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

      const analysisPrompt = `Analyze this Facebook ad image in detail and provide a comprehensive description. Focus on:

1. Main subject and key elements
2. Visual style (photography, illustration, graphic design, etc.)
3. Color palette and dominant colors
4. Composition and layout
5. Any text elements and what they say (be precise with spelling)
6. Mood and tone
7. Background and setting

${userInstructions ? `\nUser wants variations with these instructions: ${userInstructions}` : ''}

Return your analysis as JSON with these fields:
- description: Detailed description of the image
- style: Visual style (e.g., "modern photography", "minimalist design", "vibrant illustration")
- mainSubject: Main subject or focus of the image
- colors: Array of dominant colors
- textElements: Array of any text found in the image with exact spelling
- composition: Description of layout and composition`;

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
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message.content || '{}';
      const analysis = JSON.parse(content);

      return {
        description: analysis.description || 'A Facebook ad image',
        aspectRatio,
        dimensions: { width: dimensions.width, height: dimensions.height },
        style: analysis.style || 'modern',
        mainSubject: analysis.mainSubject || 'product',
        colors: analysis.colors || [],
        textElements: analysis.textElements || [],
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

      // Step 3: Create variation prompts based on analysis and user instructions
      const variationPrompts: string[] = [];
      
      for (let i = 0; i < count; i++) {
        let prompt = `Create a high-quality Facebook ad image variation. `;
        
        // Include original description
        prompt += `${analysis.description}. `;
        
        // Include style
        prompt += `Style: ${analysis.style}. `;
        
        // Include main subject
        prompt += `Main subject: ${analysis.mainSubject}. `;
        
        // Include colors if available
        if (analysis.colors.length > 0) {
          prompt += `Color palette: ${analysis.colors.join(', ')}. `;
        }
        
        // Include text elements with explicit instructions for clarity and readability
        if (analysis.textElements.length > 0) {
          prompt += `CRITICAL: Include the following text elements exactly as specified. Each text must be:
- Clearly visible and prominently displayed
- Correctly spelled (exact spelling: ${analysis.textElements.map((text: string) => `"${text}"`).join(', ')})
- Normally readable with high contrast against background
- In a professional, legible font
- Properly sized for easy reading

Text elements to include: ${analysis.textElements.map((text: string) => `"${text}"`).join(', ')}. `;
        }
        
        // Add user instructions
        if (userInstructions) {
          prompt += `Variation requirements: ${userInstructions}. `;
        } else {
          // Default variation instructions
          const variations = [
            'Change the background while keeping the main subject',
            'Modify the color scheme while maintaining brand consistency',
            'Adjust the composition and layout',
          ];
          prompt += `Variation ${i + 1}: ${variations[i % variations.length]}. `;
        }
        
        // Quality and text requirements - emphasize text clarity
        prompt += `IMPORTANT REQUIREMENTS:
- High quality, professional image
- Preserve the original aspect ratio (${analysis.aspectRatio})
- Any text must be clear, correctly spelled, and normally readable
- Use high contrast for text to ensure readability
- Maintain the visual style: ${analysis.style}
- Keep the main subject: ${analysis.mainSubject}`;
        
        variationPrompts.push(prompt);
      }

      // Step 4: Generate all variations
      const imageUrls: string[] = [];
      const errors: string[] = [];
      
      console.log(`[CreativeGenerator] Generating ${variationPrompts.length} variations with DALL-E 3...`);
      
      for (let i = 0; i < variationPrompts.length; i++) {
        try {
          console.log(`[CreativeGenerator] Generating variation ${i + 1}/${variationPrompts.length}...`);
          const response = await this.getClient().images.generate({
            model: 'dall-e-3',
            prompt: variationPrompts[i],
            n: 1,
            size: size,
            quality: 'hd', // High quality
            response_format: 'url',
          });

          if (response.data?.[0]?.url) {
            imageUrls.push(response.data[0].url);
            console.log(`[CreativeGenerator] Variation ${i + 1} generated successfully`);
          } else {
            const errorMsg = `Variation ${i + 1}: No URL in response`;
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

