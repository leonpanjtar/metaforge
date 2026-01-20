import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { LandingPageScraper } from '../services/ai/LandingPageScraper';
import { CopyGenerator } from '../services/ai/CopyGenerator';
import { AdCopy } from '../models/AdCopy';

// Lazy initialization - only create when needed
const getLandingPageScraper = () => new LandingPageScraper();
const getCopyGenerator = () => new CopyGenerator();

export const scrapeLandingPage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const scrapedContent = await getLandingPageScraper().scrape(url);

    res.json(scrapedContent);
  } catch (error: any) {
    console.error('Scrape landing page error:', error);
    res.status(500).json({ error: error.message || 'Failed to scrape landing page' });
  }
};

export const generateImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { prompt, size } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const { CreativeGenerator } = await import('../services/ai/CreativeGenerator');
    const creativeGenerator = new CreativeGenerator();
    const imageUrl = await creativeGenerator.generateImage(prompt, size);

    res.json({ imageUrl });
  } catch (error: any) {
    console.error('Generate image error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
};

export const generateSingleImageVariation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, prompt, variationIndex, isFirstUpload } = req.body;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    if (!adsetId) {
      res.status(400).json({ error: 'Adset ID is required' });
      return;
    }

    // For Meta AI: Only save the image once (on first upload)
    // Meta AI generates variations automatically when creating ads, not during upload
    // If this is not the first upload, skip saving (to avoid duplicates)
    if (!isFirstUpload) {
      res.json({
        success: true,
        message: 'Image already saved. Meta AI will generate variations when creating ads.',
        skipped: true,
        variationIndex: variationIndex || 0,
      });
      return;
    }

    // Get Facebook account info for uploading image
    const { Adset } = await import('../models/Adset');
    const { Campaign } = await import('../models/Campaign');
    const { FacebookAccount } = await import('../models/FacebookAccount');
    const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');

    const adset = await Adset.findById(adsetId).populate('campaignId');
    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const campaign = adset.campaignId as any;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);

    // Save file locally first
    const { FileStorageService } = await import('../services/storage/FileStorageService');
    const fileStorage = new FileStorageService();
    const savedFile = await fileStorage.saveFile(file, 'images');

    // Try to upload to Facebook to get image hash for preview generation
    let imageHash: string | null = null;
    if (facebookAccount) {
      try {
        await TokenRefreshService.checkAndRefreshToken(facebookAccount);
        const apiService = new FacebookApiService(facebookAccount.accessToken);
        
        // Upload image to Facebook to get hash for preview generation
        imageHash = await apiService.uploadAdImage(
          `act_${facebookAccount.accountId}`,
          `${process.env.API_URL || 'http://localhost:3001'}${savedFile.url}`
        );
      } catch (uploadError: any) {
        console.warn('Failed to upload image to Facebook for preview, but saving locally:', uploadError.message);
        // Continue without hash - user can still use the image
      }
    }

    // Save original image as asset (only once)
    const { Asset } = await import('../models/Asset');
    const originalAsset = new Asset({
      adsetId,
      type: 'image',
      filename: savedFile.filename,
      filepath: savedFile.filepath,
      url: savedFile.url,
      metadata: {
        ...(imageHash && { facebookImageHash: imageHash }),
      },
    });
    await originalAsset.save();

    res.json({
      success: true,
      message: 'Image saved successfully. You can now generate Meta AI previews to see variations before creating ads.',
      asset: originalAsset,
      imageHash, // Return hash so frontend can use it for preview generation
      metaAIEnabled: true,
      variationIndex: variationIndex || 0,
      note: imageHash 
        ? 'Image uploaded to Facebook. You can generate previews to see Meta AI variations before creating ads.'
        : 'Image saved locally. Upload to Facebook failed, but you can still use it. Try generating previews after uploading manually.',
    });
  } catch (error: any) {
    console.error('Generate single image variation error:', error);
    res.status(500).json({ error: error.message || 'Failed to save image for Meta AI' });
  }
};

