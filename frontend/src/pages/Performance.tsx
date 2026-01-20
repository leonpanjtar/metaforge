import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../services/api';

interface PerformanceData {
  _id: string;
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  frequency?: number;
  adCombinationId: {
    _id: string;
    overallScore: number;
  };
}

const Performance = () => {
  const { adsetId } = useParams<{ adsetId: string }>();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  const { data: performanceData, refetch } = useQuery<PerformanceData[]>({
    queryKey: ['performance', adsetId],
    queryFn: async () => {
      const response = await api.get(`/performance/${adsetId}`);
      return response.data;
    },
    enabled: !!adsetId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/performance/sync/${adsetId}`);
      return response.data;
    },
    onSuccess: () => {
      refetch();
      setSyncing(false);
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    await syncMutation.mutateAsync();
  };

  // Aggregate data by date
  const aggregatedData = performanceData
    ? performanceData.reduce((acc, item) => {
        const date = new Date(item.date).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = {
            date,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            spend: 0,
            frequency: 0,
            count: 0,
          };
        }
        acc[date].impressions += item.impressions;
        acc[date].clicks += item.clicks;
        acc[date].spend += item.spend;
        acc[date].frequency += item.frequency || 0;
        acc[date].count += 1;
        return acc;
      }, {} as Record<string, any>)
    : {};

  const chartData = Object.values(aggregatedData).map((item: any) => ({
    ...item,
    ctr: item.clicks > 0 ? ((item.clicks / item.impressions) * 100).toFixed(2) : 0,
    avgFrequency: item.frequency / item.count,
  }));

  const totalImpressions = performanceData
    ? performanceData.reduce((sum, item) => sum + item.impressions, 0)
    : 0;
  const totalClicks = performanceData
    ? performanceData.reduce((sum, item) => sum + item.clicks, 0)
    : 0;
  const totalSpend = performanceData
    ? performanceData.reduce((sum, item) => sum + item.spend, 0)
    : 0;
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Performance Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">Track your ad performance metrics</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Data'}
        </button>
      </div>

      {performanceData && performanceData.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Total Impressions</p>
              <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Total Clicks</p>
              <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Average CTR</p>
              <p className="text-2xl font-bold">{avgCTR}%</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-sm text-gray-600">Total Spend</p>
              <p className="text-2xl font-bold">${totalSpend.toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Performance Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="impressions" stroke="#8884d8" />
                <Line type="monotone" dataKey="clicks" stroke="#82ca9d" />
                <Line type="monotone" dataKey="spend" stroke="#ffc658" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">CTR Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="ctr" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-600 mb-4">No performance data available yet.</p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Performance Data'}
          </button>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={() => navigate('/campaigns')}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Back to Campaigns
        </button>
      </div>
    </div>
  );
};

export default Performance;
