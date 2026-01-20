import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

interface Adset {
  _id: string;
  name: string;
  budget: number;
  status: string;
  targeting: {
    ageMin?: number;
    ageMax?: number;
    locations?: string[];
    interests?: string[];
  };
  campaignId: {
    _id: string;
    name: string;
  };
  optimizationGoal?: string;
  billingEvent?: string;
  promotedObject?: any;
  facebookAdsetId?: string;
}

const Adsets = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: adsets, refetch } = useQuery<Adset[]>({
    queryKey: ['adsets', campaignId],
    queryFn: async () => {
      const response = await api.get(`/adsets?campaignId=${campaignId || ''}`);
      return response.data;
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ adsetId, name }: { adsetId: string; name?: string }) => {
      const response = await api.post(`/adsets/${adsetId}/duplicate`, { name });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      setDuplicatingId(null);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (adsetId: string) => {
      const response = await api.post(`/adsets/${adsetId}/sync`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      setSyncingId(null);
      alert('Adset synced from Facebook successfully!');
    },
    onError: (error: any) => {
      setSyncingId(null);
      alert(error.response?.data?.error || 'Failed to sync adset');
    },
  });

  const handleDuplicate = async (adset: Adset) => {
    const newName = prompt(
      'Enter name for duplicated adset (all settings will be copied):',
      `${adset.name} (Copy)`
    );
    if (!newName) return;

    setDuplicatingId(adset._id);
    try {
      const duplicated = await duplicateMutation.mutateAsync({
        adsetId: adset._id,
        name: newName,
      });
      alert(`Adset duplicated successfully! All settings including targeting, conversion goals, and optimization settings have been copied.`);
      navigate(`/assets/${duplicated._id}`);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to duplicate adset');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleUseAsTemplate = (adset: Adset) => {
    navigate(`/adsets/create?templateId=${adset._id}&campaignId=${campaignId}`);
  };

  const handleSync = async (adset: Adset) => {
    if (!adset.facebookAdsetId) {
      alert('This adset has not been deployed to Facebook yet.');
      return;
    }
    setSyncingId(adset._id);
    await syncMutation.mutateAsync(adset._id);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/facebook/campaigns/${campaignId}/import-adsets`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      alert(`Successfully imported ${data.imported} adset(s) from Facebook with all settings!`);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to import adsets from Facebook');
    },
  });

  const handleImportFromFacebook = () => {
    if (window.confirm('Import all adsets from Facebook for this campaign? This will fetch all settings including conversion goals and optimization settings.')) {
      importMutation.mutate();
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Adsets</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your ad sets for this campaign
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImportFromFacebook}
            disabled={importMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            title="Import adsets created directly in Facebook (with all settings)"
          >
            {importMutation.isPending ? 'Importing...' : 'Import from Facebook'}
          </button>
          <Link
            to={`/adsets/create?campaignId=${campaignId}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create New Adset
          </Link>
        </div>
      </div>

      {adsets && adsets.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budget
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Targeting
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {adsets.map((adset) => (
                <tr key={adset._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {adset.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${adset.budget.toFixed(2)}/day
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        adset.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {adset.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div>
                      {adset.targeting.ageMin && adset.targeting.ageMax
                        ? `Age ${adset.targeting.ageMin}-${adset.targeting.ageMax}`
                        : 'All ages'}
                      {adset.targeting.locations && adset.targeting.locations.length > 0 && (
                        <span className="ml-2">
                          • {adset.targeting.locations.length} location(s)
                        </span>
                      )}
                      {adset.targeting.interests && adset.targeting.interests.length > 0 && (
                        <span className="ml-2">
                          • {adset.targeting.interests.length} interest(s)
                        </span>
                      )}
                    </div>
                    {adset.optimizationGoal && (
                      <div className="text-xs text-blue-600 mt-1">
                        Goal: {adset.optimizationGoal}
                        {adset.billingEvent && ` • Billing: ${adset.billingEvent}`}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleDuplicate(adset)}
                      disabled={duplicatingId === adset._id}
                      className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                      title="Clone with ALL settings (targeting, conversion goals, optimization, billing, etc.)"
                    >
                      {duplicatingId === adset._id ? 'Cloning...' : 'Clone All'}
                    </button>
                    <button
                      onClick={() => handleUseAsTemplate(adset)}
                      className="text-green-600 hover:text-green-900"
                      title="Use as template to create new adset with pre-filled settings"
                    >
                      Template
                    </button>
                    {adset.facebookAdsetId && (
                      <button
                        onClick={() => handleSync(adset)}
                        disabled={syncingId === adset._id}
                        className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                        title="Sync latest settings from Facebook"
                      >
                        {syncingId === adset._id ? 'Syncing...' : 'Sync'}
                      </button>
                    )}
                    <Link
                      to={`/adsets/edit/${adset._id}`}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-600 mb-4">No adsets found for this campaign.</p>
          <Link
            to={`/adsets/create?campaignId=${campaignId}`}
            className="text-blue-600 hover:text-blue-700"
          >
            Create your first adset
          </Link>
        </div>
      )}
    </div>
  );
};

export default Adsets;

