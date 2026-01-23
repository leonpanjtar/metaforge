import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { HiChevronDown, HiCog6Tooth } from 'react-icons/hi2';
import api from '../services/api';

const Layout = () => {
  const { user, currentAccount, logout, switchAccount, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { path: '/', label: 'Campaigns' },
    { path: '/winning-ads', label: 'Winning Ads' },
  ];

  // Add account management link if user has a current account and is admin/owner
  const canManageUsers = currentAccount && (currentAccount.role === 'owner' || currentAccount.role === 'admin');
  if (canManageUsers && currentAccount) {
    navItems.push({ path: `/account/${currentAccount._id}`, label: 'User Management' });
    navItems.push({ path: '/prompt-tester', label: 'Prompt Tester' });
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      alert('Please enter an account name');
      return;
    }
    setCreatingAccount(true);
    try {
      const response = await api.post('/accounts', { name: newAccountName.trim() });
      await refreshUser();
      switchAccount(response.data);
      setNewAccountName('');
      setShowCreateAccount(false);
      setShowAccountDropdown(false);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  MetaForge
                </h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      location.pathname === item.path
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Account Switcher */}
              {user?.accounts && user.accounts.length > 0 && (
                <div className="relative" ref={accountDropdownRef}>
                  <button
                    onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200"
                  >
                    <span>{currentAccount?.name || 'Select Account'}</span>
                    <HiChevronDown className="w-4 h-4" />
                  </button>
                  
                  {showAccountDropdown && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                      <div className="p-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-1">
                          Accounts
                        </div>
                        {user.accounts.map((account) => (
                          <button
                            key={account._id}
                            onClick={() => {
                              switchAccount(account);
                              setShowAccountDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                              currentAccount?._id === account._id
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{account.name}</span>
                              <span className="text-xs text-gray-500 capitalize">{account.role}</span>
                            </div>
                          </button>
                        ))}
                        <div className="border-t border-gray-200 mt-2 pt-2 space-y-1">
                          {canManageUsers && currentAccount && (
                            <button
                              onClick={() => {
                                navigate(`/account/${currentAccount._id}`);
                                setShowAccountDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <HiCog6Tooth className="w-4 h-4" />
                              Manage Account
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setShowCreateAccount(true);
                              setShowAccountDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded text-sm text-blue-600 hover:bg-blue-50"
                          >
                            + Create New Account
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Dropdown */}
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  <span>{user?.name}</span>
                  <HiChevronDown className="w-4 h-4" />
                </button>
                
                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <div className="px-4 py-2 text-xs text-gray-500 border-b">
                        {user?.email}
                      </div>
                      <button
                        onClick={() => {
                          logout();
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Create Account Modal */}
            {showCreateAccount && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg max-w-md w-full p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Account</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Name
                      </label>
                      <input
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="Enter account name..."
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateAccount();
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => {
                          setShowCreateAccount(false);
                          setNewAccountName('');
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateAccount}
                        disabled={creatingAccount || !newAccountName.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingAccount ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;

