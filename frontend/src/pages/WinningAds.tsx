import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface WinningAd {
  combinationId: string;
  facebookAdId: string;
  adsetId: string;
  campaignName: string;
  adsetName: string;
  impressions: number;
  clicks: number;
  spend: number;
  schedules: number;
  costPerSchedule: number;
  url: string;
  facebookAdLink: string;
}

const WinningAds = () => {
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');

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

  const ads = data?.ads || [];

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Winning Ads (Schedule Conversions)</h1>
        <p className="mt-2 text-sm text-gray-600">
          List ads with &quot;Schedule&quot; conversions in the selected period to detect winners.
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
          No winning ads with &quot;Schedule&quot; conversions found in this period.
        </div>
      )}

      {!isLoading && !isError && ads.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Campaign</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Adset</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Schedules</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Cost / Schedule</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Spend</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Clicks</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Impressions</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Ad URL</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Facebook</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ads.map((ad) => (
                <tr key={ad.facebookAdId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{ad.campaignName}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{ad.adsetName}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold">{ad.schedules}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {ad.costPerSchedule > 0 ? ad.costPerSchedule.toFixed(2) : '-'}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WinningAds;