export const generateImageVariations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, count = 3, prompt, useMetaAI, aiFeatures } = req.body;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    if (!adsetId) {
      res.status(400).json({ error: 'Adset ID is required' });
      return;
    }

    const { CreativeGenerator } = await import('../services/ai/CreativeGenerator');
    const creativeGenerator = new CreativeGenerator();

    let imageUrls: string[] = [];
    let savedAssets: any[] = [];

    // Use Meta's native Generative AI features
    // Reference: https://developers.facebook.com/docs/marketing-api/creative/generative-ai-features/
    const { Adset } = await import('../models/Adset');
    const { Campaign } = await import('../models/Campaign');
    const { FacebookAccount } = await import('../models/FacebookAccount');
    const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');

    const adset = await Adset.findById(adsetId).populate('campaignId');
    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const campaign = adset.campaignId as any;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    // Save file locally - Meta AI will use the image when creating ads
    // We don't need to upload to Facebook immediately since Meta AI generates variations
    // at ad creation time, not during image upload
    const { FileStorageService } = await import('../services/storage/FileStorageService');
    const fileStorage = new FileStorageService();
    const savedFile = await fileStorage.saveFile(file, 'images');

    // Save original image as asset
    const { Asset } = await import('../models/Asset');
    const originalAsset = new Asset({
      adsetId,
      type: 'image',
      filename: savedFile.filename,
      filepath: savedFile.filepath,
      url: savedFile.url,
    });
    await originalAsset.save();
    savedAssets.push(originalAsset);

    // Meta's Generative AI works differently - it generates variations at ad creation time
    // For now, we'll save the original image and note that Meta AI will generate variations
    // when the ad is created with AI features enabled
    res.json({
      success: true,
      message: 'Image uploaded. Meta AI will generate variations when you create ads with AI features enabled.',
      originalAsset: originalAsset,
      assets: savedAssets,
      count: 1,
      metaAIEnabled: true,
      aiFeatures: aiFeatures || {
        textGeneration: true,
        imageExpansion: true,
        backgroundGeneration: false,
      },
      note: 'Meta AI generates variations automatically when creating ads. Use the createAdCreativeWithAI endpoint to enable AI features.',
    });
  } catch (error: any) {
    console.error('Generate image variations error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image variations' });
  }
};

export const analyzeCreative = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      res.status(400).json({ error: 'Image URL is required' });
      return;
    }

    const { CreativeGenerator } = await import('../services/ai/CreativeGenerator');
    const creativeGenerator = new CreativeGenerator();
    const analysis = await creativeGenerator.analyzeCreative(imageUrl);

    res.json(analysis);
  } catch (error: any) {
    console.error('Analyze creative error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze creative' });
  }
};

export const generateMetaAIPreviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, imageHash, pageId, aiFeatures } = req.body;

    if (!adsetId || !imageHash) {
      res.status(400).json({ 
        error: 'adsetId and imageHash are required' 
      });
      return;
    }

    const { Adset } = await import('../models/Adset');
    const { Campaign } = await import('../models/Campaign');
    const { FacebookAccount } = await import('../models/FacebookAccount');
    const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');

    const adset = await Adset.findById(adsetId).populate('campaignId');
    if (!adset) {
      res.status(404).json({ error: 'Adset not found' });
      return;
    }

    const campaign = adset.campaignId as any;
    const facebookAccount = await FacebookAccount.findById(campaign.facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get page ID if not provided
    let finalPageId = pageId;
    if (!finalPageId) {
      try {
        const pages = await apiService.getPages();
        if (pages.length > 0) {
          finalPageId = pages[0].id;
        } else {
          res.status(400).json({ 
            error: 'No Facebook pages found. Please connect a Facebook page to your account.' 
          });
          return;
        }
      } catch (error: any) {
        res.status(400).json({ 
          error: 'Failed to get Facebook page. Please provide a pageId or ensure you have a connected page.' 
        });
        return;
      }
    }

    // Create creative spec for preview
    const creativeSpec = {
      objectStorySpec: {
        page_id: finalPageId,
        link_data: {
          image_hash: imageHash,
          link: 'https://example.com', // Placeholder - will be replaced when creating actual ad
        },
      },
      pageId: finalPageId,
      aiFeatures: aiFeatures || {
        textGeneration: true,
        imageExpansion: true,
        backgroundGeneration: false,
      },
    };

    // Generate previews for different placements
    const placements = ['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'FACEBOOK_REELS_MOBILE'];
    const previews: any = {};

    for (const placement of placements) {
      try {
        const preview = await apiService.generateAIPreviews(
          `act_${facebookAccount.accountId}`,
          creativeSpec,
          placement
        );
        previews[placement] = preview;
      } catch (error: any) {
        console.warn(`Failed to generate preview for ${placement}:`, error.message);
        previews[placement] = { error: error.message };
      }
    }

    res.json({
      success: true,
      previews,
      pageId: finalPageId,
      note: 'These are previews of what Meta AI will generate. You can review them before creating ads.',
    });
  } catch (error: any) {
    console.error('Generate Meta AI previews error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate Meta AI previews' });
  }
};

