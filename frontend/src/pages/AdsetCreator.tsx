import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface Campaign {
  _id: string;
  name: string;
}

interface Adset {
  _id: string;
  name: string;
  budget: number;
  targeting: {
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    locations?: string[];
    interests?: string[];
    behaviors?: string[];
    detailedTargeting?: string[];
    placements?: string[];
  };
  schedule?: {
    startTime?: string;
    endTime?: string;
  };
  campaignId?: string | { _id: string };
}

const AdsetCreator = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignIdParam = searchParams.get('campaignId');
  const templateId = searchParams.get('templateId');

  const [formData, setFormData] = useState({
    campaignId: campaignIdParam || '',
    name: '',
    budget: '',
    ageMin: '',
    ageMax: '',
    genders: [] as number[],
    locations: [] as string[],
    interests: [] as string[],
    behaviors: [] as string[],
    detailedTargeting: [] as string[],
    placements: [] as string[],
    startDate: '',
    endDate: '',
  });

  const [interestsInput, setInterestsInput] = useState('');
  const [behaviorsInput, setBehaviorsInput] = useState('');
  const [detailedTargetingInput, setDetailedTargetingInput] = useState('');
  const [locationsInput, setLocationsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load template adset if templateId is provided
  const { data: templateAdset } = useQuery<Adset>({
    queryKey: ['adset', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const response = await api.get(`/adsets/${templateId}`);
      return response.data;
    },
    enabled: !!templateId,
  });

  useEffect(() => {
    if (campaignIdParam) {
      setFormData((prev) => ({ ...prev, campaignId: campaignIdParam }));
    }
  }, [campaignIdParam]);

  // Populate form with template data when loaded
  useEffect(() => {
    if (templateAdset) {
      const templateCampaignId = typeof templateAdset.campaignId === 'object' 
        ? templateAdset.campaignId._id 
        : templateAdset.campaignId || '';
      
      setFormData({
        campaignId: campaignIdParam || templateCampaignId,
        name: `${templateAdset.name} (Copy)`,
        budget: templateAdset.budget.toString(),
        ageMin: templateAdset.targeting.ageMin?.toString() || '',
        ageMax: templateAdset.targeting.ageMax?.toString() || '',
        genders: templateAdset.targeting.genders || [],
        locations: templateAdset.targeting.locations || [],
        interests: templateAdset.targeting.interests || [],
        behaviors: templateAdset.targeting.behaviors || [],
        detailedTargeting: templateAdset.targeting.detailedTargeting || [],
        placements: templateAdset.targeting.placements || [],
        startDate: templateAdset.schedule?.startTime
          ? new Date(templateAdset.schedule.startTime).toISOString().slice(0, 16)
          : '',
        endDate: templateAdset.schedule?.endTime
          ? new Date(templateAdset.schedule.endTime).toISOString().slice(0, 16)
          : '',
      });
    }
  }, [templateAdset, campaignIdParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const targeting = {
        ageMin: formData.ageMin ? parseInt(formData.ageMin) : undefined,
        ageMax: formData.ageMax ? parseInt(formData.ageMax) : undefined,
        genders: formData.genders.length > 0 ? formData.genders : undefined,
        locations: formData.locations.length > 0 ? formData.locations : undefined,
        interests: formData.interests.length > 0 ? formData.interests : undefined,
        behaviors: formData.behaviors.length > 0 ? formData.behaviors : undefined,
        detailedTargeting:
          formData.detailedTargeting.length > 0 ? formData.detailedTargeting : undefined,
        placements: formData.placements.length > 0 ? formData.placements : undefined,
      };

      const schedule = {
        startTime: formData.startDate ? new Date(formData.startDate) : undefined,
        endTime: formData.endDate ? new Date(formData.endDate) : undefined,
      };

      const response = await api.post('/adsets', {
        campaignId: formData.campaignId,
        name: formData.name,
        budget: parseFloat(formData.budget),
        targeting,
        schedule: formData.startDate || formData.endDate ? schedule : undefined,
      });

      navigate(`/adsets/edit/${response.data._id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create adset');
    } finally {
      setLoading(false);
    }
  };

  const addToList = (
    value: string,
    list: string[],
    setter: (items: string[]) => void,
    inputSetter: (val: string) => void
  ) => {
    if (value.trim() && !list.includes(value.trim())) {
      setter([...list, value.trim()]);
      inputSetter('');
    }
  };

  const removeFromList = (item: string, list: string[], setter: (items: string[]) => void) => {
    setter(list.filter((i) => i !== item));
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Create Adset</h1>
        {templateAdset && (
          <p className="mt-2 text-sm text-blue-600">
            Using "{templateAdset.name}" as template
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Campaign ID
          </label>
          <input
            type="text"
            required
            value={formData.campaignId}
            onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter campaign ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Adset Name</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter adset name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Daily Budget ($)
          </label>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={formData.budget}
            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Min Age</label>
            <input
              type="number"
              min="18"
              max="65"
              value={formData.ageMin}
              onChange={(e) => setFormData({ ...formData, ageMin: e.target.value })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Age</label>
            <input
              type="number"
              min="18"
              max="65"
              value={formData.ageMax}
              onChange={(e) => setFormData({ ...formData, ageMax: e.target.value })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
          <div className="space-x-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={formData.genders.includes(1)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({
                      ...formData,
                      genders: [...formData.genders, 1],
                    });
                  } else {
                    setFormData({
                      ...formData,
                      genders: formData.genders.filter((g) => g !== 1),
                    });
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">Male</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={formData.genders.includes(2)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({
                      ...formData,
                      genders: [...formData.genders, 2],
                    });
                  } else {
                    setFormData({
                      ...formData,
                      genders: formData.genders.filter((g) => g !== 2),
                    });
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">Female</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Locations</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={locationsInput}
              onChange={(e) => setLocationsInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addToList(
                    locationsInput,
                    formData.locations,
                    (items) => setFormData({ ...formData, locations: items }),
                    setLocationsInput
                  );
                }
              }}
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter location (e.g., United States)"
            />
            <button
              type="button"
              onClick={() =>
                addToList(
                  locationsInput,
                  formData.locations,
                  (items) => setFormData({ ...formData, locations: items }),
                  setLocationsInput
                )
              }
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.locations.map((location) => (
              <span
                key={location}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
              >
                {location}
                <button
                  type="button"
                  onClick={() =>
                    removeFromList(
                      location,
                      formData.locations,
                      (items) => setFormData({ ...formData, locations: items })
                    )
                  }
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={interestsInput}
              onChange={(e) => setInterestsInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addToList(
                    interestsInput,
                    formData.interests,
                    (items) => setFormData({ ...formData, interests: items }),
                    setInterestsInput
                  );
                }
              }}
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter interest"
            />
            <button
              type="button"
              onClick={() =>
                addToList(
                  interestsInput,
                  formData.interests,
                  (items) => setFormData({ ...formData, interests: items }),
                  setInterestsInput
                )
              }
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
              >
                {interest}
                <button
                  type="button"
                  onClick={() =>
                    removeFromList(
                      interest,
                      formData.interests,
                      (items) => setFormData({ ...formData, interests: items })
                    )
                  }
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Placements</label>
          <div className="space-y-2">
            {[
              'feed',
              'right_column',
              'instant_article',
              'instream_video',
              'stories',
              'reels',
            ].map((placement) => (
              <label key={placement} className="inline-flex items-center mr-4">
                <input
                  type="checkbox"
                  checked={formData.placements.includes(placement)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({
                        ...formData,
                        placements: [...formData.placements, placement],
                      });
                    } else {
                      setFormData({
                        ...formData,
                        placements: formData.placements.filter((p) => p !== placement),
                      });
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 capitalize">{placement.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Adset'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdsetCreator;
