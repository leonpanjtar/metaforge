import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Adsets from './pages/Adsets';
import AdsetCreator from './pages/AdsetCreator';
import AdsetEditor from './pages/AdsetEditor';
import AssetManager from './pages/AssetManager';
import CopyGenerator from './pages/CopyGenerator';
import CreativeGenerator from './pages/CreativeGenerator';
import Combinations from './pages/Combinations';
import Deployment from './pages/Deployment';
import WinningAds from './pages/WinningAds';
import Performance from './pages/Performance';
import AccountManagement from './pages/AccountManagement';
import Layout from './components/Layout';

const queryClient = new QueryClient();

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="adsets/:campaignId" element={<Adsets />} />
            <Route path="adsets/create" element={<AdsetCreator />} />
            <Route path="adsets/edit/:adsetId" element={<AdsetEditor />} />
            <Route path="assets/:adsetId" element={<AssetManager />} />
            <Route path="copy/:adsetId" element={<CopyGenerator />} />
            <Route path="creative/:adsetId" element={<CreativeGenerator />} />
            <Route path="combinations/:adsetId" element={<Combinations />} />
            <Route path="deployment/:adsetId" element={<Deployment />} />
            <Route path="performance/:adsetId" element={<Performance />} />
            <Route path="winning-ads" element={<WinningAds />} />
            <Route path="account/:accountId" element={<AccountManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

