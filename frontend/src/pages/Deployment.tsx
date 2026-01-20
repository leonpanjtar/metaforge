import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';

const Deployment = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED');
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const selectedIds = location.state?.selectedIds || [];

  const deployMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/deployment/deploy', data);
      return response.data;
    },
  });

  useEffect(() => {
    if (selectedIds.length === 0) {
      navigate(`/combinations/${adsetId}`);
    }
  }, [selectedIds, adsetId, navigate]);

  const handleDeploy = async () => {
    if (!adsetId || selectedIds.length === 0) return;

    setDeploying(true);
    setResult(null);

    try {
      const result = await deployMutation.mutateAsync({
        adsetId,
        combinationIds: selectedIds,
        status,
      });
      setResult(result);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.response?.data?.error || 'Deployment failed',
      });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Deploy Ads to Facebook</h1>

      <div className="bg-white p-6 rounded-lg shadow space-y-6">
        <div>
          <p className="text-gray-600 mb-4">
            Ready to deploy <strong>{selectedIds.length}</strong> ad combinations to Facebook
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Initial Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'PAUSED' | 'ACTIVE')}
              className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="PAUSED">Paused</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {result.success ? (
                <div>
                  <p className="text-green-800 font-semibold mb-2">
                    Deployment Successful!
                  </p>
                  <p className="text-sm text-green-700">
                    Deployed: {result.deployed} ads
                    {result.failed > 0 && `, Failed: ${result.failed}`}
                  </p>
                </div>
              ) : (
                <p className="text-red-800">{result.error}</p>
              )}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {deploying ? 'Deploying...' : 'Deploy to Facebook'}
            </button>
            <button
              onClick={() => navigate(`/combinations/${adsetId}`)}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Deployment;
