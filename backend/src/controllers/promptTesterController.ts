import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OpenAIService } from '../services/ai/OpenAIService';
import { CreativeGenerator } from '../services/ai/CreativeGenerator';
import OpenAI from 'openai';

// Import current prompts (these are constants in the service files)
const HORMOZI_BASE_PROMPT = `Act like Alex Hormozi, an insanely experienced and successful direct-response marketing and sales operator, known for blunt clarity, high signal, and "so good it feels dumb to say no" offers; for every answer, write in short, minimal sentences with zero fluff, explain concepts in plain English, lead with the customer's desired outcome, quantify wherever possible, and structure the message using Promise → Proof → Plan (what they get, why it will work, exactly how it works) while increasing perceived value by boosting the dream outcome and likelihood of success and reducing time delay and effort; stack value with 3–7 concrete deliverables, add 1 strong guarantee (risk reversal), include 2–5 proof items (metrics, screenshots, case studies, comparisons), handle the top 3 objections head-on, and end with one clear CTA that tells the reader exactly what to do next.`;

const HORMOZI_CREATIVE_BASE_PROMPT = `Act in the style of Alex Hormozi's direct-response principles. Create high-volume ad creatives built for aggressive testing. Every output must be simple, blunt, and impossible to misunderstand. One idea. One pain. One bold promise. One next step. Visuals should feel native and imperfect (phone-shot, raw framing, fast cuts, no polish). Hooks must hit in the first 1–2 seconds with outcome-first or problem-interrupt statements. Copy must be short and readable on mute. Lead with numbers and proof (specific results, timelines, comparisons). Generate multiple variations per concept (hooks, angles, formats, lengths) to maximize learning speed. Optimize for clarity over cleverness, volume over perfection, and learning over opinions—only goal: find what converts fastest at scale.`;

/**
 * Get current prompts for all content types
 */
