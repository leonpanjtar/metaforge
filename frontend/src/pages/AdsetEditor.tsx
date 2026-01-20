import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import FileUpload from '../components/FileUpload';

interface Adset {
  _id: string;
  name: string;
  campaignId?: string | { _id: string; name: string };
  contentData?: {
    landingPageUrl?: string;
    angle?: string;
    keywords?: string[];
    importantThings?: string;
    baseAssets?: string[];
  };
}

interface Asset {
  _id: string;
  type: 'image' | 'video';
  filename: string;
  url: string;
  metadata?: {
    width?: number;
    height?: number;
    size?: number;
    facebookImageHash?: string;
  };
}

interface AdCopy {
  _id: string;
  type: 'headline' | 'body' | 'description' | 'cta' | 'hook';
  content: string;
  variantIndex: number;
  generatedByAI: boolean;
}

interface Combination {
  _id: string;
  assetIds: any[];
  headlineId: { _id: string; content: string };
  hookId?: { _id: string; content: string };
  bodyId: { _id: string; content: string };
  descriptionId: { _id: string; content: string };
  ctaId: { _id: string; content: string };
  ctaType?: string;
  url?: string;
  scores: {
    hook: number;
    alignment: number;
    fit: number;
    clarity: number;
    match: number;
  };
  overallScore: number;
  predictedCTR?: number;
  deployedToFacebook?: boolean;
  facebookAdId?: string;
}

// All valid Facebook CTA types
const FACEBOOK_CTA_TYPES = [
  'BOOK_TRAVEL',
  'CONTACT_US',
  'DONATE',
  'DONATE_NOW',
  'DOWNLOAD',
  'GET_DIRECTIONS',
  'GO_LIVE',
  'INTERESTED',
  'LEARN_MORE',
  'SEE_DETAILS',
  'LIKE_PAGE',
  'MESSAGE_PAGE',
  'RAISE_MONEY',
  'SAVE',
  'SEND_TIP',
  'SHOP_NOW',
  'SIGN_UP',
  'VIEW_INSTAGRAM_PROFILE',
  'INSTAGRAM_MESSAGE',
  'LOYALTY_LEARN_MORE',
  'PURCHASE_GIFT_CARDS',
  'PAY_TO_ACCESS',
  'SEE_MORE',
  'TRY_IN_CAMERA',
  'WHATSAPP_LINK',
  'GET_IN_TOUCH',
  'TRY_NOW',
  'BOOK_NOW',
  'CHECK_AVAILABILITY',
  'ORDER_NOW',
  'WHATSAPP_MESSAGE',
  'GET_MOBILE_APP',
  'INSTALL_MOBILE_APP',
  'USE_MOBILE_APP',
  'INSTALL_APP',
  'USE_APP',
  'PLAY_GAME',
  'TRY_DEMO',
  'WATCH_VIDEO',
  'WATCH_MORE',
  'OPEN_LINK',
  'NO_BUTTON',
  'LISTEN_MUSIC',
  'MOBILE_DOWNLOAD',
  'GET_OFFER',
  'GET_OFFER_VIEW',
  'BUY_NOW',
  'BUY_TICKETS',
  'UPDATE_APP',
  'BET_NOW',
  'ADD_TO_CART',
  'SELL_NOW',
  'GET_SHOWTIMES',
  'LISTEN_NOW',
  'GET_EVENT_TICKETS',
  'REMIND_ME',
  'SEARCH_MORE',
  'PRE_REGISTER',
  'SWIPE_UP_PRODUCT',
  'SWIPE_UP_SHOP',
  'PLAY_GAME_ON_FACEBOOK',
  'VISIT_WORLD',
  'OPEN_INSTANT_APP',
  'JOIN_GROUP',
  'GET_PROMOTIONS',
  'SEND_UPDATES',
  'INQUIRE_NOW',
  'VISIT_PROFILE',
  'CHAT_ON_WHATSAPP',
  'EXPLORE_MORE',
  'CONFIRM',
  'JOIN_CHANNEL',
  'MAKE_AN_APPOINTMENT',
  'ASK_ABOUT_SERVICES',
  'BOOK_A_CONSULTATION',
  'GET_A_QUOTE',
  'BUY_VIA_MESSAGE',
  'ASK_FOR_MORE_INFO',
  'CHAT_WITH_US',
  'VIEW_PRODUCT',
  'VIEW_CHANNEL',
  'WATCH_LIVE_VIDEO',
  'IMAGINE',
  'CALL',
  'MISSED_CALL',
  'CALL_NOW',
  'CALL_ME',
  'APPLY_NOW',
  'BUY',
  'GET_QUOTE',
  'SUBSCRIBE',
  'RECORD_NOW',
  'VOTE_NOW',
  'GIVE_FREE_RIDES',
  'REGISTER_NOW',
  'OPEN_MESSENGER_EXT',
  'EVENT_RSVP',
  'CIVIC_ACTION',
  'SEND_INVITES',
  'REFER_FRIENDS',
  'REQUEST_TIME',
  'SEE_MENU',
  'SEARCH',
  'TRY_IT',
  'TRY_ON',
  'LINK_CARD',
  'DIAL_CODE',
  'FIND_YOUR_GROUPS',
  'START_ORDER',
];

