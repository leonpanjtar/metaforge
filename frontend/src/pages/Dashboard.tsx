import { Link } from 'react-router-dom';

const Dashboard = () => {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your Facebook Ads campaigns and optimize performance
        </p>
      </div>

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

        <div className="block p-6 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>
          <p className="mt-2 text-sm text-gray-600">Coming soon</p>
        </div>

        <div className="block p-6 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <p className="mt-2 text-sm text-gray-600">Coming soon</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

