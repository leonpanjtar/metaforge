import { Router } from 'express';
import {
  scrapeLandingPage,
  generateCopy,
  generateImage,
  generateImageVariations,
  generateSingleImageVariation,
  generateMetaAIPreviews,
  generateVariantsFromAsset,
  analyzeCreative,
} from '../controllers/aiController';
import { authenticate } from '../middleware/auth';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.post('/scrape-landing-page', authenticate, scrapeLandingPage);
router.post('/generate-copy', authenticate, generateCopy);
router.post('/generate-image', authenticate, generateImage);
router.post('/generate-image-variations', authenticate, upload.single('image'), generateImageVariations);
router.post('/generate-single-variation', authenticate, upload.single('image'), generateSingleImageVariation);
router.post('/generate-meta-ai-previews', authenticate, generateMetaAIPreviews);
router.post('/generate-variants-from-asset', authenticate, generateVariantsFromAsset);
router.post('/analyze-creative', authenticate, analyzeCreative);

export default router;