// Helper to format CTA type for display
const formatCTAType = (type: string): string => {
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

type Tab = 'content' | 'generated-content' | 'generated-assets' | 'combinations';

const AdsetEditor = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('content');

  // Content Data State
  const [landingPageUrl, setLandingPageUrl] = useState('');
  const [angle, setAngle] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [importantThings, setImportantThings] = useState('');
  const [savingContent, setSavingContent] = useState(false);

  // Copy Generation State
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [copyGenConfig, setCopyGenConfig] = useState({
    bodies: { 
      count: 5, 
      description: 'Create compelling body copy that addresses pain points, highlights benefits, and creates urgency. Use problem-agitate-solve framework. Keep it conversational and benefit-focused.' 
    },
    ctas: { 
      count: 3, 
      description: 'Generate action-oriented CTAs that create urgency. Examples: "Get Started", "Claim Your Free Quote", "Book a Consultation", "Download Now", "Learn More". Make them specific and compelling.' 
    },
    hooks: { 
      count: 5, 
      description: 'Create attention-grabbing hooks that stop the scroll. Use questions, bold statements, curiosity gaps, or surprising facts. Make them relevant to the target audience and angle.' 
    },
    titles: { 
      count: 10, 
      description: 'Generate benefit-driven headlines that communicate value quickly. Use numbers, questions, and power words. Focus on outcomes and transformation. Keep under 60 characters for best results.' 
    },
    descriptions: { 
      count: 5, 
      description: 'Write concise descriptions that expand on the headline. Include key features, social proof, or additional benefits. Keep them scannable and focused on the value proposition.' 
    },
  });
  const [customCopyInput, setCustomCopyInput] = useState<{
    type: 'headline' | 'hook' | 'body' | 'description' | 'cta' | null;
    content: string;
  }>({ type: null, content: '' });

  // Asset variant generation state
  const [generatingForAsset, setGeneratingForAsset] = useState<string | null>(null);
  const [showVariantGenerator, setShowVariantGenerator] = useState(false);
  const [selectedAssetForVariants, setSelectedAssetForVariants] = useState<Asset | null>(null);
  const [variantCount, setVariantCount] = useState(3);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantProvider, setVariantProvider] = useState<'meta' | 'openai'>('openai');
  
  // Text-to-image generation state
  const [textToImagePrompt, setTextToImagePrompt] = useState('');
  const [textToImageCount, setTextToImageCount] = useState(1);
  const [generatingFromPrompt, setGeneratingFromPrompt] = useState(false);
  
  // Asset preview state
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  // Fetch adset
  const { data: adset } = useQuery<Adset>({
    queryKey: ['adset', adsetId],
    queryFn: async () => {
      const response = await api.get(`/adsets/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  // Update form when adset data loads
  useEffect(() => {
    if (adset?.contentData) {
      setLandingPageUrl(adset.contentData.landingPageUrl || '');
      setAngle(adset.contentData.angle || '');
      setKeywords(adset.contentData.keywords || []);
      setImportantThings(adset.contentData.importantThings || '');
    }
  }, [adset]);

  // Fetch assets
  const { data: assets, refetch: refetchAssets } = useQuery<Asset[]>({
    queryKey: ['assets', adsetId],
    queryFn: async () => {
      const response = await api.get(`/assets/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  // Fetch ad copies
  const { data: copies } = useQuery<AdCopy[]>({
    queryKey: ['ad-copies', adsetId],
    queryFn: async () => {
      const response = await api.get(`/ad-copies/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  // Fetch combinations
  const { data: combinations } = useQuery<Combination[]>({
    queryKey: ['combinations', adsetId],
    queryFn: async () => {
      const response = await api.get(`/combinations/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  // Save content data
  const saveContentMutation = useMutation({
    mutationFn: async (payload: { contentData: any }) => {
      const response = await api.put(`/adsets/${adsetId}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adset', adsetId] });
    },
    onError: (error: any) => {
      console.error('Save content error:', error);
      throw error;
    },
  });

  // Generate copy mutation
  const generateCopyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/ai/generate-copy', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
      setShowGenerateForm(false);
    },
  });

  // Delete copy mutation
  const deleteCopyMutation = useMutation({
    mutationFn: async (copyId: string) => {
      await api.delete(`/ad-copies/${copyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
    },
  });

  // Track edited copy content
  const [editedCopyContent, setEditedCopyContent] = useState<Record<string, string>>({});
  // Removed saving/saved state - autosave is now silent
  const saveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Update copy mutation - silent autosave
  const updateCopyMutation = useMutation({
    mutationFn: async ({ copyId, content }: { copyId: string; content: string }) => {
      await api.put(`/ad-copies/${copyId}`, { content });
    },
    onSuccess: (_data, variables) => {
      // Update the query cache directly without refetching to prevent UI flicker
      queryClient.setQueryData(['ad-copies', adsetId], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((copy: any) => 
          copy._id === variables.copyId 
            ? { ...copy, content: variables.content }
            : copy
        );
      });
      // Remove from edited content since it's now saved and in cache
      setEditedCopyContent(prev => {
        const next = { ...prev };
        delete next[variables.copyId];
        return next;
      });
    },
    onError: (_error: any) => {
      // Silent error - could add toast notification here if needed
      console.error('Failed to save copy:', _error);
    },
  });

  // Handle copy content change with debounced autosave (silent)
  const handleCopyContentChange = (copyId: string, newContent: string) => {
    // Update local state immediately for responsive UI
    setEditedCopyContent(prev => ({ ...prev, [copyId]: newContent }));

    // Clear existing timeout for this copy
    if (saveTimeoutsRef.current[copyId]) {
      clearTimeout(saveTimeoutsRef.current[copyId]);
    }

    // Set new timeout for silent autosave (1 second after user stops typing)
    saveTimeoutsRef.current[copyId] = setTimeout(() => {
      updateCopyMutation.mutate({ copyId, content: newContent });
      delete saveTimeoutsRef.current[copyId];
    }, 1000);
  };

  // Delete all generated copy mutation
  const deleteAllGeneratedCopyMutation = useMutation({
    mutationFn: async () => {
      if (!copies) return;
      const generatedCopies = copies.filter(c => c.generatedByAI);
      await Promise.all(generatedCopies.map(copy => api.delete(`/ad-copies/${copy._id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
    },
  });

  // Create custom copy mutation
  const createCustomCopyMutation = useMutation({
    mutationFn: async (data: { adsetId: string; type: string; content: string }) => {
      const response = await api.post('/ad-copies', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
      setCustomCopyInput({ type: null, content: '' });
    },
  });

  // Component selection state
  const [selectedComponents, setSelectedComponents] = useState<{
    assets: string[];
    hooks: string[];
    bodies: string[];
    ctas: string[];
    headlines: string[];
    descriptions: string[];
    ctaTypes: string[]; // Facebook CTA button types
  }>({
    assets: [],
    hooks: [],
    bodies: [],
    ctas: [],
    headlines: [],
    descriptions: [],
    ctaTypes: [],
  });

  // Selected combinations state (all selected by default when generated)
  const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set());

  // Preview state
  const [previewingCombination, setPreviewingCombination] = useState<Combination | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Generate combinations mutation
  const generateCombinationsMutation = useMutation({
    mutationFn: async (components: typeof selectedComponents) => {
      const response = await api.post(`/combinations/generate/${adsetId}`, components);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
      // Select all combinations by default
      if (data.combinations) {
        setSelectedCombinations(new Set(data.combinations.map((c: Combination) => c._id)));
      }
    },
  });

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/deployment/deploy', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
    },
  });

  // Delete combination mutation
  const deleteCombinationMutation = useMutation({
    mutationFn: async (combinationId: string) => {
      if (!adsetId) throw new Error('Adset ID is required');
      await api.delete(`/combinations/${adsetId}/${combinationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
    },
  });

  // Bulk delete combinations mutation
  const deleteCombinationsBulkMutation = useMutation({
    mutationFn: async (combinationIds: string[]) => {
      await api.post(`/combinations/bulk-delete/${adsetId}`, {
        combinationIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
      setSelectedCombinations(new Set());
    },
  });

  // Update combination CTA type mutation
  const updateCombinationCTAMutation = useMutation({
    mutationFn: async ({ combinationId, ctaType }: { combinationId: string; ctaType: string }) => {
      await api.put(`/combinations/${adsetId}/${combinationId}`, { ctaType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
    },
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await api.delete(`/assets/${assetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

  // Generate variants mutation (Meta AI)
  const generateVariantsMutation = useMutation({
    mutationFn: async (data: { 
      assetId: string; 
      count: number; 
      prompt?: string;
      aiFeatures?: {
        textGeneration?: boolean;
        imageExpansion?: boolean;
        backgroundGeneration?: boolean;
      };
    }) => {
      const response = await api.post('/ai/generate-variants-from-asset', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

  // Generate variants mutation (OpenAI)
  // State for progressive loading
  const [generatingVariations, setGeneratingVariations] = useState<{
    isGenerating: boolean;
    progress: number;
    total: number;
    completedAssets: any[];
    errors: string[];
    message: string;
  }>({
    isGenerating: false,
    progress: 0,
    total: 0,
    completedAssets: [],
    errors: [],
    message: '',
  });

  const generateOpenAIVariantsMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      
      // Use fetch with streaming for SSE
      const response = await fetch(`${API_URL}/api/ai/generate-image-variations-openai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type for FormData - browser will set it with boundary
        },
        body: data,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || 'Failed to generate variations');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }

      const completedAssets: any[] = [];
      const errors: string[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Event type is in the line, but we parse it from data
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'progress' || data.type === 'generating' || data.type === 'processing' || data.type === 'analyzing' || data.type === 'analyzed') {
                setGeneratingVariations(prev => ({
                  ...prev,
                  progress: data.progress || 0,
                  total: data.total || prev.total,
                  message: data.message || '',
                }));
              } else if (data.type === 'complete') {
                completedAssets.push(data.asset);
                setGeneratingVariations(prev => ({
                  ...prev,
                  completedAssets: [...prev.completedAssets, data.asset],
                  progress: data.progress || prev.progress,
                }));
              } else if (data.type === 'error') {
                errors.push(data.message || 'Unknown error');
                setGeneratingVariations(prev => ({
                  ...prev,
                  errors: [...prev.errors, data.message || 'Unknown error'],
                }));
              } else if (data.type === 'done') {
                // Final result
                return {
                  success: true,
                  assets: data.assets || completedAssets,
                  count: data.count || completedAssets.length,
                  errors: data.errors || errors,
                };
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      return {
        success: true,
        assets: completedAssets,
        count: completedAssets.length,
        errors: errors,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
      setGeneratingVariations({
        isGenerating: false,
        progress: 0,
        total: 0,
        completedAssets: [],
        errors: [],
        message: '',
      });
    },
    onError: () => {
      setGeneratingVariations({
        isGenerating: false,
        progress: 0,
        total: 0,
        completedAssets: [],
        errors: [],
        message: '',
      });
    },
  });

  // Generate image from prompt mutation
  const generateImageFromPromptMutation = useMutation({
    mutationFn: async (data: { adsetId: string; prompt: string; count: number }) => {
      const response = await api.post('/ai/generate-image-from-prompt', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });


  const handleGenerateVariants = async () => {
    if (!selectedAssetForVariants || !adsetId) return;

    const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

    if (variantProvider === 'openai') {
      if (!variantPrompt.trim()) {
        alert('Please provide variation instructions for OpenAI generation');
        return;
      }
      
      setGeneratingForAsset(selectedAssetForVariants._id);
      try {
        // Fetch the image file
        const imageResponse = await fetch(`${API_URL}${selectedAssetForVariants.url}`);
        const imageBlob = await imageResponse.blob();
        
        // Create FormData
        const formData = new FormData();
        formData.append('image', imageBlob, selectedAssetForVariants.filename);
        formData.append('adsetId', adsetId);
        formData.append('count', variantCount.toString());
        formData.append('instructions', variantPrompt);
        
        const result = await generateOpenAIVariantsMutation.mutateAsync(formData);
        alert(`Successfully generated ${result.count} variation(s)!`);
        setShowVariantGenerator(false);
        setSelectedAssetForVariants(null);
        setVariantPrompt('');
      } catch (error: any) {
        const errorMessage = error.response?.data?.error || 'Failed to generate variants';
        const errorDetails = error.response?.data?.details || '';
        const errorHint = error.response?.data?.hint || '';
        
        const fullMessage = errorDetails 
          ? `${errorMessage}\n\nDetails: ${errorDetails}${errorHint ? `\n\nHint: ${errorHint}` : ''}`
          : errorMessage;
        
        alert(fullMessage);
        console.error('Generate variants error:', error.response?.data || error);
      } finally {
        setGeneratingForAsset(null);
      }
    } else {
      // Meta AI flow
      setGeneratingForAsset(selectedAssetForVariants._id);
      try {
        await generateVariantsMutation.mutateAsync({
          assetId: selectedAssetForVariants._id,
          count: variantCount,
          prompt: variantPrompt || undefined,
          aiFeatures: {
            textGeneration: true,
            imageExpansion: true,
            backgroundGeneration: false,
          },
        });
        setShowVariantGenerator(false);
        setSelectedAssetForVariants(null);
        setVariantPrompt('');
      } catch (error: any) {
        alert(error.response?.data?.error || 'Failed to generate variants');
      } finally {
        setGeneratingForAsset(null);
      }
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    await deleteAssetMutation.mutateAsync(assetId);
  };

  const handleSaveContent = async () => {
    setSavingContent(true);
    try {
      const payload = {
        contentData: {
          landingPageUrl: landingPageUrl || '',
          angle: angle || '',
          keywords: keywords || [],
          importantThings: importantThings || '',
        },
      };
      console.log('Saving content data:', payload);
      await saveContentMutation.mutateAsync(payload);
      // Show success message
      alert('Content data saved successfully!');
    } catch (error: any) {
      console.error('Failed to save content:', error);
      alert(error.response?.data?.error || 'Failed to save content data. Please try again.');
    } finally {
      setSavingContent(false);
    }
  };

  const handleDeleteAllGeneratedCopy = async () => {
    if (!copies || copies.length === 0) return;
    
    const generatedCount = copies.filter(c => c.generatedByAI).length;
    if (generatedCount === 0) {
      alert('No AI-generated copy to delete.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete all ${generatedCount} AI-generated copy items? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        await deleteAllGeneratedCopyMutation.mutateAsync();
        alert('All AI-generated copy deleted successfully.');
      } catch (error: any) {
        console.error('Failed to delete all generated copy:', error);
        alert(error.response?.data?.error || 'Failed to delete generated copy. Please try again.');
      }
    }
  };

  const handleAddKeyword = () => {
    if (keywordsInput.trim() && !keywords.includes(keywordsInput.trim())) {
      setKeywords([...keywords, keywordsInput.trim()]);
      setKeywordsInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  const handleGenerateCopy = async () => {
    const prompt = `Generate ad copy based on:
- Landing Page: ${landingPageUrl || 'Not provided'}
- Angle: ${angle || 'Not provided'}
- Keywords: ${keywords.join(', ') || 'Not provided'}
- Important Points: ${importantThings || 'Not provided'}`;

    await generateCopyMutation.mutateAsync({
      adsetId,
      prompt,
      scrapedContent: null,
      config: copyGenConfig,
    });
    setActiveTab('generated-content');
  };

  const handleDeleteCopy = async (copyId: string) => {
    await deleteCopyMutation.mutateAsync(copyId);
  };

  const handleAddCustomCopy = async () => {
    if (!customCopyInput.type || !customCopyInput.content.trim()) return;
    
    await createCustomCopyMutation.mutateAsync({
      adsetId: adsetId || '',
      type: customCopyInput.type,
      content: customCopyInput.content.trim(),
    });
  };

  const handleGenerateCombinations = async () => {
    await generateCombinationsMutation.mutateAsync(selectedComponents);
    setActiveTab('combinations');
  };

  const handlePreviewCombination = async (combination: Combination) => {
    setPreviewingCombination(combination);
    setLoadingPreview(true);
    try {
      const response = await api.get(`/combinations/preview/${adsetId}/${combination._id}`);
      // Preview HTML is in response.data.previews
      if (response.data.previews && response.data.previews.length > 0) {
        const preview = response.data.previews[0];
        setPreviewHtml(preview.body || preview.html || '');
      } else {
        setPreviewHtml('<p>Preview not available</p>');
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewHtml(`<p>Error loading preview: ${error.response?.data?.error || error.message}</p>`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeploy = async (combinationIds: string[], status: 'PAUSED' | 'ACTIVE') => {
    await deployMutation.mutateAsync({
      adsetId,
      combinationIds,
      status,
    });
  };

  const handleDeleteCombination = async (combinationId: string) => {
    if (confirm('Are you sure you want to delete this combination?')) {
      await deleteCombinationMutation.mutateAsync(combinationId);
      // Remove from selected combinations
      setSelectedCombinations(prev => {
        const newSet = new Set(prev);
        newSet.delete(combinationId);
        return newSet;
      });
    }
  };

  const handleDeleteCombinationsBulk = async () => {
    const selectedIds = Array.from(selectedCombinations);
    if (selectedIds.length === 0) {
      alert('Please select at least one combination to delete');
      return;
    }
    if (confirm(`Are you sure you want to delete ${selectedIds.length} combination(s)?`)) {
      await deleteCombinationsBulkMutation.mutateAsync(selectedIds);
    }
  };

  const campaignName = adset && 'campaignId' in adset && adset.campaignId && typeof adset.campaignId === 'object' 
    ? adset.campaignId.name 
    : 'Campaign';
  const campaignId = adset && 'campaignId' in adset && adset.campaignId
    ? (typeof adset.campaignId === 'object' ? adset.campaignId._id : adset.campaignId)
    : null;

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Breadcrumbs */}
      <nav className="mb-6" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <button
              onClick={() => navigate('/campaigns')}
              className="hover:text-gray-700 transition-colors"
            >
              Campaigns
            </button>
          </li>
          {campaignId && (
            <>
              <li>
                <span className="mx-2">/</span>
              </li>
              <li>
                <button
                  onClick={() => navigate(`/adsets/${campaignId}`)}
                  className="hover:text-gray-700 transition-colors"
                >
                  {campaignName}
                </button>
              </li>
            </>
          )}
          <li>
            <span className="mx-2">/</span>
          </li>
          <li className="text-gray-900 font-medium">{adset && 'name' in adset ? adset.name : 'Adset Editor'}</li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{adset && 'name' in adset ? adset.name : 'Adset Editor'}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage content, generate assets, create combinations, and deploy ads
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            {[
              { id: 'content', label: 'Content Data', icon: '📝' },
              { id: 'generated-content', label: 'Content', icon: '✍️' },
              { id: 'generated-assets', label: 'Assets', icon: '🖼️' },
              { id: 'combinations', label: 'Combinations & Deploy', icon: '🚀' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`
                  flex-1 py-4 px-6 text-sm font-medium text-center border-b-2 transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Content Data Tab */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Landing Page URL
                </label>
                <input
                  type="url"
                  value={landingPageUrl}
                  onChange={(e) => setLandingPageUrl(e.target.value)}
                  placeholder="https://example.com/landing-page"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  URL to scrape for content inspiration
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Angle / Positioning
                </label>
                <textarea
                  value={angle}
                  onChange={(e) => {
                    setAngle(e.target.value);
                    // Auto-resize
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`;
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 300)}px`;
                  }}
                  rows={3}
                  style={{ minHeight: '60px', maxHeight: '300px', resize: 'vertical' }}
                  placeholder="Describe the unique angle or positioning for this ad campaign..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 leading-relaxed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The unique selling proposition or angle for this campaign
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Keywords
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="Enter keyword"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Important Things / Key Points
                </label>
                <textarea
                  value={importantThings}
                  onChange={(e) => {
                    setImportantThings(e.target.value);
                    // Auto-resize
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`;
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 400)}px`;
                  }}
                  rows={5}
                  style={{ minHeight: '100px', maxHeight: '400px', resize: 'vertical' }}
                  placeholder="List important points, features, benefits, or messaging that should be emphasized..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 leading-relaxed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Key points, features, or messaging to emphasize in ads
                </p>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleSaveContent}
                  disabled={savingContent}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingContent ? 'Saving...' : 'Save Content Data'}
                </button>
              </div>
            </div>
          )}

          {/* Generated Content Tab */}
          {activeTab === 'generated-content' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Ad Copy</h2>
                <div className="flex gap-2">
                  {copies && copies.filter(c => c.generatedByAI).length > 0 && (
                    <button
                      onClick={handleDeleteAllGeneratedCopy}
                      disabled={deleteAllGeneratedCopyMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteAllGeneratedCopyMutation.isPending ? 'Deleting...' : 'Delete All Generated'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowGenerateForm(!showGenerateForm)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    {showGenerateForm ? 'Hide Generator' : 'Generate Copy'}
                  </button>
                </div>
              </div>

              {/* Copy Generation Form */}
              {showGenerateForm && (
                <div className="border rounded-lg p-6 bg-gray-50 space-y-4">
                  <h3 className="font-semibold text-gray-900">Copy Generation Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bodies */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bodies (Count)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={copyGenConfig.bodies.count}
                        onChange={(e) =>
                          setCopyGenConfig({
                            ...copyGenConfig,
                            bodies: { ...copyGenConfig.bodies, count: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                      />
                      <textarea
                        placeholder="Describe types of bodies (e.g., problem-agitate-solve, benefit-focused, urgency-driven)"
                        value={copyGenConfig.bodies.description}
                        onChange={(e) => {
                          setCopyGenConfig({
                            ...copyGenConfig,
                            bodies: { ...copyGenConfig.bodies, description: e.target.value },
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                        rows={3}
                        style={{ minHeight: '60px', maxHeight: '200px', resize: 'vertical' }}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 leading-relaxed"
                      />
                    </div>

                    {/* CTAs */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CTAs (Count) - Added to end of bodies
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={copyGenConfig.ctas.count}
                        onChange={(e) =>
                          setCopyGenConfig({
                            ...copyGenConfig,
                            ctas: { ...copyGenConfig.ctas, count: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                      />
                      <textarea
                        placeholder="Describe types of CTAs (e.g., action-oriented, soft, direct)"
                        value={copyGenConfig.ctas.description}
                        onChange={(e) => {
                          setCopyGenConfig({
                            ...copyGenConfig,
                            ctas: { ...copyGenConfig.ctas, description: e.target.value },
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                        rows={3}
                        style={{ minHeight: '60px', maxHeight: '200px', resize: 'vertical' }}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 leading-relaxed"
                      />
                    </div>

                    {/* Hooks */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hooks (Count)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={copyGenConfig.hooks.count}
                        onChange={(e) =>
                          setCopyGenConfig({
                            ...copyGenConfig,
                            hooks: { ...copyGenConfig.hooks, count: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                      />
                      <textarea
                        placeholder="Describe types of hooks (e.g., question-based, bold statement, curiosity)"
                        value={copyGenConfig.hooks.description}
                        onChange={(e) => {
                          setCopyGenConfig({
                            ...copyGenConfig,
                            hooks: { ...copyGenConfig.hooks, description: e.target.value },
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                        rows={3}
                        style={{ minHeight: '60px', maxHeight: '200px', resize: 'vertical' }}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 leading-relaxed"
                      />
                    </div>

                    {/* Titles */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Titles/Headlines (Count)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={copyGenConfig.titles.count}
                        onChange={(e) =>
                          setCopyGenConfig({
                            ...copyGenConfig,
                            titles: { ...copyGenConfig.titles, count: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                      />
                      <textarea
                        placeholder="Describe types of titles (e.g., benefit-driven, question-based, number-based)"
                        value={copyGenConfig.titles.description}
                        onChange={(e) => {
                          setCopyGenConfig({
                            ...copyGenConfig,
                            titles: { ...copyGenConfig.titles, description: e.target.value },
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                        rows={3}
                        style={{ minHeight: '60px', maxHeight: '200px', resize: 'vertical' }}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 leading-relaxed"
                      />
                    </div>

                    {/* Descriptions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Descriptions (Count)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={copyGenConfig.descriptions.count}
                        onChange={(e) =>
                          setCopyGenConfig({
                            ...copyGenConfig,
                            descriptions: {
                              ...copyGenConfig.descriptions,
                              count: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                      />
                      <textarea
                        placeholder="Describe types of descriptions (e.g., feature-focused, benefit-focused, social proof)"
                        value={copyGenConfig.descriptions.description}
                        onChange={(e) => {
                          setCopyGenConfig({
                            ...copyGenConfig,
                            descriptions: {
                              ...copyGenConfig.descriptions,
                              description: e.target.value,
                            },
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                        }}
                        rows={3}
                        style={{ minHeight: '60px', maxHeight: '200px', resize: 'vertical' }}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <button
                      onClick={() => setShowGenerateForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerateCopy}
                      disabled={generateCopyMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {generateCopyMutation.isPending ? 'Generating...' : 'Generate Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Add Custom Copy */}
              <div className="border rounded-lg p-4 bg-blue-50">
                <h3 className="font-semibold text-gray-900 mb-3">Add Custom Copy</h3>
                <div className="flex gap-2">
                  <select
                    value={customCopyInput.type || ''}
                    onChange={(e) =>
                      setCustomCopyInput({
                        ...customCopyInput,
                        type: e.target.value as 'headline' | 'hook' | 'body' | 'description' | 'cta' | null,
                      })
                    }
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select type...</option>
                    <option value="headline">Headline</option>
                    <option value="hook">Hook</option>
                    <option value="body">Body</option>
                    <option value="description">Description</option>
                    <option value="cta">CTA</option>
                  </select>
                  <input
                    type="text"
                    value={customCopyInput.content}
                    onChange={(e) =>
                      setCustomCopyInput({ ...customCopyInput, content: e.target.value })
                    }
                    placeholder="Enter custom copy..."
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCustomCopy();
                      }
                    }}
                  />
                  <button
                    onClick={handleAddCustomCopy}
                    disabled={!customCopyInput.type || !customCopyInput.content.trim() || createCustomCopyMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Display Copies */}
              {copies && copies.length > 0 ? (
                <div className="space-y-4">
                  {['headline', 'hook', 'body', 'description', 'cta'].map((type) => {
                    const typeCopies = copies.filter((c) => c.type === type);
                    // Debug: log CTAs specifically
                    if (type === 'cta') {
                      console.log('CTAs found:', typeCopies.length, typeCopies);
                    }
                    // Always show the section even if empty, so users know CTAs are supported
                    // But only render if there are copies
                    if (typeCopies.length === 0) {
                      // Show empty state for CTAs specifically to make it clear they're supported
                      if (type === 'cta') {
                        return (
                          <div key={type} className="border rounded-lg p-4 bg-green-50 border-green-200">
                            <h3 className="font-semibold text-green-900 mb-3">CTAs (0)</h3>
                            <p className="text-sm text-gray-500 italic">No CTAs generated yet. Generate copy with CTAs enabled above.</p>
                          </div>
                        );
                      }
                      return null;
                    }

                    // Map type to display name
                    const typeDisplayNames: Record<string, string> = {
                      headline: 'Headlines',
                      hook: 'Hooks',
                      body: 'Bodies',
                      description: 'Descriptions',
                      cta: 'CTAs',
                    };
                    
                    const isBody = type === 'body';
                    const isCTA = type === 'cta';
                    
                    return (
                      <div key={type} className={`border rounded-lg p-4 ${isBody ? 'bg-blue-50 border-blue-200' : isCTA ? 'bg-green-50 border-green-200' : ''}`}>
                        <h3 className={`font-semibold mb-3 capitalize ${isBody ? 'text-blue-900' : isCTA ? 'text-green-900' : 'text-gray-900'}`}>
                          {typeDisplayNames[type] || `${type}s`} ({typeCopies.length})
                        </h3>
                        <div className="space-y-2">
                          {typeCopies.map((copy) => {
                            const displayContent = editedCopyContent[copy._id] !== undefined 
                              ? editedCopyContent[copy._id] 
                              : copy.content;
                            // Determine textarea size based on type
                            const isBody = type === 'body';
                            const isCTA = type === 'cta';
                            const minHeight = isBody ? '120px' : isCTA ? '60px' : '40px';
                            const maxHeight = isBody ? '500px' : isCTA ? '200px' : '200px';
                            const textSize = isBody ? 'text-base' : isCTA ? 'text-sm' : 'text-sm';
                            const lineHeight = isBody ? 'leading-relaxed' : 'leading-normal';
                            
                            return (
                              <div
                                key={copy._id}
                                className="p-3 bg-gray-50 rounded border border-gray-200 group"
                              >
                                <div className="flex items-start gap-2">
                                  <textarea
                                    key={`textarea-${copy._id}`}
                                    value={displayContent}
                                    onChange={(e) => {
                                      const target = e.target;
                                      // Preserve cursor position before any state updates
                                      const cursorPosition = target.selectionStart;
                                      const scrollTop = target.scrollTop;
                                      
                                      // Update height
                                      target.style.height = 'auto';
                                      target.style.height = `${Math.min(target.scrollHeight, parseInt(maxHeight))}px`;
                                      
                                      // Handle content change (this updates state)
                                      handleCopyContentChange(copy._id, target.value);
                                      
                                      // Restore cursor position and scroll after React re-render
                                      requestAnimationFrame(() => {
                                        target.setSelectionRange(cursorPosition, cursorPosition);
                                        target.scrollTop = scrollTop;
                                      });
                                    }}
                                    onInput={(e) => {
                                      const target = e.target as HTMLTextAreaElement;
                                      target.style.height = 'auto';
                                      target.style.height = `${Math.min(target.scrollHeight, parseInt(maxHeight))}px`;
                                    }}
                                    className={`flex-1 ${textSize} ${lineHeight} text-gray-700 bg-white border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none`}
                                    style={{ minHeight, maxHeight }}
                                    rows={isBody ? 5 : isCTA ? 2 : 1}
                                  />
                                  <div className="flex items-start gap-2 flex-shrink-0">
                                    {copy.generatedByAI && (
                                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                                        AI
                                      </span>
                                    )}
                                    <button
                                      onClick={() => handleDeleteCopy(copy._id)}
                                      disabled={deleteCopyMutation.isPending}
                                      className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded transition-opacity"
                                      title="Delete"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No copy yet. Generate AI copy or add custom copy above.</p>
                </div>
              )}
            </div>
          )}

          {/* Assets Tab */}
          {activeTab === 'generated-assets' && (
            <div className="space-y-6">
              {/* Upload Section */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Upload Assets</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Upload your base images and videos. These can be used to generate variants.
                </p>
                <FileUpload adsetId={adsetId || ''} onUploadComplete={() => refetchAssets()} />
              </div>

              {/* Generate Assets Section */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Generate Assets</h2>
                
                {/* Text-to-Image Generation */}
                <div className="mb-6 pb-6 border-b">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Generate from Prompt</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Image Prompt
                      </label>
                      <textarea
                        value={textToImagePrompt}
                        onChange={(e) => setTextToImagePrompt(e.target.value)}
                        rows={3}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Describe the image you want to generate (e.g., 'A modern office space with natural lighting, minimalist design, professional atmosphere')"
                      />
                    </div>
                    <div className="flex gap-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Number of Images
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={textToImageCount}
                          onChange={(e) => setTextToImageCount(parseInt(e.target.value) || 1)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!textToImagePrompt.trim() || !adsetId) return;
                          setGeneratingFromPrompt(true);
                          try {
                            const result = await generateImageFromPromptMutation.mutateAsync({
                              adsetId,
                              prompt: textToImagePrompt,
                              count: textToImageCount,
                            });
                            alert(`Successfully generated ${result.count} image(s)!`);
                            setTextToImagePrompt('');
                            setTextToImageCount(1);
                          } catch (error: any) {
                            alert(error.response?.data?.error || 'Failed to generate images');
                          } finally {
                            setGeneratingFromPrompt(false);
                          }
                        }}
                        disabled={generatingFromPrompt || !textToImagePrompt.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {generatingFromPrompt ? 'Generating...' : 'Generate Images'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* All Assets Section */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">All Assets ({assets?.length || 0})</h2>
                {assets && assets.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {assets.map((asset) => (
                      <div key={asset._id} className="relative group">
                        {/* Preview - Click on image */}
                        <div
                          className="cursor-pointer relative"
                          onClick={() => setPreviewAsset(asset)}
                        >
                          {asset.type === 'image' ? (
                            <img
                              src={`${API_URL}${asset.url}`}
                              alt={asset.filename}
                              className="w-full h-32 object-cover rounded-lg border-2 border-gray-200 group-hover:border-blue-500 transition-all"
                            />
                          ) : (
                            <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-gray-200">
                              <span className="text-gray-500 text-sm">Video</span>
                            </div>
                          )}
                          <div className="absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity rounded-lg flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white text-xs">Click to preview</span>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-600 truncate" title={asset.filename}>
                          {asset.filename}
                        </p>
                        
                        {/* Action Buttons */}
                        <div className="mt-2 flex gap-2">
                          {/* Delete Icon Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAsset(asset._id);
                            }}
                            disabled={deleteAssetMutation.isPending}
                            className="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center disabled:opacity-50"
                            title="Delete asset"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          
                          {/* Generate Variations Button (only for images) */}
                          {asset.type === 'image' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAssetForVariants(asset);
                                setVariantCount(3);
                                setVariantPrompt('');
                                setShowVariantGenerator(true);
                              }}
                              disabled={generatingForAsset === asset._id}
                              className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              title="Generate variants"
                            >
                              {generatingForAsset === asset._id ? '...' : 'Variants'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No assets yet. Upload assets or generate new ones above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Combinations & Deploy Tab */}
          {activeTab === 'combinations' && (
            <div className="space-y-6">
              {/* Component Selector */}
              {(!combinations || combinations.length === 0) && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4">Select Components for Combinations</h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Choose which components to use when generating ad combinations. Leave all unchecked to use all available components.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Assets */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Assets ({assets?.length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {assets && assets.length > 0 ? (
                          assets.map((asset) => (
                            <label key={asset._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.assets.includes(asset._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      assets: [...prev.assets, asset._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      assets: prev.assets.filter(id => id !== asset._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{asset.filename}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No assets available</p>
                        )}
                      </div>
                    </div>

                    {/* Hooks */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hooks ({copies?.filter(c => c.type === 'hook').length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {copies && copies.filter(c => c.type === 'hook').length > 0 ? (
                          copies.filter(c => c.type === 'hook').map((hook) => (
                            <label key={hook._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.hooks.includes(hook._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      hooks: [...prev.hooks, hook._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      hooks: prev.hooks.filter(id => id !== hook._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate text-xs">{hook.content.substring(0, 50)}...</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No hooks available</p>
                        )}
                      </div>
                    </div>

                    {/* Bodies */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bodies ({copies?.filter(c => c.type === 'body').length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {copies && copies.filter(c => c.type === 'body').length > 0 ? (
                          copies.filter(c => c.type === 'body').map((body) => (
                            <label key={body._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.bodies.includes(body._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      bodies: [...prev.bodies, body._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      bodies: prev.bodies.filter(id => id !== body._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate text-xs">{body.content.substring(0, 50)}...</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No bodies available</p>
                        )}
                      </div>
                    </div>

                    {/* CTAs */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CTAs ({copies?.filter(c => c.type === 'cta').length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {copies && copies.filter(c => c.type === 'cta').length > 0 ? (
                          copies.filter(c => c.type === 'cta').map((cta) => (
                            <label key={cta._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.ctas.includes(cta._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      ctas: [...prev.ctas, cta._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      ctas: prev.ctas.filter(id => id !== cta._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate text-xs">{cta.content}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No CTAs available</p>
                        )}
                      </div>
                    </div>

                    {/* Headlines */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Headlines ({copies?.filter(c => c.type === 'headline').length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {copies && copies.filter(c => c.type === 'headline').length > 0 ? (
                          copies.filter(c => c.type === 'headline').map((headline) => (
                            <label key={headline._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.headlines.includes(headline._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      headlines: [...prev.headlines, headline._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      headlines: prev.headlines.filter(id => id !== headline._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate text-xs">{headline.content.substring(0, 50)}...</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No headlines available</p>
                        )}
                      </div>
                    </div>

                    {/* Descriptions */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Descriptions ({copies?.filter(c => c.type === 'description').length || 0})
                      </label>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {copies && copies.filter(c => c.type === 'description').length > 0 ? (
                          copies.filter(c => c.type === 'description').map((desc) => (
                            <label key={desc._id} className="flex items-center gap-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedComponents.descriptions.includes(desc._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      descriptions: [...prev.descriptions, desc._id]
                                    }));
                                  } else {
                                    setSelectedComponents(prev => ({
                                      ...prev,
                                      descriptions: prev.descriptions.filter(id => id !== desc._id)
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate text-xs">{desc.content.substring(0, 50)}...</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500">No descriptions available</p>
                        )}
                      </div>
                    </div>

                    {/* CTA Button Types */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          CTA Button Types ({FACEBOOK_CTA_TYPES.length} available)
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComponents(prev => ({
                                ...prev,
                                ctaTypes: FACEBOOK_CTA_TYPES
                              }));
                            }}
                            className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedComponents(prev => ({
                                ...prev,
                                ctaTypes: []
                              }));
                            }}
                            className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                      <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                        {FACEBOOK_CTA_TYPES.map((ctaType) => (
                          <label key={ctaType} className="flex items-center gap-2 py-1 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedComponents.ctaTypes.includes(ctaType)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedComponents(prev => ({
                                    ...prev,
                                    ctaTypes: [...prev.ctaTypes, ctaType]
                                  }));
                                } else {
                                  setSelectedComponents(prev => ({
                                    ...prev,
                                    ctaTypes: prev.ctaTypes.filter(type => type !== ctaType)
                                  }));
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate text-xs">{formatCTAType(ctaType)}</span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Select which Facebook CTA button types to use. Leave empty to use default (Learn More).
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleGenerateCombinations}
                      disabled={generateCombinationsMutation.isPending}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {generateCombinationsMutation.isPending ? 'Generating...' : 'Generate Combinations'}
                    </button>
                  </div>
                </div>
              )}

              {/* Combinations List */}
              {combinations && combinations.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Ad Combinations ({combinations.length})</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Select all
                          setSelectedCombinations(new Set(combinations.map(c => c._id)));
                        }}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          // Deselect all
                          setSelectedCombinations(new Set());
                        }}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Deselect All
                      </button>
                      <button
                        onClick={handleDeleteCombinationsBulk}
                        disabled={deleteCombinationsBulkMutation.isPending || selectedCombinations.size === 0}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteCombinationsBulkMutation.isPending ? 'Deleting...' : `Delete Selected (${selectedCombinations.size})`}
                      </button>
                      <select
                        id="deploy-status"
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        defaultValue="PAUSED"
                      >
                        <option value="PAUSED">Deploy as Paused</option>
                        <option value="ACTIVE">Deploy as Active</option>
                      </select>
                      <button
                        onClick={() => {
                          const selectedIds = Array.from(selectedCombinations);
                          if (selectedIds.length === 0) {
                            alert('Please select at least one combination to deploy');
                            return;
                          }
                          const status = (
                            document.getElementById('deploy-status') as HTMLSelectElement
                          ).value as 'PAUSED' | 'ACTIVE';
                          handleDeploy(selectedIds, status);
                        }}
                        disabled={deployMutation.isPending}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        {deployMutation.isPending ? 'Deploying...' : `Deploy Selected (${selectedCombinations.size})`}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {combinations.map((combination) => {
                      // Build ad body: hook + body + CTA
                      let adBody = '';
                      if (combination.hookId?.content) {
                        adBody += combination.hookId.content + '\n\n';
                      }
                      if (combination.bodyId?.content) {
                        adBody += combination.bodyId.content;
                      }
                      if (combination.ctaId?.content) {
                        adBody += '\n\n' + combination.ctaId.content;
                      }

                      const asset = combination.assetIds?.[0];
                      const isSelected = selectedCombinations.has(combination._id);

                      return (
                        <div
                          key={combination._id}
                          className={`border-2 rounded-lg p-4 bg-white hover:shadow-md transition-shadow ${
                            isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCombinations(prev => new Set([...prev, combination._id]));
                                  } else {
                                    setSelectedCombinations(prev => {
                                      const newSet = new Set(prev);
                                      newSet.delete(combination._id);
                                      return newSet;
                                    });
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm font-medium">Select</span>
                            </label>
                            <div className="text-right">
                              <div className="text-lg font-bold text-blue-600">
                                {Math.round(combination.overallScore || 0)}
                              </div>
                              <div className="text-xs text-gray-500">Score</div>
                            </div>
                          </div>

                          {/* Creative Preview */}
                          {asset && (
                            <div className="mb-3">
                              {asset.type === 'image' ? (
                                <img
                                  src={`${API_URL}${asset.url}`}
                                  alt="Creative"
                                  className="w-full h-32 object-cover rounded-lg border border-gray-200"
                                />
                              ) : (
                                <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center border border-gray-200">
                                  <span className="text-gray-500 text-sm">Video</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-2 text-sm mb-3">
                            <div>
                              <span className="font-medium text-gray-700">Headline:</span>
                              <p className="text-gray-900 mt-1">{combination.headlineId?.content || 'N/A'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Body:</span>
                              <p className="text-gray-900 mt-1 whitespace-pre-wrap line-clamp-3">{adBody || 'N/A'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Description:</span>
                              <p className="text-gray-900 mt-1 line-clamp-2">{combination.descriptionId?.content || 'N/A'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">CTA Button:</span>
                              <select
                                value={combination.ctaType || 'LEARN_MORE'}
                                onChange={(e) => {
                                  updateCombinationCTAMutation.mutate({
                                    combinationId: combination._id,
                                    ctaType: e.target.value,
                                  });
                                }}
                                disabled={updateCombinationCTAMutation.isPending}
                                className="mt-1 block w-full text-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              >
                                {FACEBOOK_CTA_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {formatCTAType(type)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {combination.url && (
                              <div>
                                <span className="font-medium text-gray-700">URL:</span>
                                <p className="text-gray-600 mt-1 truncate text-xs">{combination.url}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handlePreviewCombination(combination)}
                              disabled={loadingPreview}
                              className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {loadingPreview && previewingCombination?._id === combination._id ? 'Loading...' : 'Preview'}
                            </button>
                            <button
                              onClick={() => handleDeleteCombination(combination._id)}
                              disabled={deleteCombinationMutation.isPending}
                              className="px-3 py-2 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              title="Delete combination"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          {combination.deployedToFacebook && (
                            <div className="mt-2 text-xs text-green-600">
                              ✓ Deployed (ID: {combination.facebookAdId})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Variant Generator Modal */}
      {showVariantGenerator && selectedAssetForVariants && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowVariantGenerator(false);
            setSelectedAssetForVariants(null);
          }}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowVariantGenerator(false);
                setSelectedAssetForVariants(null);
              }}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 z-10"
            >
              ×
            </button>
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Generate Image Variants
              </h2>

              <div className="space-y-4">
                {/* Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI Provider
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="provider"
                        value="openai"
                        checked={variantProvider === 'openai'}
                        onChange={() => setVariantProvider('openai')}
                        className="mr-2"
                      />
                      <span className="text-sm">
                        <strong>OpenAI gpt-image-1</strong> (Recommended)
                        <span className="block text-xs text-gray-500 mt-1">
                          High quality, preserves aspect ratio, clear readable text
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="provider"
                        value="meta"
                        checked={variantProvider === 'meta'}
                        onChange={() => setVariantProvider('meta')}
                        className="mr-2"
                      />
                      <span className="text-sm">
                        <strong>Meta AI</strong>
                        <span className="block text-xs text-gray-500 mt-1">
                          Preview only (may not work)
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Variants
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={variantCount}
                    onChange={(e) => setVariantCount(parseInt(e.target.value) || 3)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {variantProvider === 'openai' 
                      ? 'OpenAI will generate high-quality variations based on your image analysis.'
                      : 'Meta AI will generate variations automatically. This number helps organize previews.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variation Instructions {variantProvider === 'openai' && '(Required)'}
                  </label>
                  <textarea
                    value={variantPrompt}
                    onChange={(e) => setVariantPrompt(e.target.value)}
                    rows={4}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={
                      variantProvider === 'openai'
                        ? "Describe how you want the variations to differ (e.g., 'change background to beach scene', 'use warmer colors', 'add more contrast', 'modify text to say X'). The AI will analyze your image and create variations based on these instructions."
                        : "Describe how you want the variations to differ (e.g., 'different color schemes', 'various backgrounds', 'different text styles'). Leave empty to let Meta AI decide."
                    }
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {variantProvider === 'openai'
                      ? 'The system will analyze your image first, then create prompts for each variation based on your instructions. Text will be clear and readable.'
                      : 'Meta AI will use these instructions as guidance when generating variations.'}
                  </p>
                </div>

                {variantProvider === 'openai' && (
                  <div className="bg-green-50 p-4 rounded-md border border-green-200">
                    <p className="text-sm text-green-800">
                      <strong>OpenAI gpt-image-1 Features:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Analyzes your image automatically</li>
                        <li>Preserves original aspect ratio</li>
                        <li>High quality (HD) output</li>
                        <li>Clear, readable text</li>
                        <li>Variations saved directly to your assets</li>
                      </ul>
                    </p>
                  </div>
                )}

                {variantProvider === 'meta' && (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> Meta AI generates variations when creating ads. These previews 
                      show what Meta will create. You can review and cherry-pick the best variations before deploying.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerateVariants}
                  disabled={generatingForAsset === selectedAssetForVariants._id || (variantProvider === 'openai' && !variantPrompt.trim())}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {generatingForAsset === selectedAssetForVariants._id 
                    ? `Generating ${variantCount} Variant(s) with ${variantProvider === 'openai' ? 'OpenAI' : 'Meta AI'}...` 
                    : `Generate ${variantCount} Variant(s) with ${variantProvider === 'openai' ? 'OpenAI gpt-image-1' : 'Meta AI'}`}
                </button>

                {/* Progressive Loading UI */}
                {generatingVariations.isGenerating && variantProvider === 'openai' && (
                  <div className="mt-6 space-y-4">
                    <div className="text-sm font-medium text-gray-700">
                      {generatingVariations.message || 'Generating variations...'} ({generatingVariations.progress}/{generatingVariations.total})
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {Array.from({ length: generatingVariations.total }).map((_, index) => {
                        const completedAsset = generatingVariations.completedAssets[index];
                        const isGenerating = index === generatingVariations.progress && generatingVariations.progress < generatingVariations.total;
                        const isCompleted = completedAsset !== undefined;
                        const hasError = generatingVariations.errors.some(err => err.includes(`Variation ${index + 1}`));

                        return (
                          <div key={index} className="relative border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
                            {isCompleted ? (
                              <img
                                src={`${API_URL}${completedAsset.url}`}
                                alt={`Variation ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                {isGenerating ? (
                                  <>
                                    <svg className="animate-spin h-8 w-8 text-blue-600 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-xs text-gray-600">Generating...</span>
                                  </>
                                ) : hasError ? (
                                  <>
                                    <svg className="h-8 w-8 text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-xs text-red-600">Error</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded mb-2"></div>
                                    <span className="text-xs text-gray-400">Waiting...</span>
                                  </>
                                )}
                              </div>
                            )}
                            <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                              {index + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {generatingVariations.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                        <ul className="text-xs text-red-700 list-disc list-inside">
                          {generatingVariations.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Preview Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="bg-white rounded-lg max-w-7xl w-full relative flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {previewAsset.filename}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (previewAsset.type === 'image') {
                      setSelectedAssetForVariants(previewAsset);
                      setVariantCount(3);
                      setVariantPrompt('');
                      setShowVariantGenerator(true);
                      setPreviewAsset(null);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Generate Variants
                </button>
                <button
                  onClick={() => {
                    handleDeleteAsset(previewAsset._id);
                    setPreviewAsset(null);
                  }}
                  disabled={deleteAssetMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => setPreviewAsset(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-100">
              {previewAsset.type === 'image' ? (
                <img
                  src={`${API_URL}${previewAsset.url}`}
                  alt={previewAsset.filename}
                  className="h-full w-auto max-w-full object-contain"
                  style={{ maxHeight: 'calc(80vh - 120px)' }}
                />
              ) : (
                <div className="text-center text-gray-500">
                  <p>Video preview not available</p>
                  <p className="text-sm mt-2">{previewAsset.filename}</p>
                </div>
              )}
            </div>
            {previewAsset.metadata && (
              <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
                <div className="grid grid-cols-3 gap-4">
                  {previewAsset.metadata.width && previewAsset.metadata.height && (
                    <div>
                      <span className="font-medium">Dimensions: </span>
                      {previewAsset.metadata.width} × {previewAsset.metadata.height}
                    </div>
                  )}
                  {previewAsset.metadata.size && (
                    <div>
                      <span className="font-medium">Size: </span>
                      {(previewAsset.metadata.size / 1024).toFixed(2)} KB
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsetEditor;

