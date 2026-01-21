import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';

const CreativeGenerator = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [generating, setGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [variationPrompt, setVariationPrompt] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{
    total: number;
    completed: number;
    current: number;
    status: string;
    results: Array<{ index: number; asset?: any; error?: string }>;
  } | null>(null);
  const [savedAsset, setSavedAsset] = useState<any>(null);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);
  const [aiPreviews, setAiPreviews] = useState<any>(null);

  const generateSingleVariationMutation = useMutation({
    mutationFn: async ({ formData, index }: { formData: FormData; index: number }) => {
      // Don't set Content-Type for FormData - axios will set it automatically with boundary
      const response = await api.post('/ai/generate-single-variation', formData);
      return { ...response.data, index };
    },
  });

  const generatePreviewsMutation = useMutation({
    mutationFn: async (data: { adsetId: string; imageHash: string; pageId?: string }) => {
      const response = await api.post('/ai/generate-meta-ai-previews', data);
      return response.data;
    },
  });


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleGenerateVariations = async () => {
    if (!selectedFile || !adsetId) return;

    setGenerating(true);
    setGenerationProgress({
      total: 1, // Only one upload for Meta AI
      completed: 0,
      current: 0,
      status: 'Starting...',
      results: [],
    });

    const results: Array<{ index: number; asset?: any; error?: string }> = [];

    try {
      // For Meta AI: Upload the image once
      // Meta AI generates variations automatically when creating ads, not during upload
      setGenerationProgress((prev) => ({
        ...prev!,
        current: 1,
        status: 'Saving image for Meta AI...',
      }));

      try {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('adsetId', adsetId);
        formData.append('variationIndex', '0');
        formData.append('isFirstUpload', 'true'); // Only save on first upload
        if (variationPrompt) {
          formData.append('prompt', variationPrompt);
        }
        formData.append('useMetaAI', 'true'); // Always use Meta AI

        const result = await generateSingleVariationMutation.mutateAsync({
          formData,
          index: 0,
        });

        results.push({
          index: 0,
          asset: result.asset,
        });

        setSavedAsset(result.asset);
        setGenerationProgress((prev) => ({
          ...prev!,
          completed: 1,
          status: 'Image saved! You can now generate previews to see Meta AI variations.',
          results: [...results],
        }));
      } catch (error: any) {
        const errorMessage = error.response?.data?.error || 'Failed to save image';
        results.push({
          index: 0,
          error: errorMessage,
        });

        setGenerationProgress((prev) => ({
          ...prev!,
          completed: 1,
          results: [...results],
        }));
      }

      const successCount = results.filter((r) => r.asset).length;
      const errorCount = results.filter((r) => r.error).length;

      setGenerationProgress((prev) => ({
        ...prev!,
        status: successCount > 0 
          ? 'Image saved! Meta AI will generate variations when creating ads.'
          : `Failed: ${errorCount} error(s)`,
      }));

      if (successCount > 0) {
        // Don't clear the form yet - user might want to generate previews
        // setSelectedFile(null);
        // setPreviewUrl(null);
      } else {
        alert(`Failed to save image. Please try again.`);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to generate variations');
    } finally {
      setGenerating(false);
      // Clear progress after 3 seconds
      setTimeout(() => {
        setGenerationProgress(null);
      }, 3000);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Creative Generator</h1>
      
      <div className="max-w-2xl">
        {/* Upload & Generate Variations with Meta AI */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Upload Image & Generate AI Variants with Meta AI</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Your Image
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {previewUrl && (
                <div className="mt-4">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-full h-48 object-contain rounded-md border border-gray-300"
                  />
                </div>
              )}
            </div>

            <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Meta AI generates variations automatically when you create ads. 
                Upload your image once, and Meta will create multiple variations (backgrounds, text, etc.) 
                during ad creation. You don't need to specify a variation count here.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Variation Prompt (Optional)
              </label>
              <textarea
                value={variationPrompt}
                onChange={(e) => setVariationPrompt(e.target.value)}
                rows={2}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Describe how you want the variations to differ (e.g., 'different backgrounds', 'various color schemes')"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-blue-800">Using Meta AI</h3>
                  <div className="mt-2 text-sm text-blue-700 space-y-1">
                    <p>✓ Meta AI will generate variations when creating ads</p>
                    <p>✓ Supports: Text Generation, Image Expansion, Background Generation</p>
                    <p>
                      <a
                        href="https://developers.facebook.com/docs/marketing-api/creative/generative-ai-features/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        Learn more about Meta AI features
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateVariations}
              disabled={generating || !selectedFile}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {generating ? 'Saving Image...' : 'Save Image for Meta AI'}
            </button>

            {/* Progress Indicator */}
            {generationProgress && (
              <div className="mt-4 p-4 bg-blue-50 rounded-md border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">
                    {generationProgress.status}
                  </span>
                  <span className="text-sm text-blue-700">
                    {generationProgress.completed} / {generationProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2.5 mb-3">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${(generationProgress.completed / generationProgress.total) * 100}%`,
                    }}
                  ></div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {generationProgress.results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`text-xs flex items-center ${
                        result.asset
                          ? 'text-green-700'
                          : result.error
                            ? 'text-red-700'
                            : 'text-gray-600'
                      }`}
                    >
                      <span className="mr-2">
                        {result.asset ? '✓' : result.error ? '✗' : '○'}
                      </span>
                      <span>
                        Variation {result.index + 1}:{' '}
                        {result.asset
                          ? 'Generated successfully'
                          : result.error
                            ? result.error
                            : 'Pending...'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Previews Section */}
            {savedAsset && savedAsset.metadata?.facebookImageHash && (
              <div className="mt-6 p-4 bg-green-50 rounded-md border border-green-200">
                <h3 className="text-sm font-semibold text-green-900 mb-2">
                  Generate Meta AI Previews
                </h3>
                <p className="text-sm text-green-800 mb-4">
                  Preview Meta AI variations before creating ads. You'll see different backgrounds, 
                  text variations, and image expansions that Meta will generate. Review and cherry-pick 
                  the best variations before deploying.
                </p>
                <button
                  onClick={async () => {
                    if (!adsetId) return;
                    setGeneratingPreviews(true);
                    try {
                      const result = await generatePreviewsMutation.mutateAsync({
                        adsetId,
                        imageHash: savedAsset.metadata.facebookImageHash,
                        // pageId will be auto-detected from connected Facebook account
                      });
                      setAiPreviews(result.previews);
                    } catch (error: any) {
                      alert(error.response?.data?.error || 'Failed to generate previews. Make sure you have a Facebook Page connected.');
                    } finally {
                      setGeneratingPreviews(false);
                    }
                  }}
                  disabled={generatingPreviews}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {generatingPreviews ? 'Generating Previews...' : 'Generate Meta AI Previews'}
                </button>
                {aiPreviews && (
                  <div className="mt-4 space-y-4">
                    <h4 className="text-sm font-medium text-green-900">Preview Results:</h4>
                    {Object.entries(aiPreviews).map(([placement, preview]: [string, any]) => (
                      <div key={placement} className="p-3 bg-white rounded border">
                        <div className="flex justify-between items-center mb-2">
                          <strong className="text-sm text-gray-900">{placement.replace(/_/g, ' ')}</strong>
                          {preview.error ? (
                            <span className="text-xs text-red-600">Error</span>
                          ) : (
                            <span className="text-xs text-green-600">Success</span>
                          )}
                        </div>
                        {preview.error ? (
                          <p className="text-xs text-red-600">{preview.error}</p>
                        ) : preview.data && preview.data.length > 0 ? (
                          <div className="space-y-2">
                            {preview.data.map((item: any, idx: number) => (
                              <div key={idx} className="border rounded p-2">
                                {item.body && (
                                  <div 
                                    className="text-xs"
                                    dangerouslySetInnerHTML={{ __html: item.body }}
                                  />
                                )}
                                {item.transformation_spec && (
                                  <div className="mt-2 text-xs text-gray-600">
                                    <p>AI Transformations available</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600">Preview generated - check Facebook Ads Manager for visual preview</p>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-gray-600 italic">
                      Note: These previews show what Meta AI will generate. You can review them in Facebook Ads Manager 
                      before creating ads. Meta will generate variations automatically when you create ads with AI features enabled.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-between items-center">
        <button
          onClick={() => navigate(`/assets/${adsetId}`)}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          View All Assets
        </button>
        <div className="flex gap-4">
          <button
            onClick={() => navigate(`/copy/${adsetId}`)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Back to Copy
          </button>
          <button
            onClick={() => navigate(`/combinations/${adsetId}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Next: Generate Combinations
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreativeGenerator;
