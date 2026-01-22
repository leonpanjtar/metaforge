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
      titles?: { count: number; description?: string };
      descriptions?: { count: number; description?: string };
    }
  ): Promise<{
    headlines: string[];
    bodyCopies: string[];
    descriptions: string[];
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

Use Hormozi's What? Who? When? framework to structure the copy:

WHAT? - Use the 8 variables of the value equation:
- Dream outcome (what they want) → Nightmare (what they're avoiding)
- Time delay (how long it takes) → Speed (how fast it happens)
- Perceived likelihood of achievement → Risk (what could go wrong)
- Effort & Sacrifice → Ease (how simple it is)

WHO? - Choose a perspective to communicate through:
- The prospect themselves
- Their spouse/partner
- Their kids
- Their boss
- Colleagues
- Friends

WHEN? - Select a time period to frame the message:
- Future phase (pain or pleasure they'll experience)
- Past phase (pain or pleasure they've experienced)
- Present phase (pain or pleasure they're experiencing now)

Use this framework to describe the benefits of choosing the product/service and the cost of staying the same. Generate direct response copy that drives action.`;

    const bodyCopies = await this.openAIService.generateCopy(bodyCopyPrompt, {
      ...context,
      landingPageContent: landingPageText,
    });

    // Generate headlines/titles - pass ALL body copies for context
    const titleCount = config?.titles?.count || 10;
    const titleTypeDesc = config?.titles?.description || '';
    const headlines = await this.openAIService.generateHeadlines(
      bodyCopies, // Pass all body copies, not just the first one
      titleCount,
      titleTypeDesc
    );

    // Generate descriptions
    const descCount = config?.descriptions?.count || 5;
    const descTypeDesc = config?.descriptions?.description || '';
    const descriptions = await this.openAIService.generateDescriptions(
      headlines[0] || '',
      bodyCopies[0] || '',
      descCount,
      descTypeDesc
    );

    return {
      headlines,
      bodyCopies,
      descriptions,
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
      titles?: { count: number; description?: string };
      descriptions?: { count: number; description?: string };
    }
  ): Promise<{
    headlines: string[];
    bodyCopies: string[];
    descriptions: string[];
  }> {
    const bodyCount = config?.bodies?.count || 10;
    const bodyTypeDesc = config?.bodies?.description || '';
    const bodyPrompt = `${prompt}\n${bodyTypeDesc ? `\nTypes of bodies to generate: ${bodyTypeDesc}` : ''}\n\nGenerate ${bodyCount} variations.`;
    const bodyCopies = await this.openAIService.generateCopy(bodyPrompt, context);

    const titleCount = config?.titles?.count || 10;
    const titleTypeDesc = config?.titles?.description || '';
    const headlines = await this.openAIService.generateHeadlines(
      bodyCopies, // Pass all body copies, not just the first one
      titleCount,
      titleTypeDesc
    );

    const descCount = config?.descriptions?.count || 5;
    const descTypeDesc = config?.descriptions?.description || '';
    const descriptions = await this.openAIService.generateDescriptions(
      headlines[0] || '',
      bodyCopies[0] || '',
      descCount,
      descTypeDesc
    );

    return {
      headlines,
      bodyCopies,
      descriptions,
    };
  }
}

