import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import FacebookConnector from '../components/FacebookConnector';
import { HiCheckCircle, HiXCircle, HiArrowPath } from 'react-icons/hi2';

interface DashboardStats {
  totalLeads: number;
  totalSpend: number;
  averageCostPerLead: number;
  averageConversionRate: number;
  dailyStats: Array<{
    date: string;
    leads: number;
    spend: number;
  }>;
  hasData: boolean;
}

interface FacebookStatus {
  hasConnection: boolean;
  hasActiveConnection: boolean;
  connectionStatus: 'active' | 'expired';
  accountCount: number;
  activeAccountCount: number;
  canManageConnection: boolean;
  accounts: Array<{
    _id: string;
    accountName: string;
    isActive: boolean;
    expiresAt?: Date;
  }>;
}

const Dashboard = () => {
  const { currentAccount } = useAuth();

  const [forceRefresh, setForceRefresh] = useState(0);

  const { data: stats, isLoading: statsLoading, isFetching, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', forceRefresh],
    queryFn: async () => {
      const response = await api.get('/dashboard/stats', {
        params: forceRefresh > 0 ? { forceRefresh: 'true' } : {},
      });
      return response.data;
    },
  });

  const handleForceRefresh = () => {
    setForceRefresh((prev) => prev + 1);
    refetch();
  };

  const { data: facebookStatus, refetch: refetchFacebookStatus } = useQuery<FacebookStatus>({
    queryKey: ['facebook-status'],
    queryFn: async () => {
      const response = await api.get('/dashboard/facebook-status');
      return response.data;
    },
  });

  const handleReconnectFacebook = async () => {
    try {
      const response = await api.get('/facebook/auth-url');
      window.location.href = response.data.authUrl;
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to initiate Facebook connection');
    }
  };

  // Simple line chart component
  const LineChart = ({ data }: { data: DashboardStats['dailyStats'] }) => {
    if (!data || data.length === 0) return null;

    const maxLeads = Math.max(...data.map((d) => d.leads), 1);
    const chartHeight = 200;

    return (
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        <svg width="100%" height={chartHeight} className="overflow-visible">
          <defs>
            <linearGradient id="leadGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
              <stop offset="100%" stopColor="rgba(59, 130, 246, 0.05)" />
            </linearGradient>
          </defs>
          
          {/* Area fill */}
          <path
            d={`M 0 ${chartHeight} ${data
              .map((d, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = chartHeight - (d.leads / maxLeads) * chartHeight;
                return `L ${x}% ${y}`;
              })
              .join(' ')} L 100% ${chartHeight} Z`}
            fill="url(#leadGradient)"
          />
          
          {/* Line */}
          <polyline
            points={data
              .map((d, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = chartHeight - (d.leads / maxLeads) * chartHeight;
                return `${x}%,${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
          />
          
          {/* Data points */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = chartHeight - (d.leads / maxLeads) * chartHeight;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={y}
                r="4"
                fill="rgb(59, 130, 246)"
              />
            );
          })}
        </svg>
      </div>
    );
  };

  // Beautiful bar chart component for daily conversions
  const BarChart = ({ data }: { data: DashboardStats['dailyStats'] }) => {
    if (!data || data.length === 0) return null;

    const maxLeads = Math.max(...data.map((d) => d.leads), 1);
    const chartHeight = 300;
    const barWidth = Math.max(4, (100 / data.length) * 0.8);
    const barSpacing = (100 / data.length) * 0.2;
    const padding = 40;

    // Filter to show only days with data, or show all days
    const daysWithData = data.filter((d) => d.leads > 0 || d.spend > 0);
    const displayData = daysWithData.length > 0 ? daysWithData : data;

    return (
      <div className="relative">
        <svg width="100%" height={chartHeight + padding} className="overflow-visible">
          <defs>
            <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(139, 92, 246, 0.9)" />
              <stop offset="50%" stopColor="rgba(139, 92, 246, 0.7)" />
              <stop offset="100%" stopColor="rgba(139, 92, 246, 0.5)" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = Math.round(maxLeads * ratio);
            const y = chartHeight - ratio * chartHeight;
            return (
              <g key={ratio}>
                <line
                  x1="0"
                  y1={y + padding}
                  x2="100%"
                  y2={y + padding}
                  stroke="rgba(229, 231, 235, 0.5)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x="0"
                  y={y + padding + 4}
                  fontSize="11"
                  fill="#6B7280"
                  textAnchor="start"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {displayData.map((day, i) => {
            const barHeight = (day.leads / maxLeads) * chartHeight;
            const x = (i / displayData.length) * 100 + barSpacing / 2;
            const y = chartHeight - barHeight + padding;
            const date = new Date(day.date);
            const isToday = date.toDateString() === new Date().toDateString();
            const hasData = day.leads > 0;

            return (
              <g key={day.date}>
                {/* Bar */}
                <rect
                  x={`${x}%`}
                  y={y}
                  width={`${barWidth}%`}
                  height={barHeight}
                  fill={hasData ? "url(#barGradient)" : "rgba(229, 231, 235, 0.3)"}
                  rx="4"
                  ry="4"
                  filter={hasData ? "url(#glow)" : undefined}
                  className="transition-all duration-300 hover:opacity-80"
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: {day.leads} conversions, ${day.spend.toFixed(2)} spend
                  </title>
                </rect>

                {/* Date label (rotate for better fit) */}
                {i % Math.ceil(displayData.length / 10) === 0 && (
                  <text
                    x={`${x + barWidth / 2}%`}
                    y={chartHeight + padding + 16}
                    fontSize="10"
                    fill="#6B7280"
                    textAnchor="middle"
                    transform={`rotate(-45 ${x + barWidth / 2}% ${chartHeight + padding + 16})`}
                  >
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                )}

                {/* Value label on top of bar */}
                {hasData && barHeight > 20 && (
                  <text
                    x={`${x + barWidth / 2}%`}
                    y={y - 4}
                    fontSize="11"
                    fill="#4B5563"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {day.leads}
                  </text>
                )}

                {/* Highlight today */}
                {isToday && (
                  <rect
                    x={`${x}%`}
                    y={y}
                    width={`${barWidth}%`}
                    height={barHeight}
                    fill="none"
                    stroke="rgba(59, 130, 246, 0.8)"
                    strokeWidth="2"
                    rx="4"
                    ry="4"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" className="rounded">
              <rect width="16" height="16" fill="url(#barGradient)" rx="2" />
            </svg>
            <span>Conversions</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Performance overview for the last 30 days
        </p>
      </div>

      {/* Quick Links */}
      <div className="mb-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/campaigns"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900">Campaigns</h3>
            <p className="mt-2 text-sm text-gray-600">
              View and manage your Facebook ad campaigns
            </p>
          </Link>

          <Link
            to="/winning-ads"
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-lg font-semibold text-gray-900">Winning Ads</h3>
            <p className="mt-2 text-sm text-gray-600">
              Analyze top-performing ads and create variants
            </p>
          </Link>

          {currentAccount && (currentAccount.role === 'owner' || currentAccount.role === 'admin') && (
            <Link
              to={`/account/${currentAccount._id}`}
              className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
              <p className="mt-2 text-sm text-gray-600">
                Manage team members and account settings
              </p>
            </Link>
          )}
        </div>
      </div>

      {/* Performance Metrics and Facebook Connection */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Performance Metrics */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Performance Metrics</h2>
              <button
                onClick={handleForceRefresh}
                disabled={isFetching}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Force refresh data from Facebook"
              >
                <HiArrowPath className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            {statsLoading ? (
              <div className="text-center py-12">
                <div className="text-gray-500">Loading performance data...</div>
              </div>
            ) : stats && stats.hasData ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Leads</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.totalLeads.toLocaleString()}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Total Spend</div>
                    <div className="text-2xl font-bold text-gray-900">${stats.totalSpend.toLocaleString()}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Avg Cost per Lead</div>
                    <div className="text-2xl font-bold text-gray-900">${stats.averageCostPerLead.toFixed(2)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.averageConversionRate.toFixed(2)}%</div>
                  </div>
                </div>

                {/* Leads Chart */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Leads Over Time (Last 30 Days)</h3>
                  <LineChart data={stats.dailyStats} />
                </div>

                {/* Daily Conversions Bar Chart */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Daily Conversions by Date</h3>
                  <BarChart data={stats.dailyStats} />
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-4">No performance data available</div>
                <p className="text-sm text-gray-400">
                  Connect your Facebook account and start running ads to see performance metrics here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Facebook Connection Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Facebook Connection</h2>
          
          {facebookStatus ? (
            <>
              {facebookStatus.hasConnection ? (
                <div className="space-y-4">
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    facebookStatus.hasActiveConnection 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    {facebookStatus.hasActiveConnection ? (
                      <HiCheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <HiXCircle className="w-5 h-5 text-yellow-600" />
                    )}
                    <div className="text-sm font-medium text-gray-900">
                      {facebookStatus.hasActiveConnection ? 'Active' : 'Expired'}
                    </div>
                  </div>

                  {facebookStatus.canManageConnection && (
                    <button
                      onClick={handleReconnectFacebook}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <HiArrowPath className="w-4 h-4" />
                      Reconnect
                    </button>
                  )}

                  {!facebookStatus.canManageConnection && (
                    <div className="text-xs text-gray-500 text-center pt-2">
                      Only admins and owners can manage Facebook connections
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {facebookStatus.canManageConnection ? (
                    <FacebookConnector onConnected={() => refetchFacebookStatus()} />
                  ) : (
                    <div className="text-center py-8">
                      <HiXCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <div className="text-sm text-gray-600 mb-2">No Facebook connection</div>
                      <div className="text-xs text-gray-500">
                        Contact an admin or owner to connect Facebook
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-500">Loading connection status...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
