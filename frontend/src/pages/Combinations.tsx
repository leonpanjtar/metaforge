import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

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
}

const Combinations = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const { data: combinations, refetch } = useQuery<Combination[]>({
    queryKey: ['combinations', adsetId],
    queryFn: async () => {
      const response = await api.get(`/combinations/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/combinations/generate/${adsetId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinations', adsetId] });
      setGenerating(false);
    },
  });

  const handleGenerate = async () => {
    setGenerating(true);
    await generateMutation.mutateAsync();
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedCombinations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCombinations(newSelected);
  };

  const selectTopN = (n: number) => {
    if (!combinations) return;
    const topN = combinations.slice(0, n).map((c) => c._id);
    setSelectedCombinations(new Set(topN));
  };

  const selectAboveScore = (score: number) => {
    if (!combinations) return;
    const aboveScore = combinations
      .filter((c) => c.overallScore >= score)
      .map((c) => c._id);
    setSelectedCombinations(new Set(aboveScore));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Ad Combinations</h1>
        <p className="mt-2 text-sm text-gray-600">
          Generate and score all possible ad combinations
        </p>
      </div>

      {!combinations || combinations.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-600 mb-4">No combinations generated yet.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Combinations'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">
                Total Combinations: <span className="font-semibold">{combinations.length}</span>
              </p>
              <p className="text-sm text-gray-600">
                Selected: <span className="font-semibold">{selectedCombinations.size}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => selectTopN(10)}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Select Top 10
              </button>
              <button
                onClick={() => selectAboveScore(70)}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Select Above 70
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {combinations.map((combination) => {
              const asset = combination.assetIds[0];
              const isSelected = selectedCombinations.has(combination._id);

              return (
                <div
                  key={combination._id}
                  className={`bg-white rounded-lg shadow border-2 ${
                    isSelected ? 'border-blue-500' : 'border-transparent'
                  } hover:shadow-lg transition-shadow`}
                >
                  <div className="p-4">
                    {asset && asset.type === 'image' && (
                      <img
                        src={`${API_URL}${asset.url}`}
                        alt="Ad creative"
                        className="w-full h-32 object-cover rounded mb-3"
                      />
                    )}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm">
                        {combination.headlineId?.content}
                      </h3>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {combination.bodyId?.content}
                      </p>
                      <p className="text-xs text-gray-500">
                        {combination.descriptionId?.content}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          CTA: {combination.ctaId?.content}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getScoreColor(
                            combination.overallScore
                          )}`}
                        >
                          {combination.overallScore}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Predicted CTR: {combination.predictedCTR}%
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-xs">
                        <div>H:{combination.scores.hook}</div>
                        <div>A:{combination.scores.alignment}</div>
                        <div>F:{combination.scores.fit}</div>
                        <div>C:{combination.scores.clarity}</div>
                        <div>M:{combination.scores.match}</div>
                      </div>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(combination._id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Select</span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-4">
            <button
              onClick={() => navigate(`/creative/${adsetId}`)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Back to Creatives
            </button>
            {selectedCombinations.size > 0 && (
              <button
                onClick={() => navigate(`/deployment/${adsetId}`, {
                  state: { selectedIds: Array.from(selectedCombinations) },
                })}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Deploy Selected ({selectedCombinations.size})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Combinations;
