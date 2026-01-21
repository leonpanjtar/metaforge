import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { HiEye, HiArrowDownTray } from 'react-icons/hi2';

interface WinningAd {
  combinationId: string;
  facebookAdId: string;
  adsetId: string;
  campaignName: string;
  adsetName: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  costPerLead: number;
  url: string;
  facebookAdLink: string;
}

interface AdDetails {
  creative: {
    headline: string;
    body: string;
    description: string;
    ctaButton: string;
    imageHash?: string;
    imageUrl?: string;
    link: string;
  };
  adsetTargeting: {
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    locations: string[];
    interests: string[];
    behaviors: string[];
    placements: string[];
  };
}

interface Adset {
  _id: string;
  name: string;
  campaignId: string | { _id: string; name: string };
}

const WinningAds = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');
  const [selectedAd, setSelectedAd] = useState<WinningAd | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [targetAdsetId, setTargetAdsetId] = useState<string>('');

  const { data, isLoading, isError } = useQuery<{ ads: WinningAd[] }>({
    queryKey: ['winning-ads', { since, until }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (since) params.since = since;
      if (until) params.until = until;
      const response = await api.get('/winning-ads', { params });
      return response.data;
    },
  });

  // Fetch all adsets for import dropdown
  const { data: adsetsData } = useQuery<Adset[]>({
    queryKey: ['all-adsets'],
    queryFn: async () => {
      // Get all adsets for the user (no campaignId filter)
      const response = await api.get('/adsets');
      return response.data;
    },
  });

  // Fetch ad details
  const { data: adDetails, isLoading: loadingDetails } = useQuery<AdDetails>({
    queryKey: ['ad-details', selectedAd?.facebookAdId],
    queryFn: async () => {
      if (!selectedAd) throw new Error('No ad selected');
      const response = await api.get(`/winning-ads/${selectedAd.facebookAdId}/details`);
      return response.data;
    },
    enabled: !!selectedAd && showDetails,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (data: { facebookAdId: string; targetAdsetId: string }) => {
      const response = await api.post('/winning-ads/import', data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      alert(data.message || 'Ad imported successfully!');
      setShowImport(false);
      setSelectedAd(null);
      queryClient.invalidateQueries({ queryKey: ['adsets'] });
      // Navigate to the adset editor
      navigate(`/adsets/edit/${variables.targetAdsetId}`);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to import ad');
    },
  });

  const ads = data?.ads || [];
  const adsets = adsetsData || [];

  const handleViewDetails = (ad: WinningAd) => {
    setSelectedAd(ad);
    setShowDetails(true);
  };

  const handleImport = (ad: WinningAd) => {
    setSelectedAd(ad);
    setShowImport(true);
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Winning Ads (Lead Outcomes)</h1>
        <p className="mt-2 text-sm text-gray-600">
          List ads with lead outcomes (OUTCOME_LEADS) in the selected period to detect winners.
        </p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-gray-600">Loading winning ads...</div>
      )}
      {isError && (
        <div className="text-red-600">Failed to load winning ads.</div>
      )}

      {!isLoading && !isError && ads.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
          No winning ads with lead outcomes found in this period.
        </div>
      )}

      {!isLoading && !isError && ads.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Campaign</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Adset</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Leads</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Cost / Lead</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Spend</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Clicks</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Impressions</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Ad URL</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Facebook</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ads.map((ad) => (
                <tr key={ad.facebookAdId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{ad.campaignName}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{ad.adsetName}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold">{ad.leads}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {ad.costPerLead > 0 ? ad.costPerLead.toFixed(2) : '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{ad.spend.toFixed(2)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{ad.clicks}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{ad.impressions}</td>
                  <td className="px-4 py-2 max-w-xs">
                    {ad.url ? (
                      <a
                        href={ad.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {ad.url}
                      </a>
                    ) : (
                      <span className="text-gray-400 italic">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <a
                      href={ad.facebookAdLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open
                    </a>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewDetails(ad)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View Details"
                        aria-label="View ad details"
                      >
                        <HiEye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleImport(ad)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Import to Adset"
                        aria-label="Import ad to adset"
                      >
                        <HiArrowDownTray className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ad Details Modal */}
      {showDetails && selectedAd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Ad Details</h2>
                <button
                  onClick={() => {
                    setShowDetails(false);
                    setSelectedAd(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {loadingDetails ? (
                <div className="text-gray-600">Loading ad details...</div>
              ) : adDetails ? (
                <div className="space-y-6">
                  {/* Creative Section */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Creative</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      {adDetails.creative.imageUrl && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                          <img
                            src={adDetails.creative.imageUrl}
                            alt="Ad creative"
                            className="max-w-full h-auto rounded border border-gray-200"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                        <p className="text-gray-900">{adDetails.creative.headline || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                        <p className="text-gray-900 whitespace-pre-wrap">{adDetails.creative.body || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <p className="text-gray-900">{adDetails.creative.description || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CTA Button</label>
                        <p className="text-gray-900">{adDetails.creative.ctaButton || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                        <a
                          href={adDetails.creative.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {adDetails.creative.link || 'N/A'}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Targeting Section */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Adset Targeting</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                          <p className="text-gray-900">
                            {adDetails.adsetTargeting.ageMin || 'N/A'} - {adDetails.adsetTargeting.ageMax || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Genders</label>
                          <p className="text-gray-900">
                            {adDetails.adsetTargeting.genders?.map((g: number) => g === 1 ? 'Female' : g === 2 ? 'Male' : 'All').join(', ') || 'All'}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
                        <p className="text-gray-900">
                          {adDetails.adsetTargeting.locations.length > 0
                            ? adDetails.adsetTargeting.locations.join(', ')
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Interests</label>
                        <p className="text-gray-900">
                          {adDetails.adsetTargeting.interests.length > 0
                            ? adDetails.adsetTargeting.interests.join(', ')
                            : 'None'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Behaviors</label>
                        <p className="text-gray-900">
                          {adDetails.adsetTargeting.behaviors.length > 0
                            ? adDetails.adsetTargeting.behaviors.join(', ')
                            : 'None'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Placements</label>
                        <p className="text-gray-900">
                          {adDetails.adsetTargeting.placements.length > 0
                            ? adDetails.adsetTargeting.placements.join(', ')
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-red-600">Failed to load ad details</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && selectedAd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Import Ad to Adset</h2>
              <button
                onClick={() => {
                  setShowImport(false);
                  setSelectedAd(null);
                  setTargetAdsetId('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Target Adset
                </label>
                <select
                  value={targetAdsetId}
                  onChange={(e) => setTargetAdsetId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select an adset...</option>
                  {adsets.map((adset) => {
                    const campaignName = typeof adset.campaignId === 'object' ? adset.campaignId.name : 'Campaign';
                    return (
                      <option key={adset._id} value={adset._id}>
                        {campaignName} / {adset.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">What will be imported:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Ad creative (image, headline, body, description, CTA)</li>
                  <li>Landing page URL</li>
                  <li>Adset targeting (for reference)</li>
                </ul>
                <p className="mt-2">You can then create variants in the Adset Editor.</p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowImport(false);
                    setSelectedAd(null);
                    setTargetAdsetId('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!targetAdsetId) {
                      alert('Please select a target adset');
                      return;
                    }
                    importMutation.mutate({
                      facebookAdId: selectedAd.facebookAdId,
                      targetAdsetId,
                    });
                  }}
                  disabled={importMutation.isPending || !targetAdsetId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {importMutation.isPending ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WinningAds;


