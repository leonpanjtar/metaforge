import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

type Tab = 'assets' | 'bodyCopy' | 'headlines' | 'descriptions' | 'angle' | 'keywords' | 'importantThings' | 'imageAnalysis' | 'imageGeneration';

interface Asset {
  _id: string;
  type: 'image' | 'video';
  filename: string;
  url: string;
  metadata?: {
    width?: number;
    height?: number;
    size?: number;
    facebookVideoId?: string;
    isVideoThumbnail?: boolean;
    videoAssetId?: string;
  };
  createdAt?: string;
}

interface PromptData {
  system: string;
  user?: string;
  description: string;
}

interface Prompts {
  base: PromptData;
  creative: PromptData;
  bodyCopy: PromptData;
  headlines: PromptData;
  descriptions: PromptData;
  angle: PromptData;
  keywords: PromptData;
  importantThings: PromptData;
  imageAnalysis: PromptData;
  imageGeneration: PromptData;
}

const PromptTester = () => {
  const { currentAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('assets');
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [editedPrompts, setEditedPrompts] = useState<Partial<Record<Tab, { system: string; user?: string }>>>({});
  const [testResults, setTestResults] = useState<Partial<Record<Tab, string>>>({});
  const [testing, setTesting] = useState<Partial<Record<Tab, boolean>>>({});
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [testInputs, setTestInputs] = useState<Partial<Record<Tab, Record<string, string>>>>({});

  // Check if user is admin or owner
  const isAdmin = currentAccount && (currentAccount.role === 'owner' || currentAccount.role === 'admin');

  // Fetch all assets across all adsets
  const { data: allAssets } = useQuery<Asset[]>({
    queryKey: ['all-assets-for-tester'],
    queryFn: async () => {
      // Get all adsets first, then get assets from each
      const adsetsResponse = await api.get('/adsets');
      const adsets = adsetsResponse.data || [];
      
      const allAssetsList: Asset[] = [];
      for (const adset of adsets) {
        try {
          const assetsResponse = await api.get(`/assets/${adset._id}`);
          if (assetsResponse.data && Array.isArray(assetsResponse.data)) {
            allAssetsList.push(...assetsResponse.data);
          }
        } catch (error) {
          // Skip adsets that fail
        }
      }
      return allAssetsList;
    },
    enabled: !!isAdmin && activeTab === 'assets',
  });

  // Fetch prompts
  const { data: promptsData } = useQuery<Prompts>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const response = await api.get('/ai/prompt-tester/prompts');
      return response.data.prompts;
    },
    enabled: !!isAdmin,
  });

  useEffect(() => {
    if (promptsData && typeof promptsData === 'object' && 'base' in promptsData) {
      setPrompts(promptsData as Prompts);
    }
  }, [promptsData]);

  // Test prompt mutation
  const testPromptMutation = useMutation({
    mutationFn: async ({ contentType, systemPrompt, userPrompt, testInput }: {
      contentType: string;
      systemPrompt: string;
      userPrompt: string;
      testInput?: Record<string, string>;
    }) => {
      const response = await api.post('/ai/prompt-tester/test', {
        contentType,
        systemPrompt,
        userPrompt,
        testInput,
      });
      return response.data;
    },
  });

  // Test image prompt mutation
  const testImagePromptMutation = useMutation({
    mutationFn: async ({ contentType, systemPrompt, userPrompt, imageFile, userInstructions }: {
      contentType: string;
      systemPrompt: string;
      userPrompt: string;
      imageFile: File;
      userInstructions?: string;
    }) => {
      const formData = new FormData();
      formData.append('contentType', contentType);
      formData.append('systemPrompt', systemPrompt);
      formData.append('userPrompt', userPrompt);
      formData.append('image', imageFile);
      if (userInstructions) {
        formData.append('userInstructions', userInstructions);
      }
      
      const response = await api.post('/ai/prompt-tester/test-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
  });

  const getCurrentPrompt = (tab: Tab): { system: string; user?: string } => {
    if (!prompts) return { system: '', user: '' };
    
    const edited = editedPrompts[tab];
    if (edited) {
      return edited;
    }
    
    switch (tab) {
      case 'bodyCopy':
        return { system: prompts.bodyCopy.system, user: prompts.bodyCopy.user };
      case 'headlines':
        return { system: prompts.headlines.system, user: prompts.headlines.user };
      case 'descriptions':
        return { system: prompts.descriptions.system, user: prompts.descriptions.user };
      case 'angle':
        return { system: prompts.angle.system, user: prompts.angle.user };
      case 'keywords':
        return { system: prompts.keywords.system, user: prompts.keywords.user };
      case 'importantThings':
        return { system: prompts.importantThings.system, user: prompts.importantThings.user };
      case 'imageAnalysis':
        return { system: prompts.imageAnalysis.system, user: prompts.imageAnalysis.user };
      case 'imageGeneration':
        return { system: prompts.imageGeneration.system, user: prompts.imageGeneration.user };
      default:
        return { system: prompts.base.system, user: '' };
    }
  };

  const handlePromptChange = (tab: Tab, field: 'system' | 'user', value: string) => {
    setEditedPrompts(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [field]: value,
      },
    }));
  };

  const handleTest = async (tab: Tab) => {
    if (!prompts) return;
    
    setTesting(prev => ({ ...prev, [tab]: true }));
    setTestResults(prev => ({ ...prev, [tab]: undefined }));
    
    try {
      const currentPrompt = getCurrentPrompt(tab);
      
      if (tab === 'assets' || tab === 'imageAnalysis' || tab === 'imageGeneration') {
        if (!selectedAsset) {
          alert('Please select an asset first');
          setTesting(prev => ({ ...prev, [tab]: false }));
          return;
        }
        
        // For image testing, we need to upload the image
        const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
        const assetResponse = await fetch(`${API_URL}${selectedAsset.url}`);
        const assetBlob = await assetResponse.blob();
        const assetFile = new File([assetBlob], selectedAsset.filename, {
          type: selectedAsset.type === 'video' ? 'video/mp4' : 'image/jpeg',
        });
        
        const result = await testImagePromptMutation.mutateAsync({
          contentType: tab === 'assets' ? 'imageAnalysis' : tab,
          systemPrompt: currentPrompt.system,
          userPrompt: currentPrompt.user || '',
          imageFile: assetFile,
          userInstructions: testInputs[tab]?.userInstructions,
        });
        
        setTestResults(prev => ({
          ...prev,
          [tab]: typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2),
        }));
      } else {
        // For text-based prompts, format test inputs properly
        const testInput: Record<string, string> = {};
        const inputData = testInputs[tab] || {};
        
        // Format inputs based on tab type
        if (tab === 'headlines' && inputData.bodyCopies) {
          // Format body copies for the prompt
          const bodyCopiesArray = inputData.bodyCopies.split('\n').filter(Boolean);
          testInput.bodyCopies = bodyCopiesArray.map((copy, idx) => `Body Copy ${idx + 1}:\n${copy}`).join('\n\n');
          testInput.count = inputData.count || '10';
        } else if (tab === 'descriptions') {
          testInput.headline = inputData.headline || '';
          testInput.bodyCopy = inputData.bodyCopy || '';
          testInput.count = inputData.count || '5';
        } else if (tab === 'angle' || tab === 'keywords' || tab === 'importantThings') {
          testInput.contentSummary = inputData.contentSummary || '';
        } else if (tab === 'bodyCopy') {
          // For body copy, the user prompt itself is the test input
          testInput.prompt = inputData.prompt || '';
        }
        
        const result = await testPromptMutation.mutateAsync({
          contentType: tab,
          systemPrompt: currentPrompt.system,
          userPrompt: currentPrompt.user || '',
          testInput,
        });
        
        setTestResults(prev => ({
          ...prev,
          [tab]: result.result,
        }));
      }
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [tab]: `Error: ${error.response?.data?.error || error.message}`,
      }));
    } finally {
      setTesting(prev => ({ ...prev, [tab]: false }));
    }
  };

  const handleResetPrompt = (tab: Tab) => {
    setEditedPrompts(prev => {
      const newPrompts = { ...prev };
      delete newPrompts[tab];
      return newPrompts;
    });
    if (prompts) {
      const original = getCurrentPrompt(tab);
      setEditedPrompts(prev => ({
        ...prev,
        [tab]: original,
      }));
    }
  };

  if (!isAdmin) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You don't have permission to access this page. Only admins and owners can test prompts.
          </p>
        </div>
      </div>
    );
  }

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Prompt Tester</h1>
        <p className="mt-2 text-sm text-gray-600">
          Test and fine-tune AI prompts for content generation. Modify prompts to see how they affect output quality.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {(['assets', 'bodyCopy', 'headlines', 'descriptions', 'angle', 'keywords', 'importantThings', 'imageAnalysis', 'imageGeneration'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'bodyCopy' ? 'Body Copy' :
               tab === 'importantThings' ? 'Important Things' :
               tab === 'imageAnalysis' ? 'Image Analysis' :
               tab === 'imageGeneration' ? 'Image Generation' :
               tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {prompts && (
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'assets' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4">Assets</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Select an image or video asset to test image analysis and generation prompts.
                </p>
                
                {/* Asset Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Asset
                  </label>
                  {allAssets && Array.isArray(allAssets) && allAssets.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {allAssets
                        .filter((asset: Asset) => asset.type === 'image' || (asset.type === 'video' && activeTab === 'assets'))
                        .map((asset: Asset) => (
                          <div
                            key={asset._id}
                            onClick={() => setSelectedAsset(asset)}
                            className={`cursor-pointer rounded-lg border-2 p-2 ${
                              selectedAsset?._id === asset._id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {asset.type === 'image' ? (
                              <img
                                src={`${API_URL}${asset.url}`}
                                alt={asset.filename}
                                className="w-full h-24 object-cover rounded"
                              />
                            ) : (
                              <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center">
                                <span className="text-xs text-gray-500">Video</span>
                              </div>
                            )}
                            <p className="mt-1 text-xs text-gray-600 truncate" title={asset.filename}>
                              {asset.filename}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No assets found. Upload assets in an adset first.</p>
                  )}
                </div>

                {selectedAsset && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Image Analysis System Prompt
                      </label>
                      <textarea
                        value={editedPrompts.imageAnalysis?.system || prompts.imageAnalysis.system}
                        onChange={(e) => handlePromptChange('imageAnalysis', 'system', e.target.value)}
                        rows={8}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Image Analysis User Prompt
                      </label>
                      <textarea
                        value={editedPrompts.imageAnalysis?.user || prompts.imageAnalysis.user}
                        onChange={(e) => handlePromptChange('imageAnalysis', 'user', e.target.value)}
                        rows={15}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Optional Instructions (for testing variations)
                      </label>
                      <input
                        type="text"
                        value={testInputs.imageAnalysis?.userInstructions || ''}
                        onChange={(e) => setTestInputs(prev => ({
                          ...prev,
                          imageAnalysis: { ...prev.imageAnalysis, userInstructions: e.target.value },
                        }))}
                        placeholder="e.g., Change background to blue, add more contrast"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleTest('imageAnalysis')}
                        disabled={testing.imageAnalysis}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {testing.imageAnalysis ? 'Testing...' : 'Test Image Analysis'}
                      </button>
                      <button
                        onClick={() => handleResetPrompt('imageAnalysis')}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                      >
                        Reset to Default
                      </button>
                    </div>

                    {testResults.imageAnalysis && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold mb-2">Test Result:</h3>
                        <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-96">
                          {testResults.imageAnalysis}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {activeTab === 'bodyCopy' ? 'Body Copy' :
                   activeTab === 'importantThings' ? 'Important Things' :
                   activeTab === 'imageAnalysis' ? 'Image Analysis' :
                   activeTab === 'imageGeneration' ? 'Image Generation' :
                   activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Prompt
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  {prompts[activeTab]?.description || 'Modify the prompt below to test different variations.'}
                </p>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  System Prompt
                </label>
                <textarea
                  value={getCurrentPrompt(activeTab).system}
                  onChange={(e) => handlePromptChange(activeTab, 'system', e.target.value)}
                  rows={8}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              {/* User Prompt */}
              {getCurrentPrompt(activeTab).user && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Prompt (with placeholders like {'{bodyCopies}'}, {'{count}'}, {'{headline}'}, etc.)
                  </label>
                  <textarea
                    value={getCurrentPrompt(activeTab).user || ''}
                    onChange={(e) => handlePromptChange(activeTab, 'user', e.target.value)}
                    rows={12}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              )}

              {/* Test Inputs */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Test Inputs (fill placeholders):</h3>
                
                {activeTab === 'headlines' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Body Copies (one per line)
                    </label>
                    <textarea
                      value={testInputs.headlines?.bodyCopies || ''}
                      onChange={(e) => setTestInputs(prev => ({
                        ...prev,
                        headlines: { ...prev.headlines, bodyCopies: e.target.value },
                      }))}
                      rows={4}
                      placeholder="Enter body copy examples, one per line"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      value={testInputs.headlines?.count || '10'}
                      onChange={(e) => setTestInputs(prev => ({
                        ...prev,
                        headlines: { ...prev.headlines, count: e.target.value },
                      }))}
                      placeholder="Count"
                      className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}

                {activeTab === 'descriptions' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Headline
                      </label>
                      <input
                        type="text"
                        value={testInputs.descriptions?.headline || ''}
                        onChange={(e) => setTestInputs(prev => ({
                          ...prev,
                          descriptions: { ...prev.descriptions, headline: e.target.value },
                        }))}
                        placeholder="Enter headline"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Body Copy
                      </label>
                      <textarea
                        value={testInputs.descriptions?.bodyCopy || ''}
                        onChange={(e) => setTestInputs(prev => ({
                          ...prev,
                          descriptions: { ...prev.descriptions, bodyCopy: e.target.value },
                        }))}
                        rows={4}
                        placeholder="Enter body copy"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Count
                      </label>
                      <input
                        type="number"
                        value={testInputs.descriptions?.count || '5'}
                        onChange={(e) => setTestInputs(prev => ({
                          ...prev,
                          descriptions: { ...prev.descriptions, count: e.target.value },
                        }))}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                {activeTab === 'angle' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Content Summary (from landing page)
                    </label>
                    <textarea
                      value={testInputs.angle?.contentSummary || ''}
                      onChange={(e) => setTestInputs(prev => ({
                        ...prev,
                        angle: { ...prev.angle, contentSummary: e.target.value },
                      }))}
                      rows={6}
                      placeholder="Enter landing page content summary"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}

                {(activeTab === 'keywords' || activeTab === 'importantThings') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Content Summary (from landing page)
                    </label>
                    <textarea
                      value={testInputs[activeTab]?.contentSummary || ''}
                      onChange={(e) => setTestInputs(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab], contentSummary: e.target.value },
                      }))}
                      rows={6}
                      placeholder="Enter landing page content summary"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}

                {activeTab === 'bodyCopy' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Test Prompt
                    </label>
                    <textarea
                      value={testInputs.bodyCopy?.prompt || ''}
                      onChange={(e) => setTestInputs(prev => ({
                        ...prev,
                        bodyCopy: { ...prev.bodyCopy, prompt: e.target.value },
                      }))}
                      rows={4}
                      placeholder="Enter a test prompt for body copy generation"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleTest(activeTab)}
                  disabled={testing[activeTab]}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {testing[activeTab] ? 'Testing...' : 'Test Prompt'}
                </button>
                <button
                  onClick={() => handleResetPrompt(activeTab)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Reset to Default
                </button>
              </div>

              {/* Test Results */}
              {testResults[activeTab] && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Test Result:</h3>
                  <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-96">
                    {testResults[activeTab]}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!prompts && (
        <div className="text-center py-8 text-gray-500">
          <p>Loading prompts...</p>
        </div>
      )}
    </div>
  );
};

export default PromptTester;

