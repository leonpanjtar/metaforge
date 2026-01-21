import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

interface AccountWithPages {
  _id: string;
  accountId: string;
  accountName: string;
  pages: Array<{ id: string; name: string }>;
}

const FacebookAccountSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [accounts, setAccounts] = useState<AccountWithPages[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await api.get('/facebook/accounts/selection');
        setAccounts(response.data);
        
        // Auto-select first account if only one
        if (response.data.length === 1) {
          setSelectedAccountId(response.data[0]._id);
          if (response.data[0].pages.length === 1) {
            setSelectedPageId(response.data[0].pages[0].id);
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load Facebook accounts');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();

    // Check if we're coming from OAuth callback
    const connected = searchParams.get('connected');
    if (connected) {
      // Show success message after a brief delay
      setTimeout(() => {
        // Message will be shown in the UI
      }, 500);
    }
  }, [searchParams]);

  const selectedAccount = accounts.find((acc) => acc._id === selectedAccountId);
  const availablePages = selectedAccount?.pages || [];

  const handleSave = async () => {
    if (!selectedAccountId) {
      setError('Please select a Facebook ad account');
      return;
    }

    if (!selectedPageId && availablePages.length > 0) {
      setError('Please select a Facebook page');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const selectedPage = availablePages.find((p) => p.id === selectedPageId);
      await api.post('/facebook/active', {
        accountId: selectedAccountId,
        pageId: selectedPageId || undefined,
        pageName: selectedPage?.name || undefined,
      });

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save selection');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading Facebook accounts...</div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow max-w-md">
          <h2 className="text-xl font-semibold mb-4">No Facebook Accounts Found</h2>
          <p className="text-gray-600 mb-4">
            No Facebook ad accounts were found. Please try connecting again.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isFromOAuth = searchParams.get('connected') === 'true';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-lg shadow max-w-2xl w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Facebook Account & Page</h2>
        <p className="text-gray-600 mb-6">
          {isFromOAuth 
            ? 'Facebook connection successful! Choose which Facebook ad account and page you want to use for this workspace.'
            : 'Choose which Facebook ad account and page you want to use for this workspace.'}
        </p>

        {isFromOAuth && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            ✓ Successfully connected to Facebook! Please select your ad account and page below.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Ad Account Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Facebook Ad Account <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setSelectedPageId(''); // Reset page selection when account changes
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select an account...</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.accountName} ({account.accountId})
                </option>
              ))}
            </select>
          </div>

          {/* Page Selection */}
          {selectedAccount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Facebook Page {availablePages.length > 0 && <span className="text-red-500">*</span>}
              </label>
              {availablePages.length === 0 ? (
                <div className="text-sm text-gray-500 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  No Facebook pages found for this account. You can still proceed, but you'll need to connect a page later.
                </div>
              ) : (
                <select
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select a page...</option>
                  {availablePages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !selectedAccountId || (availablePages.length > 0 && !selectedPageId)}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacebookAccountSelection;

