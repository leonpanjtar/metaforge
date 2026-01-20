import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedContent {
  title?: string;
  headlines: string[];
  bodyText: string[];
  valuePropositions: string[];
  ctaTexts: string[];
}

export class LandingPageScraper {
  async scrape(url: string): Promise<ScrapedContent> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);

      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim();

      // Extract headlines (h1, h2, h3)
      const headlines: string[] = [];
      $('h1, h2, h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          headlines.push(text);
        }
      });

      // Extract body text (paragraphs)
      const bodyText: string[] = [];
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 20) {
          bodyText.push(text);
        }
      });

      // Extract value propositions (common patterns)
      const valuePropositions: string[] = [];
      $('[class*="benefit"], [class*="value"], [class*="feature"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10 && text.length < 200) {
          valuePropositions.push(text);
        }
      });

      // Extract CTA texts (buttons, links with action words)
      const ctaTexts: string[] = [];
      $('button, a[class*="cta"], a[class*="button"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 0 && text.length < 50) {
          ctaTexts.push(text);
        }
      });

      // Also look for common CTA patterns
      $('a, button').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        const ctaKeywords = ['get', 'start', 'buy', 'order', 'sign up', 'learn more', 'try'];
        if (ctaKeywords.some((keyword) => text.includes(keyword)) && text.length < 50) {
          const originalText = $(el).text().trim();
          if (!ctaTexts.includes(originalText)) {
            ctaTexts.push(originalText);
          }
        }
      });

      return {
        title,
        headlines: headlines.slice(0, 10),
        bodyText: bodyText.slice(0, 20),
        valuePropositions: valuePropositions.slice(0, 10),
        ctaTexts: ctaTexts.slice(0, 10),
      };
    } catch (error: any) {
      throw new Error(`Failed to scrape landing page: ${error.message}`);
    }
  }
}

