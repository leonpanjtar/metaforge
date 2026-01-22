import OpenAI from 'openai';

// Alex Hormozi-style base prompt for all text generation
const HORMOZI_BASE_PROMPT = `Act like Alex Hormozi, an insanely experienced and successful direct-response marketing and sales operator, known for blunt clarity, high signal, and "so good it feels dumb to say no" offers; for every answer, write in short, minimal sentences with zero fluff, explain concepts in plain English, lead with the customer's desired outcome, quantify wherever possible, and structure the message using Promise → Proof → Plan (what they get, why it will work, exactly how it works) while increasing perceived value by boosting the dream outcome and likelihood of success and reducing time delay and effort; stack value with 3–7 concrete deliverables, add 1 strong guarantee (risk reversal), include 2–5 proof items (metrics, screenshots, case studies, comparisons), handle the top 3 objections head-on, and end with one clear CTA that tells the reader exactly what to do next.`;

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
    const systemPrompt = HORMOZI_BASE_PROMPT;

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
    bodyCopy: string | string[],
    count: number = 10,
    typeDescription?: string
  ): Promise<string[]> {
    // If bodyCopy is an array, join all body copies for context
    const bodyCopiesText = Array.isArray(bodyCopy) 
      ? bodyCopy.map((copy, idx) => `Body Copy ${idx + 1}:\n${copy}`).join('\n\n')
      : bodyCopy;
    
    const prompt = `First, carefully review ALL the body copies below to understand the full context, key messages, and value propositions.

${Array.isArray(bodyCopy) ? `ALL Body Copies:\n${bodyCopiesText}` : `Body Copy:\n${bodyCopiesText}`}

Now generate ${count} compelling Facebook ad headlines/titles that:
- Are clear, engaging, and simple - anyone can instantly understand them
- Hook the reader immediately
- Complement the body copy(s) above
- SIMPLICITY IS KING - avoid complex language, jargon, or confusing phrases
- Make them attention-grabbing, benefit-focused, and optimized for engagement
${typeDescription ? `\nTypes of headlines to generate: ${typeDescription}` : ''}

Focus on clarity and instant comprehension. The best headlines are simple enough that anyone can understand them in 2 seconds.

Return only the headlines, one per line, without numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: HORMOZI_BASE_PROMPT,
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
            content: HORMOZI_BASE_PROMPT,
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

  /**
   * Generate a single variant of a content element (headline, body, or description)
   * based on the current content and adset context.
   */
  async generateContentVariant(
    currentContent: string,
    contentType: 'headline' | 'body' | 'description',
    context: {
      landingPageUrl?: string;
      angle?: string;
      keywords?: string[];
      importantThings?: string;
    }
  ): Promise<string> {
    let systemPrompt = '';
    let userPrompt = '';

    // Build context string
    let contextString = '';
    if (context.landingPageUrl) {
      contextString += `Landing Page URL: ${context.landingPageUrl}\n`;
    }
    if (context.angle) {
      contextString += `Angle/Positioning: ${context.angle}\n`;
    }
    if (context.keywords && context.keywords.length > 0) {
      contextString += `Keywords: ${context.keywords.join(', ')}\n`;
    }
    if (context.importantThings) {
      contextString += `Important Things/Key Points: ${context.importantThings}\n`;
    }

    // Build prompts based on content type
    switch (contentType) {
      case 'headline':
        systemPrompt = HORMOZI_BASE_PROMPT;
        userPrompt = `Generate ONE new variant of this Facebook ad headline. 

Current Headline:
${currentContent}

${contextString ? `\nContext:\n${contextString}` : ''}

Requirements:
- Clear, engaging, and simple - anyone can instantly understand it
- Hook the reader immediately
- SIMPLICITY IS KING - avoid complex language, jargon, or confusing phrases
- Attention-grabbing, benefit-focused, and optimized for engagement
- Keep it under 60 characters for best results
- Focus on clarity and instant comprehension

Return only the new headline variant, without numbering or labels.`;
        break;

      case 'body':
        systemPrompt = HORMOZI_BASE_PROMPT;
        userPrompt = `Generate ONE new variant of this Facebook ad body copy. Make it compelling, address pain points, highlight benefits, and create urgency. Use a conversational, benefit-focused tone.

Current Body Copy:
${currentContent}

${contextString ? `\nContext:\n${contextString}` : ''}

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

Use this framework to describe the benefits of choosing the product/service and the cost of staying the same.

Return only the new body copy variant, without numbering or labels.`;
        break;

      case 'description':
        systemPrompt = HORMOZI_BASE_PROMPT;
        userPrompt = `Generate ONE new variant of this Facebook ad description. Make it concise (under 125 characters), scannable, and focused on the value proposition. Include key features, social proof, or additional benefits.

Current Description:
${currentContent}

${contextString ? `\nContext:\n${contextString}` : ''}

Return only the new description variant, without numbering or labels.`;
        break;
    }

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      // Clean up the response - remove numbering, labels, quotes, etc.
      return content
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/^\d+[\.\)]\s*/, '') // Remove leading numbers
        .replace(/^(Headline|Body|Description):\s*/i, '') // Remove labels
        .trim();
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Generate Angle/Positioning from scraped landing page content
   */
  async generateAngle(scrapedContent: {
    title?: string;
    headlines: string[];
    bodyText: string[];
    valuePropositions: string[];
  }): Promise<string> {
    const systemPrompt = HORMOZI_BASE_PROMPT;

    const contentSummary = [
      scrapedContent.title ? `Title: ${scrapedContent.title}` : '',
      scrapedContent.headlines.length > 0 ? `Headlines: ${scrapedContent.headlines.slice(0, 5).join('; ')}` : '',
      scrapedContent.bodyText.length > 0 ? `Body Text: ${scrapedContent.bodyText.slice(0, 5).join(' ')}` : '',
      scrapedContent.valuePropositions.length > 0 ? `Value Propositions: ${scrapedContent.valuePropositions.join('; ')}` : '',
    ].filter(Boolean).join('\n\n');

    const userPrompt = `Based on this landing page content, generate ONE simple ad angle for a Facebook ad campaign.

Landing Page Content:
${contentSummary}

Select ONE of these proven ad angles that best fits this product/service, then generate a concise angle using that framework:

1. Value over Price → Make the outcome feel worth far more than the cost.
2. Before vs After → Show the clear transformation from problem to result.
3. Speed & Simplicity → Highlight how fast and easy it becomes.
4. Proof over Claims → Use numbers and real results instead of promises.
5. Anti-Status Quo → Call out the old way as broken or outdated.
6. Authority / Scarcity → Position it as expert-led or limited access.
7. Guarantee / Risk Removal → Remove fear by lowering or reversing risk.
8. Future Pacing → Help them imagine life after the result.
9. Niche Call-Out → Speak directly to a specific audience.
10. Contrast Flow → Walk them from pain to solution to outcome.

IMPORTANT: Generate ONLY ONE angle. Select the single best framework and create one clear, compelling angle (2-4 sentences) using that framework.

Return only the angle/positioning text, without labels or numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        n: 1, // Generate only 1 response
        max_tokens: 200, // Limit to ensure single angle (2-4 sentences)
      });

      const content = response.choices[0]?.message.content || '';
      // Extract only the first angle if multiple are returned
      // Take first paragraph, remove numbered items, limit to ~4 sentences
      let firstAngle = content.split('\n\n')[0]; // Take first paragraph
      firstAngle = firstAngle.split('\n').find((line: string) => !line.match(/^\d+[\.\)]/)) || firstAngle; // Remove numbered items
      firstAngle = firstAngle.split('. ').slice(0, 4).join('. '); // Limit to ~4 sentences max
      
      return firstAngle
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^(Angle|Positioning|USP):\s*/i, '')
        .replace(/^\d+[\.\)]\s*/, '') // Remove leading numbers
        .trim();
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Generate Keywords from scraped landing page content
   */
  async generateKeywords(scrapedContent: {
    title?: string;
    headlines: string[];
    bodyText: string[];
    valuePropositions: string[];
  }): Promise<string[]> {
    const systemPrompt = 'You are an expert at extracting relevant marketing keywords from content.';

    const contentSummary = [
      scrapedContent.title ? `Title: ${scrapedContent.title}` : '',
      scrapedContent.headlines.length > 0 ? `Headlines: ${scrapedContent.headlines.slice(0, 5).join('; ')}` : '',
      scrapedContent.bodyText.length > 0 ? `Body Text: ${scrapedContent.bodyText.slice(0, 5).join(' ')}` : '',
      scrapedContent.valuePropositions.length > 0 ? `Value Propositions: ${scrapedContent.valuePropositions.join('; ')}` : '',
    ].filter(Boolean).join('\n\n');

    const userPrompt = `Based on this landing page content, extract 10-15 relevant keywords that would be useful for Facebook ad targeting and ad copy generation.

Landing Page Content:
${contentSummary}

Extract keywords that are:
- Relevant to the product/service
- Useful for ad targeting
- Important for understanding the value proposition
- Can be used in ad copy

Return only the keywords, one per line, without numbering or labels.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Remove numbering, labels, and empty lines
          return line.length > 0 
            && !line.match(/^\d+[\.\)]/)
            && !line.match(/^(Keywords?|Key Words?):\s*/i);
        })
        .slice(0, 15);
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Generate Important Things/Key Points from scraped landing page content
   */
  async generateImportantThings(scrapedContent: {
    title?: string;
    headlines: string[];
    bodyText: string[];
    valuePropositions: string[];
  }): Promise<string> {
    const systemPrompt = HORMOZI_BASE_PROMPT;

    const contentSummary = [
      scrapedContent.title ? `Title: ${scrapedContent.title}` : '',
      scrapedContent.headlines.length > 0 ? `Headlines: ${scrapedContent.headlines.slice(0, 5).join('; ')}` : '',
      scrapedContent.bodyText.length > 0 ? `Body Text: ${scrapedContent.bodyText.slice(0, 10).join(' ')}` : '',
      scrapedContent.valuePropositions.length > 0 ? `Value Propositions: ${scrapedContent.valuePropositions.join('; ')}` : '',
    ].filter(Boolean).join('\n\n');

    const userPrompt = `Based on this landing page content, identify the most important features, benefits, and key points that should be emphasized in Facebook ads.

Landing Page Content:
${contentSummary}

Generate a comprehensive list of:
- Key features
- Main benefits
- Important selling points
- Value propositions
- Anything that would be important for ad copy

Format as a bulleted list or paragraph. Keep it focused and actionable.

Return only the important things/key points, without labels or numbering.`;

    try {
      const response = await this.getClient().chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        n: 1,
      });

      const content = response.choices[0]?.message.content || '';
      return content
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^(Important Things|Key Points|Features|Benefits):\s*/i, '')
        .trim();
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

