import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { HiEye, HiArrowDownTray, HiArrowPath, HiPlus, HiXMark } from 'react-icons/hi2';

interface WinningAd {
  combinationId: string;
  facebookAdId: string;
  adsetId: string;
  campaignName: string;
  adsetName: string;
  adName?: string;
  impressions: number;
  clicks: number;
  spend: number;
  schedules: number;
  costPerSchedule: number;
  conversionRate: number;
  score?: number;
  url: string;
  facebookAdLink: string;
  conversionEvents?: Array<{
    actionType: string;
    value: number;
  }>;
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

interface Campaign {
  _id: string;
  name: string;
  status: string;
}

interface FacebookAccount {
  _id: string;
  accountId: string;
  accountName: string;
}

const WinningAds = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Set default dates: 3 months ago to today
  const getDefaultDates = () => {
    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    
    return {
      since: threeMonthsAgo.toISOString().split('T')[0],
      until: today.toISOString().split('T')[0],
    };
  };
  
  const defaultDates = getDefaultDates();
  const [since, setSince] = useState<string>(defaultDates.since);
  const [until, setUntil] = useState<string>(defaultDates.until);
  const [selectedAd, setSelectedAd] = useState<WinningAd | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCreateAdset, setShowCreateAdset] = useState(false);
  const [targetAdsetId, setTargetAdsetId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [adsetName, setAdsetName] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState<number>(0);
  const [quickFilter, setQuickFilter] = useState<'all' | 'top1' | 'top5' | 'top10'>('all');

  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ ads: WinningAd[] }>({
    queryKey: ['winning-ads', { since, until, forceRefresh }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (since) params.since = since;
      if (until) params.until = until;
      if (forceRefresh > 0) {
        params.forceRefresh = 'true';
      }
      const response = await api.get('/winning-ads', { params });
      return response.data;
    },
  });

  const handleForceRefresh = async () => {
    setForceRefresh((prev) => prev + 1);
    await refetch();
  };

  // Fetch all adsets for import dropdown
  const { data: adsetsData } = useQuery<Adset[]>({
    queryKey: ['all-adsets'],
    queryFn: async () => {
      // Get all adsets for the user (no campaignId filter)
      const response = await api.get('/adsets');
      return response.data;
    },
  });

  // Fetch Facebook accounts
  const { data: accountsData } = useQuery<FacebookAccount[]>({
    queryKey: ['facebook-accounts'],
    queryFn: async () => {
      const response = await api.get('/facebook/accounts');
      return response.data;
    },
  });

  // Fetch campaigns for selected account
  const { data: campaignsData } = useQuery<Campaign[]>({
    queryKey: ['campaigns', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await api.get(`/facebook/campaigns/${selectedAccountId}`);
      return response.data;
    },
    enabled: !!selectedAccountId,
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

  // Create adset mutation
  const createAdsetMutation = useMutation({
    mutationFn: async (data: { facebookAdId: string; campaignId: string; adsetName: string }) => {
      const response = await api.post('/winning-ads/create-adset', data);
      return response.data;
    },
    onSuccess: (data) => {
      alert(data.message || 'Adset created successfully!');
      setShowCreateAdset(false);
      setSelectedAd(null);
      setSelectedCampaignId('');
      setAdsetName('');
      setSelectedAccountId('');
      queryClient.invalidateQueries({ queryKey: ['adsets'] });
      // Navigate to the adset editor
      navigate(`/adsets/edit/${data.adset._id}`);
    },
    onError: (error: any) => {
      alert(error.response?.data?.error || 'Failed to create adset');
    },
  });

  const adsets = adsetsData || [];

  // Apply quick filter and sort by score by default
  const filteredAds = (() => {
    if (!data?.ads) return [];
    const allAds = [...data.ads];
    
    // Sort by score descending by default
    const sorted = allAds.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    if (quickFilter === 'all') {
      return sorted;
    }
    
    // Get top percentage
    const percentage = quickFilter === 'top1' ? 0.01 : quickFilter === 'top5' ? 0.05 : 0.1;
    const count = Math.max(1, Math.ceil(sorted.length * percentage));
    
    return sorted.slice(0, count);
  })();

  const handleViewDetails = (ad: WinningAd) => {
    setSelectedAd(ad);
    setShowDetails(true);
  };

  const handleImport = (ad: WinningAd) => {
    setSelectedAd(ad);
    setShowImport(true);
  };

  const handleCreateAdset = (ad: WinningAd) => {
    setSelectedAd(ad);
    setAdsetName(`${ad.adName || ad.adsetName} - Variant`);
    setShowCreateAdset(true);
    // Auto-select first account if available
    if (accountsData && accountsData.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountsData[0]._id);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Winning Ads</h1>
        <p className="mt-2 text-sm text-gray-600">
          List ads with schedule conversions (conversions:schedule_website) in the selected period to detect winners.
        </p>
      </div>

      {/* Combined Filters and Date Controls */}
      <div className="bg-white p-3 rounded-lg shadow mb-4 flex items-center justify-between gap-4">
        {/* Quick Filters on Left */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-700">Filters:</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                quickFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setQuickFilter('top1')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                quickFilter === 'top1'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Top 1%
            </button>
            <button
              onClick={() => setQuickFilter('top5')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                quickFilter === 'top5'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Top 5%
            </button>
            <button
              onClick={() => setQuickFilter('top10')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                quickFilter === 'top10'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Top 10%
            </button>
          </div>
          {quickFilter !== 'all' && (
            <span className="text-xs text-gray-500">
              {filteredAds.length} of {data?.ads?.length || 0}
            </span>
          )}
        </div>

        {/* Date Controls and Refresh on Right */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">From:</label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs py-1 px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">To:</label>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs py-1 px-2"
            />
          </div>
          <button
            onClick={handleForceRefresh}
            disabled={isFetching}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs"
            title="Force refresh data from Facebook (bypasses cache)"
          >
            <HiArrowPath className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {(isLoading || isFetching) && (
        <div className="text-gray-600 text-sm py-2">Loading winning ads...</div>
      )}
      {isError && (
        <div className="text-red-600 text-sm py-2">Failed to load winning ads.</div>
      )}

      {!isLoading && !isError && filteredAds.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
          No winning ads with schedule conversions found in this period.
        </div>
      )}

      {!isLoading && !isError && filteredAds.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-700">Campaign</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-700">Adset</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-700">Ad Name</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Schedules</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Cost/Schedule</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Conv Rate</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Spend</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Clicks</th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-700">Impressions</th>
                <th className="px-2 py-1.5 text-center font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredAds.map((ad) => (
                <tr key={ad.facebookAdId} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-900">{ad.campaignName}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-900">{ad.adsetName}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-900">{ad.adName || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right font-semibold text-gray-900">{ad.schedules || 0}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right text-gray-900">
                    {ad.costPerSchedule > 0 ? ad.costPerSchedule.toFixed(2) : '-'}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right text-gray-900">
                    {ad.conversionRate > 0 ? `${(ad.conversionRate * 100).toFixed(2)}%` : '-'}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right text-gray-900">{ad.spend.toFixed(2)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right text-gray-900">{ad.clicks.toLocaleString()}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right text-gray-900">{ad.impressions.toLocaleString()}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => handleViewDetails(ad)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View Details"
                        aria-label="View ad details"
                      >
                        <HiEye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleImport(ad)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Import to Adset"
                        aria-label="Import ad to adset"
                      >
                        <HiArrowDownTray className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleCreateAdset(ad)}
                        className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Create New Adset"
                        aria-label="Create new adset from this ad"
                      >
                        <HiPlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Adset Modal */}
      {showCreateAdset && selectedAd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Create New Adset</h2>
                <button
                  onClick={() => {
                    setShowCreateAdset(false);
                    setSelectedAd(null);
                    setSelectedCampaignId('');
                    setAdsetName('');
                    setSelectedAccountId('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <HiXMark className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Facebook Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setSelectedCampaignId(''); // Reset campaign when account changes
                    }}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select account...</option>
                    {accountsData?.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.accountName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign
                  </label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    disabled={!selectedAccountId}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">Select campaign...</option>
                    {campaignsData?.map((campaign) => (
                      <option key={campaign._id} value={campaign._id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adset Name
                  </label>
                  <input
                    type="text"
                    value={adsetName}
                    onChange={(e) => setAdsetName(e.target.value)}
                    placeholder="Enter adset name..."
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                  <p className="font-semibold mb-1">What will be imported:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Ad creative (image, headline, body, description, CTA)</li>
                    <li>Landing page URL</li>
                    <li>Adset targeting settings</li>
                  </ul>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateAdset(false);
                      setSelectedAd(null);
                      setSelectedCampaignId('');
                      setAdsetName('');
                      setSelectedAccountId('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedCampaignId) {
                        alert('Please select a campaign');
                        return;
                      }
                      if (!adsetName.trim()) {
                        alert('Please enter an adset name');
                        return;
                      }
                      createAdsetMutation.mutate({
                        facebookAdId: selectedAd.facebookAdId,
                        campaignId: selectedCampaignId,
                        adsetName: adsetName.trim(),
                      });
                    }}
                    disabled={createAdsetMutation.isPending || !selectedCampaignId || !adsetName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createAdsetMutation.isPending ? 'Creating...' : 'Create Adset'}
                  </button>
                </div>
              </div>
            </div>
          </div>
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


