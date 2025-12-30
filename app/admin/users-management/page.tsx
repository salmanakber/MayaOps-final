'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  User as UserIcon, 
  Shield, 
  Briefcase, 
  CheckCircle2, 
  XCircle, 
  Download,
  Loader2,
  Trash2,
  Mail,
  Phone
} from 'lucide-react';

// --- Interfaces ---
interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
  isActive: boolean;
  createdAt: string;
  phone?: string;
  profileImage?: string;
  _count?: {
    tasks: number;
    photos: number;
  };
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// --- Components ---

const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
    {children}
  </span>
);

const Avatar = ({ user }: { user: User }) => {
  const initials = (user.firstName?.[0] || user.email[0] || '?').toUpperCase();
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500'];
  const colorIndex = user.id % colors.length;

  if (user.profileImage) {
    return <img className="h-10 w-10 rounded-full object-cover border border-gray-200" src={user.profileImage} alt="Profile" />;
  }

  return (
    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-medium shadow-sm ${colors[colorIndex]}`}>
      {initials}
    </div>
  );
};

export default function AdminUsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'OWNER' | 'MANAGER' | 'CLEANER'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    loadUsers();
  }, [filter]);

  // Toast Handler
  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      // In a real app, you would pass filter/search as query params here
      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        let usersList = data.data || [];
        
        // Client-side filtering (Simulated)
        if (filter !== 'all') {
          usersList = usersList.filter((u: User) => u.role === filter);
        }
        
        if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          usersList = usersList.filter((u: User) => 
            u.email.toLowerCase().includes(lowerTerm) ||
            u.firstName?.toLowerCase().includes(lowerTerm) ||
            u.lastName?.toLowerCase().includes(lowerTerm)
          );
        }
        setUsers(usersList);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      setProcessingId(user.id);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Optimistic update
        setUsers(users.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
        showToast(`User ${!user.isActive ? 'activated' : 'deactivated'} successfully`, 'success');
      } else {
        showToast(data.message || 'Failed to update user', 'error');
      }
    } catch (error) {
      showToast('Connection error', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Helper for role styles
  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'COMPANY_ADMIN': return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'MANAGER': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'CLEANER': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {toast.message}
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Team Members</h1>
            <p className="mt-1 text-sm text-gray-500">Manage permissions, access, and account status.</p>
          </div>
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={users.length} icon={<UserIcon className="text-blue-600" />} />
          <StatCard label="Owners" value={users.filter(u => u.role.includes('OWNER') || u.role.includes('ADMIN')).length} icon={<Shield className="text-purple-600" />} />
          <StatCard label="Managers" value={users.filter(u => u.role === 'MANAGER').length} icon={<Briefcase className="text-indigo-600" />} />
          <StatCard label="Cleaners" value={users.filter(u => u.role === 'CLEANER').length} icon={<UserIcon className="text-emerald-600" />} />
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Search */}
            <div className="relative flex-1 max-w-lg">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by name, email, or company..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); loadUsers(); }}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-lg overflow-x-auto">
              {(['all', 'OWNER', 'MANAGER', 'CLEANER'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap
                    ${filter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }
                  `}
                >
                  {f === 'all' ? 'View All' : f.charAt(0) + f.slice(1).toLowerCase() + 's'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User Profile</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role & Company</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  // Skeleton Loading State
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="flex gap-3"><div className="h-10 w-10 bg-gray-200 rounded-full" /><div className="space-y-2"><div className="h-4 w-32 bg-gray-200 rounded" /><div className="h-3 w-24 bg-gray-200 rounded" /></div></div></td>
                      <td className="px-6 py-4"><div className="space-y-2"><div className="h-4 w-20 bg-gray-200 rounded" /><div className="h-3 w-16 bg-gray-200 rounded" /></div></td>
                      <td className="px-6 py-4"><div className="h-4 w-8 bg-gray-200 rounded mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 bg-gray-200 rounded-full mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-4 bg-gray-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  // Empty State
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-4">
                        <UserIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <h3 className="text-sm font-medium text-gray-900">No users found</h3>
                      <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Avatar user={user} />
                          <div className="ml-4">
                            <div className="text-sm font-semibold text-gray-900">
                              {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'No Name'}
                            </div>
                            <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                              <span className="flex items-center gap-1"><Mail size={10} /> {user.email}</span>
                              {user.phone && <span className="flex items-center gap-1"><Phone size={10} /> {user.phone}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <Badge className={getRoleStyle(user.role)}>
                            {user.role}
                          </Badge>
                          <span className="text-xs text-gray-500 font-medium ml-1">
                            {user.company?.name || 'No Company'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-center justify-center gap-1">
                           <div className="text-sm font-medium text-gray-700">{user._count?.tasks || 0} Tasks</div>
                           <div className="text-xs text-gray-400">Created {new Date(user.createdAt).toLocaleDateString()}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive 
                            ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                            : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                            onClick={() => handleToggleActive(user)}
                            disabled={processingId === user.id}
                            className={`p-1.5 rounded-md transition-colors ${
                              user.isActive 
                                ? 'text-red-500 hover:bg-red-50' 
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={user.isActive ? "Deactivate User" : "Activate User"}
                          >
                            {processingId === user.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              user.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                            )}
                          </button>
                          <button className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-md">
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">Showing {users.length} results</span>
            {/* Pagination placeholder */}
            <div className="flex gap-1">
              <button className="px-2 py-1 text-xs border rounded bg-white text-gray-400" disabled>Previous</button>
              <button className="px-2 py-1 text-xs border rounded bg-white text-gray-400" disabled>Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub Component: Simple Stat Card
function StatCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-5 flex items-center">
      <div className="flex-shrink-0 p-3 rounded-lg bg-gray-50 border border-gray-100">
        {icon}
      </div>
      <div className="ml-5">
        <dt className="text-sm font-medium text-gray-500 truncate">{label}</dt>
        <dd className="mt-1 text-xl font-bold text-gray-900">{value}</dd>
      </div>
    </div>
  );
}