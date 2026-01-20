import OpenAI from 'openai';

export class OpenAIService {
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

  async generateCopy(prompt: string, context?: {
    targetAudience?: string;
    painPoints?: string;
    tone?: string;
    landingPageContent?: string;
  }): Promise<string[]> {
    const systemPrompt = `You are an expert copywriter specializing in Facebook ad copy that converts. 
Generate multiple variations of compelling ad copy based on the user's requirements.`;

    let userPrompt = prompt;

    if (context) {
      let contextString = '';
      if (context.targetAudience) {
        contextString += `Target Audience: ${context.targetAudience}\n`;
      }
      if (context.painPoints) {
        contextString += `Pain Points: ${context.painPoints}\n`;
      }
      if (context.tone) {
        contextString += `Tone: ${context.tone}\n`;
      }
      if (context.landingPageContent) {
        contextString += `Landing Page Content:\n${context.landingPageContent}\n`;
      }
      if (contextString) {
        userPrompt = `${contextString}\n\n${prompt}`;
      }
    }

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        n: 5, // Generate 5 variations
      });

      return response.choices
        .map((choice) => choice.message.content)
        .filter((content): content is string => content !== null);
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateHeadlines(
    bodyCopy: string,
    count: number = 10,
    typeDescription?: string
  ): Promise<string[]> {
    const prompt = `Generate ${count} compelling Facebook ad headlines that complement this body copy. 
Make them attention-grabbing, benefit-focused, and optimized for engagement.
${typeDescription ? `\nTypes of headlines to generate: ${typeDescription}` : ''}

Body Copy:
${bodyCopy}

Return only the headlines, one per line, without numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing Facebook ad headlines that drive clicks.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.match(/^\d+[\.\)]/))
        .slice(0, count);
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateDescriptions(
    headline: string,
    bodyCopy: string,
    count: number = 5,
    typeDescription?: string
  ): Promise<string[]> {
    const prompt = `Generate ${count} short, compelling Facebook ad descriptions (under 125 characters) 
that complement this headline and body copy.
${typeDescription ? `\nTypes of descriptions to generate: ${typeDescription}` : ''}

Headline: ${headline}
Body Copy: ${bodyCopy}

Return only the descriptions, one per line, without numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing concise Facebook ad descriptions.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= 125 && !line.match(/^\d+[\.\)]/))
        .slice(0, count);
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async suggestCTAs(
    funnelStage: string,
    productType?: string,
    count: number = 5,
    typeDescription?: string
  ): Promise<string[]> {
    const prompt = `Suggest ${count} Facebook ad CTA (Call-to-Action) buttons 
for ${funnelStage} stage${productType ? ` promoting ${productType}` : ''}.
${typeDescription ? `\nTypes of CTAs to generate: ${typeDescription}` : ''}

Return only the CTA text, one per line, without numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing effective call-to-action buttons for Facebook ads.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.match(/^\d+[\.\)]/));
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateHooks(bodyCopy: string, count: number = 5, typeDescription?: string): Promise<string[]> {
    const prompt = `Generate ${count} compelling Facebook ad hooks (opening lines/headlines) that grab attention immediately.
${typeDescription ? `\nTypes of hooks to generate: ${typeDescription}` : ''}
Hooks should be bold, curiosity-driven, or problem-focused to stop the scroll.

Body Copy Context:
${bodyCopy}

Return only the hooks, one per line, without numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing scroll-stopping hooks for Facebook ads.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.match(/^\d+[\.\)]/))
        .slice(0, count);
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

