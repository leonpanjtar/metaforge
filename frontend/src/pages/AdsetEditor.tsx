import { useState, useEffect } from 'react';
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
  headlineId: { content: string };
  bodyId: { content: string };
  descriptionId: { content: string };
  ctaId: { content: string };
  scores: {
    hook: number;
    alignment: number;
    fit: number;
    clarity: number;
    match: number;
  };
  overallScore: number;
  predictedCTR: number;
  deployedToFacebook?: boolean;
  facebookAdId?: string;
}

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
  const [assetVariantCounts, setAssetVariantCounts] = useState<Record<string, number>>({});
  const [generatingForAsset, setGeneratingForAsset] = useState<string | null>(null);
  const [showVariantGenerator, setShowVariantGenerator] = useState(false);
  const [selectedAssetForVariants, setSelectedAssetForVariants] = useState<Asset | null>(null);
  const [variantCount, setVariantCount] = useState(3);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantProvider, setVariantProvider] = useState<'meta' | 'openai'>('openai');

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

  // Generate combinations mutation
  const generateCombinationsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/combinations/generate/${adsetId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
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
  const generateOpenAIVariantsMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await api.post('/ai/generate-image-variations-openai', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

  const handleGenerateVariantsForAsset = async (assetId: string) => {
    const asset = assets?.find(a => a._id === assetId);
    if (!asset) return;
    
    setSelectedAssetForVariants(asset);
    setVariantCount(assetVariantCounts[assetId] || 3);
    setVariantPrompt('');
    setShowVariantGenerator(true);
  };

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
        alert(error.response?.data?.error || 'Failed to generate variants');
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
          baseAssets: assets?.map(a => a._id) || [],
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
    await generateCombinationsMutation.mutateAsync();
    setActiveTab('combinations');
  };

  const handleDeploy = async (combinationIds: string[], status: 'PAUSED' | 'ACTIVE') => {
    await deployMutation.mutateAsync({
      adsetId,
      combinationIds,
      status,
    });
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
              { id: 'generated-content', label: 'Generated Content', icon: '✍️' },
              { id: 'generated-assets', label: 'Generated Assets', icon: '🖼️' },
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Assets
                </label>
                <div className="border border-gray-300 rounded-lg p-4">
                  <FileUpload adsetId={adsetId || ''} onUploadComplete={() => refetchAssets()} />
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {assets?.map((asset) => (
                    <div key={asset._id} className="relative">
                      {asset.type === 'image' ? (
                        <img
                          src={`${API_URL}${asset.url}`}
                          alt={asset.filename}
                          className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                          <span className="text-gray-500 text-sm">Video</span>
                        </div>
                      )}
                      <p className="mt-1 text-xs text-gray-600 truncate">{asset.filename}</p>
                    </div>
                  ))}
                </div>
                {(!assets || assets.length === 0) && (
                  <p className="text-sm text-gray-500 mt-2">No assets uploaded yet</p>
                )}
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
                    if (typeCopies.length === 0) return null;

                    return (
                      <div key={type} className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 capitalize">
                          {type}s ({typeCopies.length})
                        </h3>
                        <div className="space-y-2">
                          {typeCopies.map((copy) => (
                            <div
                              key={copy._id}
                              className="p-3 bg-gray-50 rounded border border-gray-200 flex justify-between items-start group"
                            >
                              <p className="text-sm text-gray-700 flex-1">{copy.content}</p>
                              <div className="flex items-center gap-2 ml-4">
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
                          ))}
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

          {/* Generated Assets Tab */}
          {activeTab === 'generated-assets' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Assets</h2>
                <button
                  onClick={() => navigate(`/creative/${adsetId}`)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Generate AI Variants
                </button>
              </div>

              {assets && assets.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {assets.map((asset) => (
                    <div key={asset._id} className="relative group">
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
                      <p className="mt-1 text-xs text-gray-600 truncate" title={asset.filename}>
                        {asset.filename}
                      </p>
                      {asset.type === 'image' && (
                        <div className="mt-2 flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={assetVariantCounts[asset._id] || 3}
                            onChange={(e) => {
                              const count = parseInt(e.target.value) || 3;
                              setAssetVariantCounts(prev => ({ ...prev, [asset._id]: count }));
                            }}
                            className="w-16 px-2 py-1 text-xs rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                            placeholder="3"
                          />
                          <button
                            onClick={() => handleGenerateVariantsForAsset(asset._id)}
                            disabled={generatingForAsset === asset._id}
                            className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            title="Generate AI variants"
                          >
                            {generatingForAsset === asset._id ? 'Generating...' : 'Generate'}
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset._id)}
                            disabled={deleteAssetMutation.isPending}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center disabled:opacity-50"
                            title="Delete asset"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {asset.type === 'video' && (
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={() => handleDeleteAsset(asset._id)}
                            disabled={deleteAssetMutation.isPending}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center disabled:opacity-50"
                            title="Delete asset"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No assets uploaded yet. Upload images or videos to get started.</p>
                </div>
              )}
            </div>
          )}

          {/* Combinations & Deploy Tab */}
          {activeTab === 'combinations' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Ad Combinations</h2>
                <button
                  onClick={handleGenerateCombinations}
                  disabled={generateCombinationsMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {generateCombinationsMutation.isPending ? 'Generating...' : 'Generate Combinations'}
                </button>
              </div>

              {combinations && combinations.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">
                      {combinations.length} combination(s) generated
                    </p>
                    <div className="flex gap-2">
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
                          const selectedIds = Array.from(
                            document.querySelectorAll<HTMLInputElement>(
                              'input[type="checkbox"]:checked'
                            )
                          ).map((cb) => cb.value);
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
                        {deployMutation.isPending ? 'Deploying...' : 'Deploy Selected'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {combinations.map((combination) => (
                      <div
                        key={combination._id}
                        className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              value={combination._id}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm font-medium">Select</span>
                          </label>
                          <div className="text-right">
                            <div className="text-lg font-bold text-blue-600">
                              {Math.round(combination.overallScore)}
                            </div>
                            <div className="text-xs text-gray-500">Score</div>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium">Headline:</span>{' '}
                            <span className="text-gray-700">{combination.headlineId.content}</span>
                          </div>
                          <div>
                            <span className="font-medium">Body:</span>{' '}
                            <span className="text-gray-700 line-clamp-2">
                              {combination.bodyId.content}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">CTA:</span>{' '}
                            <span className="text-gray-700">{combination.ctaId.content}</span>
                          </div>
                        </div>

                        {combination.deployedToFacebook && (
                          <div className="mt-2 text-xs text-green-600">
                            ✓ Deployed (ID: {combination.facebookAdId})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>
                    No combinations generated yet. Click "Generate Combinations" to create all
                    possible ad combinations.
                  </p>
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
                        <strong>OpenAI DALL-E 3</strong> (Recommended)
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
                      <strong>OpenAI DALL-E 3 Features:</strong>
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
                    : `Generate ${variantCount} Variant(s) with ${variantProvider === 'openai' ? 'OpenAI DALL-E 3' : 'Meta AI'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsetEditor;

