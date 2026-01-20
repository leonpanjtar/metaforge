import { OpenAIService } from './OpenAIService';
import { Adset } from '../../models/Adset';
import { Asset } from '../../models/Asset';
import { AdCopy } from '../../models/AdCopy';

export interface ScoreBreakdown {
  hook: number;
  alignment: number;
  fit: number;
  clarity: number;
  match: number;
}

export class ScoringService {
  private openAIService: OpenAIService | null = null;

  private getOpenAIService(): OpenAIService {
    if (!this.openAIService) {
      this.openAIService = new OpenAIService();
    }
    return this.openAIService;
  }

  async scoreCombination(
    asset: Asset,
    headline: AdCopy,
    body: AdCopy,
    description: AdCopy,
    cta: AdCopy,
    adset: Adset
  ): Promise<{
    scores: ScoreBreakdown;
    overallScore: number;
    predictedCTR: number;
  }> {
    // Hook strength (image/video analysis)
    const hookScore = await this.scoreHookStrength(asset);

    // Copy-visual alignment
    const alignmentScore = await this.scoreCopyVisualAlignment(
      asset,
      headline,
      body
    );

    // Target market fit
    const fitScore = this.scoreTargetMarketFit(adset, headline, body);

    // CTA clarity
    const clarityScore = await this.scoreCTAClarity(cta);

    // Message-market match
    const matchScore = await this.scoreMessageMarketMatch(adset, headline, body);

    const scores: ScoreBreakdown = {
      hook: hookScore,
      alignment: alignmentScore,
      fit: fitScore,
      clarity: clarityScore,
      match: matchScore,
    };

    // Weighted average
    const overallScore =
      hookScore * 0.25 +
      alignmentScore * 0.2 +
      fitScore * 0.2 +
      clarityScore * 0.15 +
      matchScore * 0.2;

    // Predict CTR based on scores (simplified model)
    const predictedCTR = Math.max(0, Math.min(10, overallScore / 10));

    return {
      scores,
      overallScore: Math.round(overallScore),
      predictedCTR: parseFloat(predictedCTR.toFixed(2)),
    };
  }

  private async scoreHookStrength(asset: Asset): Promise<number> {
    // Simplified scoring - in production, use image analysis
    if (asset.type === 'image') {
      return 60 + Math.random() * 30; // 60-90
    }
    return 50 + Math.random() * 40; // 50-90
  }

  private async scoreCopyVisualAlignment(
    asset: Asset,
    headline: AdCopy,
    body: AdCopy
  ): Promise<number> {
    const prompt = `Rate how well this ad copy aligns with the visual creative (0-100):
    
Headline: ${headline.content}
Body: ${body.content}
Asset Type: ${asset.type}

Consider sentiment, theme, and message consistency. Return only a number.`;

    try {
      const response = await this.getOpenAIService().generateCopy(prompt);
      const score = parseInt(response[0] || '50');
      return Math.max(0, Math.min(100, score));
    } catch {
      return 50 + Math.random() * 30; // Fallback
    }
  }

  private scoreTargetMarketFit(adset: Adset, headline: AdCopy, body: AdCopy): number {
    // Analyze targeting parameters against copy
    let score = 50;

    if (adset.targeting.ageMin && adset.targeting.ageMax) {
      const ageRange = adset.targeting.ageMax - adset.targeting.ageMin;
      if (ageRange < 20) {
        score += 10; // Narrow targeting is better
      }
    }

    if (adset.targeting.interests && adset.targeting.interests.length > 0) {
      score += 10;
    }

    if (adset.targeting.locations && adset.targeting.locations.length > 0) {
      score += 10;
    }

    return Math.min(100, score + Math.random() * 20);
  }

  private async scoreCTAClarity(cta: AdCopy): Promise<number> {
    const actionWords = ['get', 'buy', 'start', 'try', 'learn', 'sign', 'order', 'shop'];
    const ctaLower = cta.content.toLowerCase();
    const hasActionWord = actionWords.some((word) => ctaLower.includes(word));

    if (hasActionWord) {
      return 70 + Math.random() * 25; // 70-95
    }
    return 40 + Math.random() * 30; // 40-70
  }

  private async scoreMessageMarketMatch(
    adset: Adset,
    headline: AdCopy,
    body: AdCopy
  ): Promise<number> {
    const prompt = `Rate how well this ad message matches the target market's problem awareness level (0-100):

Headline: ${headline.content}
Body: ${body.content}
Targeting: ${JSON.stringify(adset.targeting)}

Consider if the message matches the audience's awareness stage. Return only a number.`;

    try {
      const response = await this.getOpenAIService().generateCopy(prompt);
      const score = parseInt(response[0] || '50');
      return Math.max(0, Math.min(100, score));
    } catch {
      return 50 + Math.random() * 30; // Fallback
    }
  }
}