export const generateVariantsFromAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { assetId, count = 3, prompt, aiFeatures } = req.body;

    if (!assetId) {
      res.status(400).json({ error: 'Asset ID is required' });
      return;
    }

    const { Asset } = await import('../models/Asset');
    const { Adset } = await import('../models/Adset');
    const { Campaign } = await import('../models/Campaign');
    const { FacebookAccount } = await import('../models/FacebookAccount');
    const { FacebookApiService } = await import('../services/facebook/FacebookApiService');
    const { TokenRefreshService } = await import('../services/facebook/TokenRefreshService');

    // Get the asset
    const asset = await Asset.findById(assetId).populate('adsetId');
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const adset = asset.adsetId as any;
    if (adset.userId.toString() !== req.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    if (asset.type !== 'image') {
      res.status(400).json({ error: 'Only images can generate variants' });
      return;
    }

    const campaign = await Campaign.findById(adset.campaignId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const facebookAccount = await FacebookAccount.findById((campaign as any).facebookAccountId);
    if (!facebookAccount) {
      res.status(404).json({ error: 'Facebook account not found' });
      return;
    }

    await TokenRefreshService.checkAndRefreshToken(facebookAccount);
    const apiService = new FacebookApiService(facebookAccount.accessToken);

    // Get or upload image to Facebook to get hash
    let imageHash = asset.metadata?.facebookImageHash;
    let uploadWarning: string | null = null;
    
    if (!imageHash) {
      // Construct image URL
      const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        process.env.API_URL ||
        'http://localhost:3001';
      const imageUrl = `${baseUrl}${asset.url}`;
      
      console.log('[generateVariantsFromAsset] Environment check:', {
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
        API_URL: process.env.API_URL,
        baseUrl,
        assetUrl: asset.url,
        imageUrl,
      });
      
      // Check if URL is publicly accessible (not localhost)
      const isLocalhost =
        imageUrl.includes('localhost') ||
        imageUrl.includes('127.0.0.1');
      
      console.log('[generateVariantsFromAsset] Localhost check:', {
        isLocalhost,
        imageUrl,
        containsLocalhost: imageUrl.includes('localhost'),
        contains127: imageUrl.includes('127.0.0.1'),
      });
      
      if (isLocalhost) {
        // For localhost, we can't upload to Facebook, but we can still proceed
        // The image will be uploaded when creating the actual ad
        uploadWarning = 'Image is on localhost and cannot be accessed by Facebook. Preview generation requires a publicly accessible URL. The image will be uploaded to Facebook when you create ads.';
        
        // Try to upload anyway - it will fail, but we'll handle it gracefully
        try {
          console.log('[generateVariantsFromAsset] Attempting localhost upload (expected to fail)');
          imageHash = await apiService.uploadAdImage(
            `act_${facebookAccount.accountId}`,
            imageUrl
          );
          
          // Save hash if upload succeeded
          asset.metadata = {
            ...asset.metadata,
            facebookImageHash: imageHash,
          };
          await asset.save();
        } catch (uploadError: any) {
          // Upload failed - this is expected for localhost
          // We'll proceed without the hash, but previews won't work
          console.warn('Image upload to Facebook failed (expected for localhost):', uploadError.message);
          
          // Return a helpful error explaining the situation
          res.status(400).json({ 
            error: 'Cannot generate previews: Image must be publicly accessible',
            details: uploadError.message,
            solution: 'To generate previews, you need to either:\n' +
              '1. Deploy your server to a public URL and set API_URL environment variable\n' +
              '2. Use a tunneling service (like ngrok) to expose localhost\n' +
              '3. Upload images directly to Facebook when creating ads (previews won\'t be available)',
            canProceed: false,
            note: 'You can still use this image when creating ads - Facebook will upload it automatically.'
          });
          return;
        }
      } else {
        // URL is publicly accessible, try to upload
        try {
          console.log('[generateVariantsFromAsset] Attempting public upload', {
            accountId: `act_${facebookAccount.accountId}`,
            imageUrl,
          });
          imageHash = await apiService.uploadAdImage(
            `act_${facebookAccount.accountId}`,
            imageUrl
          );
          
          // Save hash to asset metadata
          asset.metadata = {
            ...asset.metadata,
            facebookImageHash: imageHash,
          };
          await asset.save();
        } catch (uploadError: any) {
          console.error('[generateVariantsFromAsset] Public upload failed', {
            message: uploadError.message,
          });
          res.status(500).json({ 
            error: `Failed to upload image to Facebook: ${uploadError.message}`,
            details: 'Please ensure:\n' +
              '1. Your Facebook app has "ads_management" permission\n' +
              '2. The ad account is approved for advertising\n' +
              '3. The image URL is publicly accessible via HTTPS'
          });
          return;
        }
      }
    }

    // Get page ID
    let pageId: string;
    try {
      const pages = await apiService.getPages();
      if (pages.length > 0) {
        pageId = pages[0].id;
      } else {
        res.status(400).json({ 
          error: 'No Facebook pages found. Please connect a Facebook page to your account.' 
        });
        return;
      }
    } catch (error: any) {
      res.status(400).json({ 
        error: 'Failed to get Facebook page. Please ensure you have a connected page.' 
      });
      return;
    }

    // Generate previews for different placements
    const placements = ['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'FACEBOOK_REELS_MOBILE'];
    const previews: any = {};

    const creativeSpec = {
      objectStorySpec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash,
          link: 'https://example.com', // Placeholder
        },
      },
      pageId,
      aiFeatures: aiFeatures || {
        textGeneration: true,
        imageExpansion: true,
        backgroundGeneration: false,
      },
    };

    for (const placement of placements) {
      try {
        const preview = await apiService.generateAIPreviews(
          `act_${facebookAccount.accountId}`,
          creativeSpec,
          placement
        );
        previews[placement] = preview;
      } catch (error: any) {
        console.warn(`Failed to generate preview for ${placement}:`, error.message);
        previews[placement] = { error: error.message };
      }
    }

    res.json({
      success: true,
      assetId: asset._id,
      imageHash,
      count,
      prompt,
      previews,
      note: 'These are previews of what Meta AI will generate. Meta will create variations automatically when you deploy ads with AI features enabled.',
    });
  } catch (error: any) {
    console.error('Generate variants from asset error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate variants from asset' });
  }
};

