import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const AcceptInvitation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const token = searchParams.get('token');

  // Validate invitation token
  useEffect(() => {
    const validateInvitation = async () => {
      if (!token) {
        setError('Invalid invitation link. No token provided.');
        setLoading(false);
        return;
      }

      try {
        const response = await api.post('/accounts/invitations/accept', { token });
        setInvitation(response.data.invitation);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Invalid or expired invitation');
      } finally {
        setLoading(false);
      }
    };

    validateInvitation();
  }, [token]);

  // Auto-complete if user is logged in and already accepted
  useEffect(() => {
    const autoComplete = async () => {
      if (!authLoading && user && invitation && !accepting && !requiresPasswordSetup) {
        // Check if user's email matches invitation email
        if (user.email.toLowerCase() === invitation.email.toLowerCase()) {
          setAccepting(true);
          try {
            await api.post('/accounts/invitations/complete', { token });
            await refreshUser();
            navigate('/campaigns');
          } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to complete invitation');
            setAccepting(false);
          }
        }
      }
    };

    autoComplete();
  }, [authLoading, user, invitation, token, navigate, accepting, requiresPasswordSetup, refreshUser]);

  const handleAcceptInvitation = async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      const response = await api.post('/accounts/invitations/accept-and-create', { token });
      
      // Store token and log user in
      localStorage.setItem('token', response.data.token);
      
      // Check if password setup is required
      if (response.data.user.requiresPasswordSetup) {
        setRequiresPasswordSetup(true);
        setAccepting(false);
        // Pre-fill name if available
        if (response.data.user.name) {
          setName(response.data.user.name);
        }
        // Refresh user data
        await refreshUser();
      } else {
        // User already has password, complete invitation
        await refreshUser();
        await completeInvitation();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invitation');
      setAccepting(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSettingPassword(true);
    setError(null);

    try {
      await api.post('/accounts/setup-password', { password, name: name.trim() || undefined });
      setRequiresPasswordSetup(false);
      await refreshUser();
      // Now complete the invitation
      await completeInvitation();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to setup password');
    } finally {
      setSettingPassword(false);
    }
  };

  const completeInvitation = async () => {
    setAccepting(true);
    try {
      await api.post('/accounts/invitations/complete', { token });
      await refreshUser();
      navigate('/campaigns');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to complete invitation');
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
          <p className="text-sm text-gray-500 mb-4">Facebook Ads Management Platform</p>
          <div className="text-lg text-gray-600">Loading invitation...</div>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
            <p className="text-sm text-gray-500">Facebook Ads Management Platform</p>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Invitation Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
          <p className="text-sm text-gray-500 mb-4">Facebook Ads Management Platform</p>
          <div className="text-lg text-gray-600">No invitation found.</div>
        </div>
      </div>
    );
  }

  // Password setup form
  if (requiresPasswordSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
            <p className="text-sm text-gray-500">Facebook Ads Management Platform</p>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Set Up Your Account</h2>
          <p className="text-gray-600 mb-4">
            You've been invited to join <strong>{invitation.accountName}</strong> as a <strong>{invitation.role}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Please set a password and your name to complete your account setup.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSetupPassword} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                placeholder="Enter a password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={settingPassword}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium disabled:opacity-50"
            >
              {settingPassword ? 'Setting up...' : 'Complete Setup'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If user is logged in and email matches, show accepting message
  if (user && user.email.toLowerCase() === invitation.email.toLowerCase() && accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
          <p className="text-sm text-gray-500 mb-4">Facebook Ads Management Platform</p>
          <div className="text-lg text-gray-600">Accepting invitation...</div>
        </div>
      </div>
    );
  }

  // If user is logged in but email doesn't match
  if (user && user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
            <p className="text-sm text-gray-500">Facebook Ads Management Platform</p>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Email Mismatch</h2>
          <p className="text-gray-600 mb-4">
            This invitation was sent to <strong>{invitation.email}</strong>, but you are logged in as <strong>{user.email}</strong>.
          </p>
          <p className="text-gray-600 mb-4">
            Please log out and use the invitation link again.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              window.location.href = `/accept-invitation?token=${token}`;
            }}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 mb-2 font-medium"
          >
            Log Out and Continue
          </button>
          <button
            onClick={() => navigate('/campaigns')}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // User is not logged in - show accept invitation button
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">MetaForge</h1>
          <p className="text-sm text-gray-500">Facebook Ads Management Platform</p>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">You've been invited!</h2>
        <p className="text-gray-600 mb-4">
          You've been invited to join <strong>{invitation.accountName}</strong> as a <strong>{invitation.role}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Invitation sent to: <strong>{invitation.email}</strong>
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleAcceptInvitation}
          disabled={accepting}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium disabled:opacity-50"
        >
          {accepting ? 'Accepting...' : 'Accept Invitation'}
        </button>
      </div>
    </div>
  );
};

export default AcceptInvitation;
