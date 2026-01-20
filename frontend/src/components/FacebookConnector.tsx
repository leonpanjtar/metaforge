import { useState } from 'react';
import api from '../services/api';

interface FacebookConnectorProps {
  onConnected?: () => void;
}

const FacebookConnector = ({ onConnected }: FacebookConnectorProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/facebook/auth-url');
      window.location.href = response.data.authUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate Facebook connection');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Connect Facebook Account</h3>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      <button
        onClick={handleConnect}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Connecting...' : 'Connect Facebook'}
      </button>
    </div>
  );
};

export default FacebookConnector;