export const getPrompts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if user is admin or owner
    const { getAccountFilter } = await import('../utils/accountFilter');
    const accountFilter = await getAccountFilter(req);
    
    // Check if user has admin or owner role
    const { UserAccount } = await import('../models/UserAccount');
    const { Account } = await import('../models/Account');
    
    let hasAccess = false;
    
    if (accountFilter.accountId) {
      // Check role in current account
      const membership = await UserAccount.findOne({
        userId: req.userId,
        accountId: accountFilter.accountId,
      });
      
      if (membership && (membership.role === 'owner' || membership.role === 'admin')) {
        hasAccess = true;
      } else {
        // Check if user is owner of the account
        const account = await Account.findById(accountFilter.accountId);
        if (account && account.ownerId.toString() === req.userId) {
          hasAccess = true;
        }
      }
    } else {
      // Check if user is owner or admin of any account
      const ownedAccounts = await Account.find({ ownerId: req.userId });
      if (ownedAccounts.length > 0) {
        hasAccess = true;
      } else {
        const adminMemberships = await UserAccount.find({
          userId: req.userId,
          role: 'admin',
        });
        if (adminMemberships.length > 0) {
          hasAccess = true;
        }
      }
    }
    
    if (!hasAccess) {
      res.status(403).json({ error: 'Only admins and owners can access prompt testing' });
      return;
    }

    const prompts = {
      base: {
        system: HORMOZI_BASE_PROMPT,
        description: 'Base prompt for all text generation (body copy, headlines, descriptions, angle, important things)',
      },
      creative: {
        system: HORMOZI_CREATIVE_BASE_PROMPT,
        description: 'Base prompt for image and video generation',
      },
      bodyCopy: {
        system: HORMOZI_BASE_PROMPT,
        user: `Generate compelling body copy that addresses pain points, highlights benefits, and creates urgency. Use problem-agitate-solve framework. Keep it conversational and benefit-focused.`,
        description: 'Body copy generation prompt',
      },
      headlines: {
        system: HORMOZI_BASE_PROMPT,
        user: `First, carefully review ALL the body copies below to understand the full context, key messages, and value propositions.

ALL Body Copies:
{bodyCopies}

Now generate {count} compelling Facebook ad headlines/titles that:
- Are clear, engaging, and simple - anyone can instantly understand them
- Hook the reader immediately
- Complement the body copy(s) above
- SIMPLICITY IS KING - avoid complex language, jargon, or confusing phrases
- Make them attention-grabbing, benefit-focused, and optimized for engagement

Focus on clarity and instant comprehension. The best headlines are simple enough that anyone can understand them in 2 seconds.

Return only the headlines, one per line, without numbering.`,
        description: 'Headline generation prompt',
      },
      descriptions: {
        system: HORMOZI_BASE_PROMPT,
        user: `Generate {count} short, compelling Facebook ad descriptions (under 125 characters) 
that complement this headline and body copy.

Headline: {headline}
Body Copy: {bodyCopy}

Return only the descriptions, one per line, without numbering.`,
        description: 'Description generation prompt',
      },
      angle: {
        system: HORMOZI_BASE_PROMPT,
        user: `Based on this landing page content, generate ONE simple ad angle for a Facebook ad campaign.

Landing Page Content:
{contentSummary}

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

Return only the angle/positioning text, without labels or numbering.`,
        description: 'Angle generation prompt',
      },
      keywords: {
        system: 'You are an expert at extracting relevant marketing keywords from content.',
        user: `Based on this landing page content, extract 10-15 relevant keywords that would be useful for Facebook ad targeting and ad copy generation.

Landing Page Content:
{contentSummary}

Extract keywords that are:
- Relevant to the product/service
- Useful for ad targeting
- Important for understanding the value proposition
- Can be used in ad copy

Return only the keywords, one per line, without numbering or labels.`,
        description: 'Keywords extraction prompt',
      },
      importantThings: {
        system: HORMOZI_BASE_PROMPT,
        user: `Based on this landing page content, identify the most important features, benefits, and key points that should be emphasized in Facebook ads.

Landing Page Content:
{contentSummary}

Generate a comprehensive list of:
- Key features
- Main benefits
- Important selling points
- Value propositions
- Anything that would be important for ad copy

Format as a bulleted list or paragraph. Keep it focused and actionable.

Return only the important things/key points, without labels or numbering.`,
        description: 'Important things/key points generation prompt',
      },
      imageAnalysis: {
        system: HORMOZI_CREATIVE_BASE_PROMPT,
        user: `You are analyzing a Facebook ad image/video to generate variants where the CORE CONCEPT stays identical, but visual elements can vary.

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

!!IMPORTANT!!: Most important point of prompt (user instructions): {userInstructions}

Return your analysis as JSON with these fields:
- coreConcept: The main message/idea that must stay identical
- mainSubject: Detailed description of main subject (core identity that stays, details that can vary)
- textElements: Array of objects with {text: "exact text (MUST STAY)", position: "where it is", currentStyle: "current font style/color (CAN VARY)", size: "relative size"}
- currentStyle: Current visual style description (CAN VARY)
- currentColors: Array of current dominant colors (CAN VARY)
- currentBackground: Current background description (CAN VARY)
- composition: Current layout structure (core structure stays, details can vary)
- preserveElements: Array of core elements that must remain identical (concept, text, main subject identity)
- changeableElements: Array of elements that can be modified (style, colors, background, clothing, effects, additional elements)`,
        description: 'Image analysis prompt for generating variants',
      },
      imageGeneration: {
        system: HORMOZI_CREATIVE_BASE_PROMPT,
        user: `Generate a Facebook ad image variation based on this analysis.

CORE CONCEPT (MUST STAY IDENTICAL):
{coreConcept}

MAIN SUBJECT (CORE STAYS, DETAILS CAN VARY):
{mainSubject}

TEXT ELEMENTS (MUST STAY IDENTICAL - exact words, numbers, symbols):
{textElements}

CURRENT VISUAL STYLE (CAN VARY):
- Style: {currentStyle}
- Colors: {currentColors}
- Background: {currentBackground}

!!IMPORTANT!!: Most important point of prompt (user instructions): {userInstructions}

CRITICAL REQUIREMENTS:
1. Keep the core concept, main subject identity, and ALL text EXACTLY the same
2. If humans are present, their faces and bodies must remain EXACTLY as they are - preserve facial features, body shape, proportions, and poses
3. Only visual styling elements can change: style, colors, background, lighting, effects, clothing, accessories
4. Generate a variation that maintains the core but changes visual elements for A/B testing

Create a detailed image generation prompt that will produce this variation.`,
        description: 'Image generation prompt for creating variants',
      },
    };

    res.json({ prompts });
  } catch (error: any) {
    console.error('Get prompts error:', error);
    res.status(500).json({ error: 'Failed to get prompts' });
  }
};

/**
 * Test a prompt with custom system/user prompts
 */
