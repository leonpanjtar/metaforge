import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HiChevronDown, HiCheck } from 'react-icons/hi2';
import api from '../services/api';

interface FacebookAccount {
  _id: string;
  accountId: string;
  accountName: string;
  isActive: boolean;
}

interface ActiveAccount {
  activeAccount: {
    _id: string;
    accountId: string;
    accountName: string;
  } | null;
  activePage: {
    id: string;
    name: string;
  } | null;
}

const FacebookAccountSwitcher = () => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: activeAccount } = useQuery<ActiveAccount>({
    queryKey: ['facebook-active-account'],
    queryFn: async () => {
      const response = await api.get('/facebook/active');
      return response.data;
    },
  });

  const { data: accounts } = useQuery<FacebookAccount[]>({
    queryKey: ['facebook-accounts'],
    queryFn: async () => {
      const response = await api.get('/facebook/accounts');
      return response.data;
    },
    enabled: showDropdown, // Only fetch when dropdown is open
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchAccount = async (accountId: string) => {
    try {
      // Get pages for this account
      const accountsWithPages = await api.get('/facebook/accounts/selection');
      const account = accountsWithPages.data.find((acc: any) => acc._id === accountId);
      
      if (!account) {
        alert('Account not found');
        return;
      }

      // If account has pages, use the first one; otherwise set without page
      const pageId = account.pages && account.pages.length > 0 ? account.pages[0].id : undefined;
      const pageName = account.pages && account.pages.length > 0 ? account.pages[0].name : undefined;

      await api.post('/facebook/active', {
        accountId,
        pageId,
        pageName,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['facebook-active-account'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['winning-ads'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });

      setShowDropdown(false);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to switch Facebook account');
    }
  };

  const handleConnect = async () => {
    try {
      const response = await api.get('/facebook/auth-url');
      window.location.href = response.data.authUrl;
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to initiate Facebook connection');
    }
  };

  if (!activeAccount) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 border border-blue-200"
      >
        Connect Facebook
      </button>
    );
  }

  if (!activeAccount.activeAccount) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200"
      >
        Select Facebook Account
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200"
      >
        <span className="max-w-[200px] truncate">
          {activeAccount.activeAccount.accountName}
          {activeAccount.activePage && ` • ${activeAccount.activePage.name}`}
        </span>
        <HiChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="p-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-1 mb-1">
              Facebook Account
            </div>
            {accounts && accounts.length > 0 ? (
              <>
                {accounts.map((account) => (
                  <button
                    key={account._id}
                    onClick={() => handleSwitchAccount(account._id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
                      activeAccount.activeAccount?._id === account._id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{account.accountName}</div>
                      <div className="text-xs text-gray-500 truncate">{account.accountId}</div>
                    </div>
                    {activeAccount.activeAccount?._id === account._id && (
                      <HiCheck className="w-4 h-4 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <button
                    onClick={handleConnect}
                    className="w-full text-left px-3 py-2 rounded text-sm text-blue-600 hover:bg-blue-50"
                  >
                    + Connect Another Account
                  </button>
                </div>
              </>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No Facebook accounts found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FacebookAccountSwitcher;

