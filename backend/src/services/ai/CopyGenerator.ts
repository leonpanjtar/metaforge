import { OpenAIService } from './OpenAIService';
import { ScrapedContent } from './LandingPageScraper';

export class CopyGenerator {
  private openAIService: OpenAIService;

  constructor() {
    this.openAIService = new OpenAIService();
  }

  async generateFromLandingPage(
    scrapedContent: ScrapedContent,
    context: {
      targetAudience?: string;
      painPoints?: string;
      tone?: string;
    },
    config?: {
      bodies?: { count: number; description?: string };
      ctas?: { count: number; description?: string };
      hooks?: { count: number; description?: string };
      titles?: { count: number; description?: string };
      descriptions?: { count: number; description?: string };
    }
  ): Promise<{
    headlines: string[];
    hooks: string[];
    bodyCopies: string[];
    descriptions: string[];
    ctas: string[];
  }> {
    const landingPageText = [
      scrapedContent.title,
      ...scrapedContent.headlines,
      ...scrapedContent.bodyText,
    ]
      .filter(Boolean)
      .join('\n\n');

    const bodyCount = config?.bodies?.count || 10;
    const bodyTypeDesc = config?.bodies?.description || '';
    
    const bodyCopyPrompt = `Based on this landing page content, generate ${bodyCount} compelling Facebook ad body copy variations 
that highlight the key value propositions and benefits. Use a ${context.tone || 'conversational'} tone.
${bodyTypeDesc ? `\nTypes of bodies to generate: ${bodyTypeDesc}` : ''}

Landing Page Content:
${landingPageText}

${context.targetAudience ? `Target Audience: ${context.targetAudience}\n` : ''}
${context.painPoints ? `Address these pain points: ${context.painPoints}\n` : ''}

Generate direct response copy that drives action.`;

    const bodyCopies = await this.openAIService.generateCopy(bodyCopyPrompt, {
      ...context,
      landingPageContent: landingPageText,
    });

    // Generate headlines/titles
    const titleCount = config?.titles?.count || 10;
    const titleTypeDesc = config?.titles?.description || '';
    const headlines = await this.openAIService.generateHeadlines(
      bodyCopies[0] || '',
      titleCount,
      titleTypeDesc
    );

    // Generate hooks (treated as headlines but with different style)
    const hookCount = config?.hooks?.count || 0;
    let hooks: string[] = [];
    if (hookCount > 0) {
      const hookTypeDesc = config?.hooks?.description || '';
      hooks = await this.openAIService.generateHooks(
        bodyCopies[0] || '',
        hookCount,
        hookTypeDesc
      );
    }

    // Generate descriptions
    const descCount = config?.descriptions?.count || 5;
    const descTypeDesc = config?.descriptions?.description || '';
    const descriptions = await this.openAIService.generateDescriptions(
      headlines[0] || '',
      bodyCopies[0] || '',
      descCount,
      descTypeDesc
    );

    // Generate CTAs
    const ctaCount = config?.ctas?.count || 5;
    const ctaTypeDesc = config?.ctas?.description || '';
    const ctas = await this.openAIService.suggestCTAs('conversion', undefined, ctaCount, ctaTypeDesc);

    return {
      headlines,
      hooks,
      bodyCopies,
      descriptions,
      ctas,
    };
  }

  async generateWithCustomPrompt(
    prompt: string,
    context: {
      targetAudience?: string;
      painPoints?: string;
      tone?: string;
    },
    config?: {
      bodies?: { count: number; description?: string };
      ctas?: { count: number; description?: string };
      hooks?: { count: number; description?: string };
      titles?: { count: number; description?: string };
      descriptions?: { count: number; description?: string };
    }
  ): Promise<{
    headlines: string[];
    hooks: string[];
    bodyCopies: string[];
    descriptions: string[];
    ctas: string[];
  }> {
    const bodyCount = config?.bodies?.count || 10;
    const bodyTypeDesc = config?.bodies?.description || '';
    const bodyPrompt = `${prompt}\n${bodyTypeDesc ? `\nTypes of bodies to generate: ${bodyTypeDesc}` : ''}\n\nGenerate ${bodyCount} variations.`;
    const bodyCopies = await this.openAIService.generateCopy(bodyPrompt, context);

    const titleCount = config?.titles?.count || 10;
    const titleTypeDesc = config?.titles?.description || '';
    const headlines = await this.openAIService.generateHeadlines(
      bodyCopies[0] || '',
      titleCount,
      titleTypeDesc
    );

    const hookCount = config?.hooks?.count || 0;
    let hooks: string[] = [];
    if (hookCount > 0) {
      const hookTypeDesc = config?.hooks?.description || '';
      hooks = await this.openAIService.generateHooks(
        bodyCopies[0] || '',
        hookCount,
        hookTypeDesc
      );
    }

    const descCount = config?.descriptions?.count || 5;
    const descTypeDesc = config?.descriptions?.description || '';
    const descriptions = await this.openAIService.generateDescriptions(
      headlines[0] || '',
      bodyCopies[0] || '',
      descCount,
      descTypeDesc
    );

    const ctaCount = config?.ctas?.count || 5;
    const ctaTypeDesc = config?.ctas?.description || '';
    const ctas = await this.openAIService.suggestCTAs('conversion', undefined, ctaCount, ctaTypeDesc);

    return {
      headlines,
      hooks,
      bodyCopies,
      descriptions,
      ctas,
    };
  }
}