export const testPrompt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if user is admin or owner
    const { getAccountFilter } = await import('../utils/accountFilter');
    const accountFilter = await getAccountFilter(req);
    
    const { UserAccount } = await import('../models/UserAccount');
    const { Account } = await import('../models/Account');
    
    let hasAccess = false;
    
    if (accountFilter.accountId) {
      const membership = await UserAccount.findOne({
        userId: req.userId,
        accountId: accountFilter.accountId,
      });
      
      if (membership && (membership.role === 'owner' || membership.role === 'admin')) {
        hasAccess = true;
      } else {
        const account = await Account.findById(accountFilter.accountId);
        if (account && account.ownerId.toString() === req.userId) {
          hasAccess = true;
        }
      }
    } else {
      const ownedAccounts = await Account.find({ ownerId: req.userId });
      if (ownedAccounts.length > 0) {
        hasAccess = true;
      } else {
        const adminMemberships = await UserAccount.find({
          userId: req.userId,
          role: 'admin',
        });
        if (adminMemberships.length > 0) {
          hasAccess = true;
        }
      }
    }
    
    if (!hasAccess) {
      res.status(403).json({ error: 'Only admins and owners can test prompts' });
      return;
    }

    const { contentType, systemPrompt, userPrompt, testInput } = req.body;

    if (!contentType || !systemPrompt || !userPrompt) {
      res.status(400).json({ error: 'contentType, systemPrompt, and userPrompt are required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    const client = new OpenAI({ apiKey });

    // Replace placeholders in user prompt with test input
    let finalUserPrompt = userPrompt;
    if (testInput) {
      Object.keys(testInput).forEach((key) => {
        finalUserPrompt = finalUserPrompt.replace(new RegExp(`{${key}}`, 'g'), testInput[key]);
      });
    }

    // For image-related content types, we need special handling
    if (contentType === 'imageAnalysis' || contentType === 'imageGeneration') {
      res.status(400).json({ 
        error: 'Image analysis and generation require image upload. Use the Assets tab to test these prompts.' 
      });
      return;
    }

    // Make API call
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalUserPrompt },
      ],
      temperature: 0.8,
      n: 1,
    });

    const result = response.choices[0]?.message.content || '';

    res.json({
      success: true,
      result,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('Test prompt error:', error);
    res.status(500).json({ 
      error: 'Failed to test prompt',
      details: error.message 
    });
  }
};

/**
 * Test image analysis or generation with an uploaded image
 */
export const testImagePrompt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if user is admin or owner
    const { getAccountFilter } = await import('../utils/accountFilter');
    const accountFilter = await getAccountFilter(req);
    
    const { UserAccount } = await import('../models/UserAccount');
    const { Account } = await import('../models/Account');
    
    let hasAccess = false;
    
    if (accountFilter.accountId) {
      const membership = await UserAccount.findOne({
        userId: req.userId,
        accountId: accountFilter.accountId,
      });
      
      if (membership && (membership.role === 'owner' || membership.role === 'admin')) {
        hasAccess = true;
      } else {
        const account = await Account.findById(accountFilter.accountId);
        if (account && account.ownerId.toString() === req.userId) {
          hasAccess = true;
        }
      }
    } else {
      const ownedAccounts = await Account.find({ ownerId: req.userId });
      if (ownedAccounts.length > 0) {
        hasAccess = true;
      } else {
        const adminMemberships = await UserAccount.find({
          userId: req.userId,
          role: 'admin',
        });
        if (adminMemberships.length > 0) {
          hasAccess = true;
        }
      }
    }
    
    if (!hasAccess) {
      res.status(403).json({ error: 'Only admins and owners can test prompts' });
      return;
    }

    const { contentType, systemPrompt, userPrompt, userInstructions } = req.body;
    const file = (req as any).file;

    if (!contentType || !systemPrompt || !userPrompt) {
      res.status(400).json({ error: 'contentType, systemPrompt, and userPrompt are required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    const client = new OpenAI({ apiKey });
    const imageBuffer = Buffer.from(file.buffer);
    const base64Image = imageBuffer.toString('base64');
    const imageDataUrl = `data:image/png;base64,${base64Image}`;

    // Replace placeholders in user prompt
    let finalUserPrompt = userPrompt;
    if (userInstructions) {
      finalUserPrompt = finalUserPrompt.replace('{userInstructions}', `\nUSER VARIATION INSTRUCTIONS: ${userInstructions}\nIdentify what should change while keeping the core concept identical.`);
    } else {
      finalUserPrompt = finalUserPrompt.replace('{userInstructions}', '');
    }

    if (contentType === 'imageAnalysis') {
      // Image analysis
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${systemPrompt}\n\n${finalUserPrompt}` },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      });

      const result = JSON.parse(response.choices[0]?.message.content || '{}');

      res.json({
        success: true,
        result,
        usage: response.usage,
      });
    } else if (contentType === 'imageGeneration') {
      // For image generation, we'd need to use images.edit() or similar
      // For now, return the analysis result that would be used for generation
      res.status(400).json({ 
        error: 'Image generation testing requires the full analysis pipeline. Use the Assets tab magic button to test image generation.' 
      });
    } else {
      res.status(400).json({ error: 'Invalid contentType for image testing' });
    }
  } catch (error: any) {
    console.error('Test image prompt error:', error);
    res.status(500).json({ 
      error: 'Failed to test image prompt',
      details: error.message 
    });
  }
};

