import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import FacebookConnector from '../components/FacebookConnector';

interface FacebookAccount {
  _id: string;
  accountId: string;
  accountName: string;
}

interface Campaign {
  _id: string;
  name: string;
  objective: string;
  status: string;
}

const Campaigns = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');

  const { data: accounts, refetch: refetchAccounts } = useQuery<FacebookAccount[]>({
    queryKey: ['facebook-accounts'],
    queryFn: async () => {
      const response = await api.get('/facebook/accounts');
      return response.data;
    },
  });

  // Check for OAuth callback results
  useEffect(() => {
    const connected = searchParams.get('facebook_connected');
    const error = searchParams.get('facebook_error');
    
    if (connected) {
      const accountsCount = searchParams.get('accounts');
      alert(`Successfully connected ${accountsCount} Facebook account(s)!`);
      setSearchParams({}); // Clear URL params
      refetchAccounts();
    } else if (error) {
      alert(`Facebook connection failed: ${decodeURIComponent(error)}`);
      setSearchParams({}); // Clear URL params
    }
  }, [searchParams, setSearchParams, refetchAccounts]);

  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ['campaigns', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await api.get(`/facebook/campaigns/${selectedAccountId}`);
      return response.data;
    },
    enabled: !!selectedAccountId,
  });

  useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0]._id);
    }
  }, [accounts, selectedAccountId]);

  const handleReconnectFacebook = async () => {
    if (!accounts || accounts.length === 0) return;

    if (!window.confirm('This will clear your current Facebook connection(s) and start a fresh connect flow. Continue?')) {
      return;
    }

    try {
      setReconnectLoading(true);

      // Disconnect all existing connected accounts for this user
      await Promise.all(
        accounts.map((account) =>
          api.post(`/facebook/disconnect/${account._id}`)
        )
      );

      // Start a fresh OAuth flow
      const response = await api.get('/facebook/auth-url');
      window.location.href = response.data.authUrl;
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reconnect Facebook. Please try again.');
      setReconnectLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
        <p className="mt-2 text-sm text-gray-600">
          Select a Facebook account to view campaigns
        </p>
      </div>

      {(!accounts || accounts.length === 0) && (
        <div className="mb-6">
          <FacebookConnector onConnected={() => refetchAccounts()} />
        </div>
      )}

      {accounts && accounts.length > 0 && (
        <>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Facebook Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </div>
            {campaigns && campaigns.length > 0 && (
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="ALL">All Campaigns</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="DELETED">Deleted</option>
                </select>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={handleReconnectFacebook}
                disabled={reconnectLoading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {reconnectLoading ? 'Reconnecting...' : 'Reconnect Facebook'}
              </button>
            </div>
          </div>

          {campaigns && campaigns.length > 0 ? (
            <>
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Objective
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {campaigns
                    .filter((campaign) => statusFilter === 'ALL' || campaign.status === statusFilter)
                    .map((campaign) => (
                    <tr key={campaign._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {campaign.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {campaign.objective}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            campaign.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Link
                          to={`/adsets/${campaign._id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Adsets
                        </Link>
                        <Link
                          to={`/adsets/create?campaignId=${campaign._id}`}
                          className="text-green-600 hover:text-green-900"
                        >
                          Create Adset
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">No campaigns found for this account.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Campaigns;

