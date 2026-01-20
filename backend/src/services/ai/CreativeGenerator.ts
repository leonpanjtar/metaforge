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
}

