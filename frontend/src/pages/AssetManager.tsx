import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import FileUpload from '../components/FileUpload';
import { HiTrash, HiSparkles, HiX } from 'react-icons/hi';

interface Asset {
  _id: string;
  type: 'image' | 'video';
  filename: string;
  url: string;
  metadata?: {
    width?: number;
    height?: number;
    size?: number;
  };
  createdAt?: string;
}

const AssetManager = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [landingPageUrl, setLandingPageUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [showVariantGenerator, setShowVariantGenerator] = useState(false);
  const [variantCount, setVariantCount] = useState(3);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [variantResults, setVariantResults] = useState<any>(null);
  const [assetVariantCounts, setAssetVariantCounts] = useState<Record<string, number>>({});
  const [generatingForAsset, setGeneratingForAsset] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{ placement: string; item: any; index: number } | null>(null);
  const [downloadingPreview, setDownloadingPreview] = useState<string | null>(null);
  const [variantProvider, setVariantProvider] = useState<'meta' | 'openai'>('openai');

  const { data: assets, refetch } = useQuery<Asset[]>({
    queryKey: ['assets', adsetId],
    queryFn: async () => {
      const response = await api.get(`/assets/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  interface Adset {
    _id: string;
    name: string;
    campaignId?: string | { _id: string; name: string };
  }

  const { data: adset } = useQuery<Adset>({
    queryKey: ['adset', adsetId],
    queryFn: async () => {
      const response = await api.get(`/adsets/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await api.delete(`/assets/${assetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

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

  const downloadPreviewMutation = useMutation({
    mutationFn: async (data: { adsetId: string; previewHtml: string }) => {
      const response = await api.post('/ai/download-image-from-preview', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

  const generateOpenAIVariantsMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Don't set Content-Type for FormData - browser will set it with boundary
      const response = await api.post('/ai/generate-image-variations-openai', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', adsetId] });
    },
  });

  const handleGenerateVariantsForAsset = async (assetId: string) => {
    const count = assetVariantCounts[assetId] || 3;
    if (count < 1) {
      alert('Please enter a number greater than 0');
      return;
    }

    setGeneratingForAsset(assetId);
    try {
      await generateVariantsMutation.mutateAsync({
        assetId,
        count,
        aiFeatures: {
          textGeneration: true,
          imageExpansion: true,
          backgroundGeneration: true,
        },
      });
      // Reset count after successful generation
      setAssetVariantCounts(prev => ({ ...prev, [assetId]: 3 }));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to generate variants');
    } finally {
      setGeneratingForAsset(null);
    }
  };

  const scrapeMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await api.post('/ai/scrape-landing-page', { url });
      return response.data;
    },
  });

  const handleScrape = async () => {
    if (!landingPageUrl.trim()) return;

    setScraping(true);
    try {
      const scrapedData = await scrapeMutation.mutateAsync(landingPageUrl);
      // Navigate to copy generator with scraped data
      navigate(`/copy/${adsetId}`, {
        state: { scrapedData, landingPageUrl },
      });
    } catch (error) {
      console.error('Failed to scrape:', error);
    } finally {
      setScraping(false);
    }
  };

  const handleDelete = async (assetId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent opening preview when clicking delete
    }
    // Delete immediately without confirmation
    await deleteMutation.mutateAsync(assetId);
    if (previewAsset && previewAsset._id === assetId) {
      setPreviewAsset(null);
    }
  };

  const handlePreview = (asset: Asset) => {
    setPreviewAsset(asset);
  };

  const filteredAssets = assets?.filter((asset) => {
    if (filterType === 'all') return true;
    return asset.type === filterType;
  }) || [];

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

  const campaignName = adset?.campaignId && typeof adset.campaignId === 'object' 
    ? adset.campaignId.name 
    : 'Campaign';
  const adsetName = adset?.name || 'Adset';
  const campaignId = adset?.campaignId 
    ? (typeof adset.campaignId === 'object' ? adset.campaignId._id : adset.campaignId)
    : null;

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
          <li>
            <button
              onClick={() => navigate(`/adsets/${campaignId || ''}`)}
              className="hover:text-gray-700 transition-colors"
            >
              {adsetName}
            </button>
          </li>
          <li>
            <span className="mx-2">/</span>
          </li>
          <li className="text-gray-900 font-medium">Assets</li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Asset Manager</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload images, videos, and scrape landing pages for <strong>{adsetName}</strong>
          {campaignName && campaignName !== 'Campaign' && (
            <span> in <strong>{campaignName}</strong></span>
          )}
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Landing Page Scraper</h2>
          <div className="flex gap-2">
            <input
              type="url"
              value={landingPageUrl}
              onChange={(e) => setLandingPageUrl(e.target.value)}
              placeholder="Enter landing page URL"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              onClick={handleScrape}
              disabled={scraping || !landingPageUrl.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {scraping ? 'Scraping...' : 'Scrape & Generate Copy'}
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Upload Assets</h2>
          <FileUpload adsetId={adsetId || ''} onUploadComplete={() => refetch()} />
        </div>

        {assets && assets.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                All Assets ({assets.length} total)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 text-sm rounded ${
                    filterType === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType('image')}
                  className={`px-3 py-1 text-sm rounded ${
                    filterType === 'image'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Images
                </button>
                <button
                  onClick={() => setFilterType('video')}
                  className={`px-3 py-1 text-sm rounded ${
                    filterType === 'video'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Videos
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredAssets.map((asset) => (
                <div
                  key={asset._id}
                  className="relative group"
                >
                  <div
                    className="cursor-pointer relative"
                    onClick={() => handlePreview(asset)}
                  >
                    {asset.type === 'image' ? (
                      <img
                        src={`${API_URL}${asset.url}`}
                        alt={asset.filename}
                        className="w-full h-48 object-cover rounded-lg border-2 border-transparent group-hover:border-blue-500 transition-all"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-transparent group-hover:border-blue-500 transition-all">
                        <span className="text-gray-500">Video</span>
                      </div>
                    )}
                    <div className="absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 pointer-events-none">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-sm">
                        Click to preview
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 truncate" title={asset.filename}>
                      {asset.filename}
                    </p>
                    {asset.metadata?.width && asset.metadata?.height && (
                      <p className="text-xs text-gray-500">
                        {asset.metadata.width} × {asset.metadata.height}
                      </p>
                    )}
                    {asset.createdAt && (
                      <p className="text-xs text-gray-400">
                        {new Date(asset.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {asset.type === 'image' && (
                    <div className="mt-2 flex gap-2 items-center z-10 relative" onClick={(e) => e.stopPropagation()}>
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
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateVariantsForAsset(asset._id);
                        }}
                        disabled={generatingForAsset === asset._id}
                        className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
                        title="Generate AI variants"
                        aria-label="Generate AI variants"
                      >
                        {generatingForAsset === asset._id ? '...' : <HiSparkles className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(asset._id, e);
                        }}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center"
                        title="Delete asset"
                        aria-label="Delete asset"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {asset.type === 'video' && (
                    <div className="mt-2 flex justify-end z-10 relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(asset._id, e);
                      }}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center"
                      title="Delete asset"
                      aria-label="Delete asset"
                    >
                      <HiTrash className="w-4 h-4" />
                    </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filteredAssets.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No {filterType === 'all' ? '' : filterType} assets found.
              </div>
            )}
          </div>
        )}

        {assets && assets.length === 0 && (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
            No assets uploaded yet. Upload images or videos to get started.
          </div>
        )}

        <div className="flex justify-end gap-4">
          <button
            onClick={() => navigate('/campaigns')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Back to Campaigns
          </button>
          <button
            onClick={() => navigate(`/creative/${adsetId}`)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Generate AI Variants
          </button>
          {assets && assets.length > 0 && (
            <button
              onClick={() => navigate(`/copy/${adsetId}`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Next: Generate Copy
            </button>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full relative flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewAsset(null)}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 z-10"
              aria-label="Close preview"
              title="Close"
            >
              <HiX className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ maxHeight: 'calc(90vh - 100px)' }}>
              {previewAsset.type === 'image' ? (
                <img
                  src={`${API_URL}${previewAsset.url}`}
                  alt={previewAsset.filename}
                  className="h-full w-auto max-w-full object-contain"
                  style={{ maxHeight: 'calc(90vh - 100px)' }}
                />
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500 mb-4">Video preview not available</p>
                  <p className="text-sm text-gray-400">{previewAsset.filename}</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-gray-900">{previewAsset.filename}</p>
                  {previewAsset.metadata?.width && previewAsset.metadata?.height && (
                    <p className="text-sm text-gray-500">
                      {previewAsset.metadata.width} × {previewAsset.metadata.height}
                      {previewAsset.metadata.size && (
                        <span className="ml-2">
                          • {(previewAsset.metadata.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {previewAsset.type === 'image' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowVariantGenerator(true);
                      }}
                      className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 flex items-center justify-center"
                      aria-label="Generate variants"
                      title="Generate variants"
                    >
                      <HiSparkles className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(previewAsset._id, e);
                    }}
                    className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 flex items-center justify-center"
                    aria-label="Delete asset"
                    title="Delete asset"
                  >
                    <HiTrash className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variant Generator Modal */}
      {showVariantGenerator && previewAsset && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowVariantGenerator(false);
            setVariantResults(null);
          }}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowVariantGenerator(false);
                setVariantResults(null);
              }}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 z-10"
              aria-label="Close"
              title="Close"
            >
              <HiX className="w-5 h-5" />
            </button>
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Generate Image Variants
              </h2>

              {!variantResults ? (
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
                    onClick={async () => {
                      if (!previewAsset || !adsetId) return;
                      
                      if (variantProvider === 'openai') {
                        if (!variantPrompt.trim()) {
                          alert('Please provide variation instructions for OpenAI generation');
                          return;
                        }
                        
                        setGeneratingVariants(true);
                        try {
                          // Fetch the image file
                          const imageResponse = await fetch(`${API_URL}${previewAsset.url}`);
                          const imageBlob = await imageResponse.blob();
                          
                          // Convert Blob to File so multer recognizes it as a file upload
                          const imageFile = new File([imageBlob], previewAsset.filename, {
                            type: imageBlob.type || 'image/jpeg',
                          });
                          
                          // Create FormData
                          const formData = new FormData();
                          formData.append('image', imageFile);
                          formData.append('adsetId', adsetId);
                          formData.append('count', variantCount.toString());
                          formData.append('instructions', variantPrompt);
                          
                          const result = await generateOpenAIVariantsMutation.mutateAsync(formData);
                          setVariantResults(result);
                          alert(`Successfully generated ${result.count} variation(s)!`);
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
                          setGeneratingVariants(false);
                        }
                      } else {
                        // Meta AI flow
                        setGeneratingVariants(true);
                        try {
                          const result = await generateVariantsMutation.mutateAsync({
                            assetId: previewAsset._id,
                            count: variantCount,
                            prompt: variantPrompt || undefined,
                            aiFeatures: {
                              textGeneration: true,
                              imageExpansion: true,
                              backgroundGeneration: false,
                            },
                          });
                          setVariantResults(result);
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
                          setGeneratingVariants(false);
                        }
                      }
                    }}
                    disabled={generatingVariants || (variantProvider === 'openai' && !variantPrompt.trim())}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {generatingVariants 
                      ? `Generating ${variantCount} Variant(s) with ${variantProvider === 'openai' ? 'OpenAI' : 'Meta AI'}...` 
                      : `Generate ${variantCount} Variant(s) with ${variantProvider === 'openai' ? 'OpenAI gpt-image-1' : 'Meta AI'}`}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-md border border-green-200">
                    <p className="text-sm text-green-800">
                      ✓ {variantResults.provider === 'openai' 
                        ? `${variantResults.count} variant(s) generated and saved to your assets!`
                        : 'Variants generated! Review the previews below. Meta will create these variations when you deploy ads with AI features enabled.'}
                    </p>
                  </div>

                  {variantResults.provider === 'openai' && variantResults.assets && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Generated Assets:</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {variantResults.assets.map((asset: any, idx: number) => (
                          <div key={asset._id} className="border rounded-lg p-2">
                            <img
                              src={`${API_URL}${asset.url}`}
                              alt={`Variation ${idx + 1}`}
                              className="w-full h-32 object-cover rounded"
                            />
                            <p className="text-xs text-gray-600 mt-1">{asset.filename}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {variantResults.previews && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900">Preview Results by Placement:</h3>
                      {Object.entries(variantResults.previews).map(([placement, preview]: [string, any]) => (
                        <div key={placement} className="border rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">
                            {placement.replace(/_/g, ' ')}
                          </h4>
                          {preview.error ? (
                            <p className="text-sm text-red-600">{preview.error}</p>
                          ) : preview.data && preview.data.length > 0 ? (
                            <div className="space-y-2">
                              {preview.data.map((item: any, idx: number) => (
                                <div key={idx} className="bg-gray-50 p-3 rounded border">
                                  {item.body && (
                                    <div className="mb-2">
                                      <div 
                                        className="text-xs mb-2"
                                        dangerouslySetInnerHTML={{ __html: item.body }}
                                      />
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          onClick={() => setSelectedPreview({ placement, item, index: idx })}
                                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                        >
                                          View Preview
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (!adsetId || !item.body) return;
                                            const previewKey = `${placement}-${idx}`;
                                            setDownloadingPreview(previewKey);
                                            try {
                                              await downloadPreviewMutation.mutateAsync({
                                                adsetId,
                                                previewHtml: item.body,
                                              });
                                              alert('Images saved to assets successfully!');
                                            } catch (error: any) {
                                              alert(error.response?.data?.error || 'Failed to download images');
                                            } finally {
                                              setDownloadingPreview(null);
                                            }
                                          }}
                                          disabled={downloadingPreview === `${placement}-${idx}`}
                                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                        >
                                          {downloadingPreview === `${placement}-${idx}` ? 'Downloading...' : 'Save to Assets'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {item.transformation_spec && (
                                    <div className="text-xs text-gray-600">
                                      <p>AI Transformations: {Object.keys(item.transformation_spec).join(', ')}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600">
                              Preview generated. Check Facebook Ads Manager for visual preview.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setVariantResults(null);
                        setVariantPrompt('');
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Generate More
                    </button>
                    <button
                      onClick={() => {
                        setShowVariantGenerator(false);
                        setVariantResults(null);
                        setVariantPrompt('');
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Popup Modal */}
      {selectedPreview && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="bg-white rounded-lg max-w-6xl w-full relative flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPreview(null)}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 z-10"
            >
              ×
            </button>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Preview: {selectedPreview.placement.replace(/_/g, ' ')}
              </h3>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div 
                className="w-full"
                style={{ minHeight: '400px' }}
                dangerouslySetInnerHTML={{ __html: selectedPreview.item.body || '' }}
              />
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {selectedPreview.item.transformation_spec && (
                  <p>AI Transformations: {Object.keys(selectedPreview.item.transformation_spec).join(', ')}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!adsetId || !selectedPreview.item.body) return;
                    setDownloadingPreview(`${selectedPreview.placement}-${selectedPreview.index}`);
                    try {
                      await downloadPreviewMutation.mutateAsync({
                        adsetId,
                        previewHtml: selectedPreview.item.body,
                      });
                      alert('Images saved to assets successfully!');
                    } catch (error: any) {
                      alert(error.response?.data?.error || 'Failed to download images');
                    } finally {
                      setDownloadingPreview(null);
                    }
                  }}
                  disabled={downloadingPreview === `${selectedPreview.placement}-${selectedPreview.index}`}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {downloadingPreview === `${selectedPreview.placement}-${selectedPreview.index}` ? 'Downloading...' : 'Save to Assets'}
                </button>
                <button
                  onClick={() => setSelectedPreview(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetManager;
