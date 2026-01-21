import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { HiUserPlus, HiEnvelope, HiPencil, HiXMark, HiTrash } from 'react-icons/hi2';

interface AccountMember {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

interface Invitation {
  _id: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: {
    name: string;
    email: string;
  };
  expiresAt: string;
  createdAt: string;
}

type Tab = 'members' | 'invitations';

const AccountManagement = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { currentAccount, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('members');
  
  // Add User states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'member'>('member');
  
  // Invite User states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  
  // Edit User states
  const [editingUser, setEditingUser] = useState<AccountMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const { data: members, refetch: refetchMembers } = useQuery<AccountMember[]>({
    queryKey: ['account-members', accountId],
    queryFn: async () => {
      const response = await api.get(`/accounts/${accountId}/members`);
      return response.data;
    },
    enabled: !!accountId,
  });

  const { data: invitations, refetch: refetchInvitations } = useQuery<Invitation[]>({
    queryKey: ['account-invitations', accountId],
    queryFn: async () => {
      const response = await api.get(`/accounts/${accountId}/invitations`);
      return response.data;
    },
    enabled: !!accountId && (currentAccount?.role === 'owner' || currentAccount?.role === 'admin'),
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await api.post(`/accounts/${accountId}/members`, data);
      return response.data;
    },
    onSuccess: () => {
      refetchMembers();
      setNewUserEmail('');
      setNewUserRole('member');
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await api.post(`/accounts/${accountId}/invitations`, data);
      return response.data;
    },
    onSuccess: () => {
      refetchInvitations();
      setInviteEmail('');
      setInviteRole('member');
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.delete(`/accounts/${accountId}/members/${userId}`);
      return response.data;
    },
    onSuccess: () => {
      refetchMembers();
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await api.delete(`/accounts/${accountId}/invitations/${invitationId}`);
      return response.data;
    },
    onSuccess: () => {
      refetchInvitations();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await api.put(`/accounts/${accountId}/members/${userId}/role`, { role });
      return response.data;
    },
    onSuccess: () => {
      refetchMembers();
    },
  });

  const updateUserProfileMutation = useMutation({
    mutationFn: async ({ userId, name, email }: { userId: string; name: string; email: string }) => {
      const response = await api.put(`/accounts/users/${userId}`, { name, email });
      return response.data;
    },
    onSuccess: () => {
      refetchMembers();
      setEditingUser(null);
      setEditName('');
      setEditEmail('');
    },
  });

  const handleAddUser = () => {
    if (!newUserEmail.trim()) {
      alert('Please enter a user email');
      return;
    }
    addUserMutation.mutate({ email: newUserEmail.trim(), role: newUserRole });
  };

  const handleInviteUser = () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address');
      return;
    }
    inviteUserMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const handleEditUser = (member: AccountMember) => {
    setEditingUser(member);
    setEditName(member.name);
    setEditEmail(member.email);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    if (!editName.trim()) {
      alert('Name is required');
      return;
    }
    updateUserProfileMutation.mutate({
      userId: editingUser._id,
      name: editName.trim(),
      email: editEmail.trim(),
    });
  };

  const canManageUsers = currentAccount?.role === 'owner' || currentAccount?.role === 'admin';
  const canEditSelf = (member: AccountMember) => member._id === user?.id;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Account Management</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage users and permissions for {currentAccount?.name}
        </p>
      </div>

      {!canManageUsers && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            You don't have permission to manage users. Only owners and admins can add or remove users.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('members')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Members
          </button>
          {canManageUsers && (
            <button
              onClick={() => setActiveTab('invitations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'invitations'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Invitations
            </button>
          )}
        </nav>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <>
          {/* Add User Section */}
          {canManageUsers && (
            <div className="bg-white rounded-lg shadow mb-6 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HiUserPlus className="w-5 h-5" />
                Add Existing User
              </h2>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    User Email
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddUser();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    User must already have an account. They will receive immediate access.
                  </p>
                </div>
                <div className="w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'member')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddUser}
                    disabled={addUserMutation.isPending || !newUserEmail.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addUserMutation.isPending ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Members</h2>
              {members && members.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Joined
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {members.map((member) => (
                        <tr key={member._id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {editingUser?._id === member._id ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              />
                            ) : (
                              member.name
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {editingUser?._id === member._id ? (
                              <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              />
                            ) : (
                              member.email
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {editingUser?._id === member._id ? (
                              <span className="text-sm text-gray-500">Editing...</span>
                            ) : canManageUsers && member.role !== 'owner' ? (
                              <select
                                value={member.role}
                                onChange={(e) => {
                                  updateRoleMutation.mutate({
                                    userId: member._id,
                                    role: e.target.value,
                                  });
                                }}
                                className="text-sm rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                            ) : (
                              <span className="text-sm text-gray-900 capitalize">{member.role}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {new Date(member.joinedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                            {editingUser?._id === member._id ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={updateUserProfileMutation.isPending}
                                  className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingUser(null);
                                    setEditName('');
                                    setEditEmail('');
                                  }}
                                  className="text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                {(canEditSelf(member) || canManageUsers) && (
                                  <button
                                    onClick={() => handleEditUser(member)}
                                    className="text-blue-600 hover:text-blue-900"
                                    title="Edit user"
                                  >
                                    <HiPencil className="w-4 h-4" />
                                  </button>
                                )}
                                {canManageUsers && member.role !== 'owner' && (
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Remove ${member.name} from this account?`)) {
                                        removeUserMutation.mutate(member._id);
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-900"
                                    title="Remove user"
                                  >
                                    <HiTrash className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No members found.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && canManageUsers && (
        <>
          {/* Invite User Section */}
          <div className="bg-white rounded-lg shadow mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <HiEnvelope className="w-5 h-5" />
              Invite New User
            </h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleInviteUser();
                    }
                  }}
                />
                <p className="mt-1 text-xs text-gray-500">
                  User will receive an invitation email. They can register or login to accept.
                </p>
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleInviteUser}
                  disabled={inviteUserMutation.isPending || !inviteEmail.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviteUserMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </div>
          </div>

          {/* Invitations List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Invitations</h2>
              {invitations && invitations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Invited By
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Expires
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invitations.map((invitation) => {
                        const expiresAt = new Date(invitation.expiresAt);
                        const isExpired = expiresAt < new Date();
                        return (
                          <tr key={invitation._id} className={isExpired ? 'opacity-50' : ''}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {invitation.email}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-gray-900 capitalize">{invitation.role}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {invitation.invitedBy.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {expiresAt.toLocaleDateString()}
                              {isExpired && <span className="ml-2 text-red-600">(Expired)</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                              <button
                                onClick={() => {
                                  if (window.confirm('Cancel this invitation?')) {
                                    cancelInvitationMutation.mutate(invitation._id);
                                  }
                                }}
                                className="text-red-600 hover:text-red-900"
                                title="Cancel invitation"
                              >
                                <HiXMark className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No pending invitations.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Error Messages */}
      {addUserMutation.isError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            {(addUserMutation.error as any)?.response?.data?.error || 'Failed to add user'}
          </p>
        </div>
      )}
      {inviteUserMutation.isError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            {(inviteUserMutation.error as any)?.response?.data?.error || 'Failed to send invitation'}
          </p>
        </div>
      )}
    </div>
  );
};

export default AccountManagement;