export const generateCopy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adsetId, prompt, context, scrapedContent, config } = req.body;

    if (!adsetId) {
      res.status(400).json({ error: 'Adset ID is required' });
      return;
    }

    let generatedCopy;

    if (scrapedContent) {
      generatedCopy = await getCopyGenerator().generateFromLandingPage(
        scrapedContent,
        context || {},
        config
      );
    } else if (prompt) {
      generatedCopy = await getCopyGenerator().generateWithCustomPrompt(
        prompt,
        context || {},
        config
      );
    } else {
      res.status(400).json({ error: 'Either prompt or scrapedContent is required' });
      return;
    }

    // Save copies to database
    const savedCopies = [];

    // Save headlines/titles
    const headlines = generatedCopy.headlines || [];
    for (let i = 0; i < headlines.length; i++) {
      const copy = new AdCopy({
        adsetId,
        type: 'headline',
        content: headlines[i],
        variantIndex: i,
        generatedByAI: true,
        aiPrompt: prompt || 'Generated from landing page',
      });
      await copy.save();
      savedCopies.push(copy);
    }

    // Save hooks separately
    const hooks = generatedCopy.hooks || [];
    for (let i = 0; i < hooks.length; i++) {
      const copy = new AdCopy({
        adsetId,
        type: 'hook',
        content: hooks[i],
        variantIndex: i,
        generatedByAI: true,
        aiPrompt: prompt || 'Generated from landing page',
      });
      await copy.save();
      savedCopies.push(copy);
    }

    // Save body copies (with CTAs appended if configured)
    const bodyCopies = generatedCopy.bodyCopies || [];
    const ctas = generatedCopy.ctas || [];
    
    for (let i = 0; i < bodyCopies.length; i++) {
      let bodyContent = bodyCopies[i];
      
      // Append CTA to body if configured
      if (ctas.length > 0 && config?.ctas?.count > 0) {
        const ctaIndex = i % ctas.length;
        bodyContent = `${bodyContent}\n\n${ctas[ctaIndex]}`;
      }
      
      const copy = new AdCopy({
        adsetId,
        type: 'body',
        content: bodyContent,
        variantIndex: i,
        generatedByAI: true,
        aiPrompt: prompt || 'Generated from landing page',
      });
      await copy.save();
      savedCopies.push(copy);
    }

    // Always save CTAs separately (in addition to appending to bodies if configured)
    for (let i = 0; i < ctas.length; i++) {
      const copy = new AdCopy({
        adsetId,
        type: 'cta',
        content: ctas[i],
        variantIndex: i,
        generatedByAI: true,
        aiPrompt: prompt || 'Generated from landing page',
      });
      await copy.save();
      savedCopies.push(copy);
    }

    // Save descriptions
    for (let i = 0; i < (generatedCopy.descriptions || []).length; i++) {
      const copy = new AdCopy({
        adsetId,
        type: 'description',
        content: generatedCopy.descriptions[i],
        variantIndex: i,
        generatedByAI: true,
        aiPrompt: prompt || 'Generated from landing page',
      });
      await copy.save();
      savedCopies.push(copy);
    }

    res.json({
      headlines: generatedCopy.headlines || [],
      hooks: generatedCopy.hooks || [],
      bodyCopies: generatedCopy.bodyCopies || [],
      descriptions: generatedCopy.descriptions || [],
      ctas: generatedCopy.ctas || [],
      savedCopies,
    });
  } catch (error: any) {
    console.error('Generate copy error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate copy' });
  }
};

