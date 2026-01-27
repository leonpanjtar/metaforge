import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { HiTrash, HiDuplicate, HiTemplate, HiRefresh, HiPencil, HiX } from 'react-icons/hi';

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
  createdByApp?: boolean;
}

interface Campaign {
  _id: string;
  name: string;
}

interface FacebookAccount {
  _id: string;
  accountId: string;
  accountName: string;
}

const Adsets = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedAdsetForDuplicate, setSelectedAdsetForDuplicate] = useState<Adset | null>(null);
  const [duplicateFormData, setDuplicateFormData] = useState({
    campaignId: '',
    adsetName: '',
    sourceAdsetId: '',
  });

  const { data: adsets } = useQuery<Adset[]>({
    queryKey: ['adsets', campaignId],
    queryFn: async () => {
      const response = await api.get(`/adsets?campaignId=${campaignId || ''}`);
      return response.data;
    },
  });

  // Fetch Facebook accounts for campaign selection
  const { data: facebookAccounts } = useQuery<FacebookAccount[]>({
    queryKey: ['facebook-accounts'],
    queryFn: async () => {
      const response = await api.get('/facebook/accounts');
      return response.data;
    },
  });

  // Fetch campaigns for selected account
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ['campaigns', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await api.get(`/facebook/campaigns/${selectedAccountId}`);
      return response.data;
    },
    enabled: !!selectedAccountId,
  });

  // Set default account when accounts load
  useEffect(() => {
    if (facebookAccounts && facebookAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(facebookAccounts[0]._id);
    }
  }, [facebookAccounts, selectedAccountId]);

  // Fetch all adsets for source adset selection
  const { data: allAdsets } = useQuery<Adset[]>({
    queryKey: ['all-adsets'],
    queryFn: async () => {
      const response = await api.get('/adsets');
      return response.data || [];
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ adsetId, name, campaignId }: { adsetId: string; name?: string; campaignId?: string }) => {
      const response = await api.post(`/adsets/${adsetId}/duplicate`, { name, campaignId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['all-adsets'] });
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
    setSelectedAdsetForDuplicate(adset);
    // Set default values
    setDuplicateFormData({
      campaignId: campaignId || '',
      adsetName: `${adset.name} (Copy)`,
      sourceAdsetId: adset._id,
    });
    setShowDuplicateModal(true);
  };

  const handleDuplicateSubmit = async () => {
    if (!duplicateFormData.campaignId || !duplicateFormData.adsetName || !duplicateFormData.sourceAdsetId) {
      alert('Please fill in all fields');
      return;
    }

    if (!selectedAdsetForDuplicate) return;

    setDuplicatingId(selectedAdsetForDuplicate._id);
    try {
      const duplicated = await duplicateMutation.mutateAsync({
        adsetId: duplicateFormData.sourceAdsetId,
        name: duplicateFormData.adsetName,
        campaignId: duplicateFormData.campaignId,
      });
      alert(`Adset duplicated successfully! All settings including targeting, conversion goals, and optimization settings have been copied.`);
      setShowDuplicateModal(false);
      setSelectedAdsetForDuplicate(null);
      navigate(`/adsets/edit/${duplicated._id}`);
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

  const deleteMutation = useMutation({
    mutationFn: async (adsetId: string) => {
      const response = await api.delete(`/adsets/${adsetId}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      setDeletingId(null);
      const deletedInfo = data.deleted ? 
        ` Deleted ${data.deleted.assets || 0} assets, ${data.deleted.copies || 0} copies, and ${data.deleted.combinations || 0} combinations.` : '';
      alert(`Adset deleted successfully!${deletedInfo}`);
    },
    onError: (error: any) => {
      setDeletingId(null);
      alert(error.response?.data?.error || 'Failed to delete adset');
    },
  });

  const handleDelete = async (adset: Adset) => {
    if (adset.facebookAdsetId) {
      alert('Cannot delete adsets that have been published to Facebook.');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete "${adset.name}"?\n\nThis will permanently delete:\n- The adset\n- All associated assets and images\n- All ad copies\n- All combinations\n\nThis action cannot be undone.`)) {
      return;
    }

    setDeletingId(adset._id);
    await deleteMutation.mutateAsync(adset._id);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/facebook/campaigns/${campaignId}/import-adsets`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adsets', campaignId] });
      const messages = [];
      if (data.imported > 0) messages.push(`Imported ${data.imported} new adset(s)`);
      if (data.updated > 0) messages.push(`Updated ${data.updated} existing adset(s)`);
      if (data.deleted > 0) messages.push(`Removed ${data.deleted} deleted adset(s)`);
      if (messages.length === 0) {
        messages.push('All adsets are already in sync');
      }
      alert(messages.join(', ') + '!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to sync adsets from Facebook');
    },
  });

  const handleImportFromFacebook = () => {
    if (window.confirm('Sync adsets with Facebook? This will:\n- Import new adsets\n- Update existing adsets\n- Remove adsets deleted on Facebook')) {
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
            title="Sync adsets with Facebook (import new, update existing, remove deleted)"
          >
            {importMutation.isPending ? 'Syncing...' : 'Sync from Facebook'}
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
                <tr 
                  key={adset._id} 
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${adset.createdByApp ? 'bg-blue-50' : ''}`}
                  onClick={() => navigate(`/adsets/edit/${adset._id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {adset.name}
                      {adset.createdByApp && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title="Created in this app">
                          App
                        </span>
                      )}
                    </div>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDuplicate(adset)}
                        disabled={duplicatingId === adset._id}
                        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                        title="Clone with ALL settings (targeting, conversion goals, optimization, billing, etc.)"
                      >
                        {duplicatingId === adset._id ? (
                          <span className="text-xs">...</span>
                        ) : (
                          <HiDuplicate className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleUseAsTemplate(adset)}
                        className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors"
                        title="Use as template to create new adset with pre-filled settings"
                      >
                        <HiTemplate className="w-5 h-5" />
                      </button>
                      {adset.facebookAdsetId && (
                        <button
                          onClick={() => handleSync(adset)}
                          disabled={syncingId === adset._id}
                          className="p-2 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                          title="Sync latest settings from Facebook"
                        >
                          {syncingId === adset._id ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <HiRefresh className="w-5 h-5" />
                          )}
                        </button>
                      )}
                      <Link
                        to={`/adsets/edit/${adset._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors"
                        title="Edit adset"
                      >
                        <HiPencil className="w-5 h-5" />
                      </Link>
                      {!adset.facebookAdsetId && (
                        <button
                          onClick={() => handleDelete(adset)}
                          disabled={deletingId === adset._id}
                          className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete adset and all associated assets, copies, and combinations"
                        >
                          {deletingId === adset._id ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <HiTrash className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
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

      {/* Duplicate Adset Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Duplicate Adset</h2>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setSelectedAdsetForDuplicate(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <HiX className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Facebook Account Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Facebook Account
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    setDuplicateFormData({ ...duplicateFormData, campaignId: '' });
                  }}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select an account</option>
                  {facebookAccounts?.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campaign Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Campaign <span className="text-red-500">*</span>
                </label>
                <select
                  value={duplicateFormData.campaignId}
                  onChange={(e) => {
                    setDuplicateFormData({ 
                      ...duplicateFormData, 
                      campaignId: e.target.value,
                      sourceAdsetId: '' // Reset source adset when campaign changes
                    });
                  }}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a campaign</option>
                  {campaigns?.map((campaign) => (
                    <option key={campaign._id} value={campaign._id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adset Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adset Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={duplicateFormData.adsetName}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, adsetName: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter adset name"
                  required
                />
              </div>

              {/* Source Adset Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copy Settings From <span className="text-red-500">*</span>
                </label>
                <select
                  value={duplicateFormData.sourceAdsetId}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, sourceAdsetId: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                  disabled={!duplicateFormData.campaignId}
                >
                  <option value="">
                    {duplicateFormData.campaignId 
                      ? 'Select an adset to copy settings from' 
                      : 'Select a campaign first'}
                  </option>
                  {allAdsets
                    ?.filter((adset) => 
                      duplicateFormData.campaignId 
                        ? adset.campaignId?._id === duplicateFormData.campaignId
                        : true
                    )
                    .map((adset) => (
                      <option key={adset._id} value={adset._id}>
                        {adset.name} {adset.campaignId && `(${adset.campaignId.name})`}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  {duplicateFormData.campaignId 
                    ? 'Select an adset from the selected campaign to copy its settings.'
                    : 'Different campaigns may have different adset settings. Select a campaign first, then choose an adset whose settings you want to copy.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setSelectedAdsetForDuplicate(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateSubmit}
                disabled={duplicatingId !== null || !duplicateFormData.campaignId || !duplicateFormData.adsetName || !duplicateFormData.sourceAdsetId}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {duplicatingId ? 'Duplicating...' : 'Duplicate Adset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Adsets;

