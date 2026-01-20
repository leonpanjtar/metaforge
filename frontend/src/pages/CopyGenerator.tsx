import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

interface AdCopy {
  _id: string;
  type: 'headline' | 'body' | 'description' | 'cta';
  content: string;
  variantIndex: number;
  generatedByAI: boolean;
}

const CopyGenerator = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [tone, setTone] = useState('conversational');
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const scrapedData = location.state?.scrapedData;
  const landingPageUrl = location.state?.landingPageUrl;

  const { data: copies, refetch } = useQuery<AdCopy[]>({
    queryKey: ['ad-copies', adsetId],
    queryFn: async () => {
      const response = await api.get(`/ad-copies/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/ai/generate-copy', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
      setGenerating(false);
    },
    onError: () => {
      setGenerating(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      await api.put(`/ad-copies/${id}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ad-copies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-copies', adsetId] });
    },
  });

  useEffect(() => {
    if (scrapedData && !copies) {
      handleGenerateFromScraped();
    }
  }, [scrapedData]);

  const handleGenerateFromScraped = async () => {
    if (!scrapedData || !adsetId) return;

    setGenerating(true);
    try {
      await generateMutation.mutateAsync({
        adsetId,
        scrapedContent: scrapedData,
        context: {
          targetAudience,
          painPoints,
          tone,
        },
      });
    } catch (error) {
      console.error('Failed to generate:', error);
    }
  };

  const handleGenerateWithPrompt = async () => {
    if (!prompt.trim() || !adsetId) return;

    setGenerating(true);
    try {
      await generateMutation.mutateAsync({
        adsetId,
        prompt,
        context: {
          targetAudience,
          painPoints,
          tone,
        },
      });
      setPrompt('');
    } catch (error) {
      console.error('Failed to generate:', error);
    }
  };

  const handleEdit = (copy: AdCopy) => {
    setEditingId(copy._id);
    setEditContent(copy.content);
  };

  const handleSaveEdit = () => {
    if (editingId && editContent.trim()) {
      updateMutation.mutate({ id: editingId, content: editContent });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this copy?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const groupedCopies = copies
    ? copies.reduce((acc, copy) => {
        if (!acc[copy.type]) {
          acc[copy.type] = [];
        }
        acc[copy.type].push(copy);
        return acc;
      }, {} as Record<string, AdCopy[]>)
    : {};

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Copy Generator</h1>
        <p className="mt-2 text-sm text-gray-600">
          Generate AI-powered ad copy variants for your campaign
        </p>
      </div>

      <div className="space-y-6">
        {scrapedData && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Landing Page Scraped:</strong> {landingPageUrl}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Content extracted. Click "Generate from Landing Page" to create copy variants.
            </p>
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">AI Copy Generation</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Prompt (Optional)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="e.g., Generate 10 direct response headlines emphasizing speed and ROI for outdoor living contractors"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., Outdoor living contractors, age 40-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pain Points
                </label>
                <input
                  type="text"
                  value={painPoints}
                  onChange={(e) => setPainPoints(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., Manual quoting is time-consuming"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="conversational">Conversational</option>
                  <option value="professional">Professional</option>
                  <option value="urgent">Urgent</option>
                  <option value="friendly">Friendly</option>
                  <option value="authoritative">Authoritative</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4">
              {scrapedData && (
                <button
                  onClick={handleGenerateFromScraped}
                  disabled={generating}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate from Landing Page'}
                </button>
              )}
              <button
                onClick={handleGenerateWithPrompt}
                disabled={generating || !prompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate with Custom Prompt'}
              </button>
            </div>
          </div>
        </div>

        {copies && copies.length > 0 && (
          <div className="space-y-6">
            {(['headline', 'body', 'description', 'cta'] as const).map((type) => {
              const typeCopies = groupedCopies[type] || [];
              if (typeCopies.length === 0) return null;

              return (
                <div key={type} className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-lg font-semibold mb-4 capitalize">
                    {type}s ({typeCopies.length})
                  </h2>
                  <div className="space-y-3">
                    {typeCopies.map((copy) => (
                      <div
                        key={copy._id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-gray-300"
                      >
                        {editingId === copy._id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={type === 'body' ? 4 : 2}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveEdit}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-gray-900">{copy.content}</p>
                              {copy.generatedByAI && (
                                <span className="text-xs text-blue-600 mt-1 inline-block">
                                  AI Generated
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleEdit(copy)}
                                className="text-blue-600 hover:text-blue-700 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(copy._id)}
                                className="text-red-600 hover:text-red-700 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-4">
          <button
            onClick={() => navigate(`/assets/${adsetId}`)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Back to Assets
          </button>
          {copies && copies.length > 0 && (
            <button
              onClick={() => navigate(`/creative/${adsetId}`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Next: Generate Creatives
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CopyGenerator;
