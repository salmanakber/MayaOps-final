'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { 
  Search, 
  User as UserIcon, 
  Shield, 
  Briefcase, 
  CheckCircle2, 
  XCircle, 
  Download,
  Loader2,
  Trash2,
  Mail,
  Phone,
  Edit,
  ChevronDown,
  ChevronRight,
  Plus
} from 'lucide-react';
import RequirePermission from "@/components/RequirePermission"
import { PERMISSIONS } from "@/lib/permissions"
import { usePermissions } from "@/lib/hooks/usePermissions"

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

interface Company {
  id: number;
  name: string;
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
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedOwners, setExpandedOwners] = useState<Set<number>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    role: 'CLEANER' as 'OWNER' | 'MANAGER' | 'CLEANER',
    companyId: '',
    isActive: true,
  });
  const { hasPermission, hasAnyPermission } = usePermissions()


  useEffect(() => {
    loadUsers();
    loadCompanies();
  }, [filter, statusFilter]);

  // Toast Handler
  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch('/api/companies', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setCompanies(data.data?.companies || data.data || []);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        let usersList = data.data || [];
        
        // Filter out admin roles - only show OWNER, CLEANER, MANAGER
        const allowedRoles = ['OWNER', 'CLEANER', 'MANAGER'];
        usersList = usersList.filter((u: User) => allowedRoles.includes(u.role));

        // Status filter: active vs archived
        if (statusFilter === 'active') {
          usersList = usersList.filter((u: User) => u.isActive);
        } else if (statusFilter === 'archived') {
          usersList = usersList.filter((u: User) => !u.isActive);
        }
        
        // Role filter
        if (filter !== 'all') {
          usersList = usersList.filter((u: User) => u.role === filter);
        }
        
        // Search filter
        if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          usersList = usersList.filter((u: User) => 
            u.email.toLowerCase().includes(lowerTerm) ||
            u.firstName?.toLowerCase().includes(lowerTerm) ||
            u.lastName?.toLowerCase().includes(lowerTerm) ||
            (u.company?.name || '').toLowerCase().includes(lowerTerm)
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

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      role: user.role as 'OWNER' | 'MANAGER' | 'CLEANER',
      companyId: user.companyId?.toString() || '',
      isActive: user.isActive,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;

    try {
      setProcessingId(selectedUser.id);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          role: formData.role,
          companyId: formData.companyId ? parseInt(formData.companyId) : null,
          isActive: formData.isActive,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        showToast('User updated successfully', 'success');
        setShowEditModal(false);
        setSelectedUser(null);
        loadUsers();
      } else {
        showToast(data.message || 'Failed to update user', 'error');
      }
    } catch (error) {
      showToast('Connection error', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;

    try {
      setProcessingId(selectedUser.id);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        showToast('User deleted successfully', 'success');
        setShowDeleteModal(false);
        setSelectedUser(null);
        loadUsers();
      } else {
        showToast(data.message || 'Failed to delete user', 'error');
      }
    } catch (error) {
      showToast('Connection error', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const toggleOwnerExpanded = (ownerId: number) => {
    setExpandedOwners(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ownerId)) {
        newSet.delete(ownerId);
      } else {
        newSet.add(ownerId);
      }
      return newSet;
    });
  };

  // Helper for role styles
  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'MANAGER': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'CLEANER': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      default: return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  // Group users by company for tree view
  const groupedUsers = useMemo(() => {
    const grouped: Record<number, {
      company: { id: number; name: string } | null;
      owners: User[];
      managers: User[];
      cleaners: User[];
    }> = {};

    users.forEach((user) => {
      const companyId = user.companyId || 0;
      if (!grouped[companyId]) {
        grouped[companyId] = {
          company: user.company || null,
          owners: [],
          managers: [],
          cleaners: [],
        };
      }

      if (user.role === 'OWNER') {
        grouped[companyId].owners.push(user);
      } else if (user.role === 'MANAGER') {
        grouped[companyId].managers.push(user);
      } else if (user.role === 'CLEANER') {
        grouped[companyId].cleaners.push(user);
      }
    });

    return grouped;
  }, [users]);

  return (
    <RequirePermission permissions={[PERMISSIONS.USERS_VIEW]}>
    <AdminLayout>
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
            <StatCard label="Owners" value={users.filter(u => u.role === 'OWNER').length} icon={<Shield className="text-purple-600" />} />
            <StatCard label="Managers" value={users.filter(u => u.role === 'MANAGER').length} icon={<Briefcase className="text-indigo-600" />} />
            <StatCard label="Cleaners" value={users.filter(u => u.role === 'CLEANER').length} icon={<UserIcon className="text-emerald-600" />} />
          </div>

          {/* Filters & Search */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
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

            {/* Status Filter Tabs (Active / Archived / All) */}
            <div className="flex p-1 bg-gray-100 rounded-lg overflow-x-auto">
              {(['active', 'archived', 'all'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`
                    px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap
                    ${statusFilter === s
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }
                  `}
                >
                  {s === 'active' && 'Active Users'}
                  {s === 'archived' && 'Archived Users'}
                  {s === 'all' && 'All Statuses'}
                </button>
              ))}
            </div>
          </div>

          {/* Tree View */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse space-y-3">
                    <div className="h-6 w-48 bg-gray-200 rounded" />
                    <div className="ml-4 space-y-2">
                      <div className="h-16 bg-gray-200 rounded-lg" />
                      <div className="ml-8 h-12 bg-gray-200 rounded-lg" />
                      <div className="ml-8 h-12 bg-gray-200 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : Object.keys(groupedUsers).length > 0 ? (
              <div className="divide-y divide-gray-200">
                {Object.entries(groupedUsers).map(([companyId, group]) => (
                  <div key={companyId} className="p-6">
                    {/* Company Header */}
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {group.company?.name || `Company ID: ${companyId}`}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {group.owners.length} Owner(s), {group.managers.length} Manager(s), {group.cleaners.length} Cleaner(s)
                      </p>
                    </div>

                    {/* Owners with Expandable Tree */}
                    {group.owners.map((owner) => {
                      const isExpanded = expandedOwners.has(owner.id);
                      const ownerManagers = group.managers.filter(m => m.companyId === owner.companyId || (!m.companyId && !owner.companyId));
                      const ownerCleaners = group.cleaners.filter(c => c.companyId === owner.companyId || (!c.companyId && !owner.companyId));
                      const hasChildren = ownerManagers.length > 0 || ownerCleaners.length > 0;

                      return (
                        <div key={owner.id} className="mb-4">
                          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-3 flex-1">
                              {hasChildren && (
                                <button
                                  onClick={() => toggleOwnerExpanded(owner.id)}
                                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronDown size={20} className="text-blue-600" />
                                  ) : (
                                    <ChevronRight size={20} className="text-blue-600" />
                                  )}
                                </button>
                              )}
                              {!hasChildren && <div className="w-6" />}
                              <Avatar user={owner} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {owner.firstName && owner.lastName ? `${owner.firstName} ${owner.lastName}` : 'Unnamed Owner'}
                                  </span>
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                    {owner.role}
                                  </Badge>
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    owner.isActive 
                                      ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                                      : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${owner.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                                    {owner.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                                  <span className="flex items-center gap-1"><Mail size={10} /> {owner.email}</span>
                                  {owner.phone && <span className="flex items-center gap-1"><Phone size={10} /> {owner.phone}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {hasPermission(PERMISSIONS.USERS_EDIT) && (
                              <button
                                onClick={() => handleEdit(owner)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Edit User"
                              >
                                <Edit size={18} />
                              </button>
                              )}
                              <button 
                                onClick={() => handleToggleActive(owner)}
                                disabled={processingId === owner.id}
                                className={`p-1.5 rounded-md transition-colors ${
                                  owner.isActive 
                                    ? 'text-red-500 hover:bg-red-50' 
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                                title={owner.isActive ? "Deactivate User" : "Activate User"}
                              >
                                {processingId === owner.id ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                  owner.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                                )}
                              </button>
                              {hasPermission(PERMISSIONS.USERS_DELETE) && (
                              <button
                                onClick={() => {
                                  setSelectedUser(owner);
                                  setShowDeleteModal(true);
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete User"
                              >
                                <Trash2 size={18} />
                              </button>
                              )}
                            </div>
                          </div>

                          {/* Expandable Children */}
                          {isExpanded && hasChildren && (
                            <div className="ml-8 mt-2 space-y-2">
                              {/* Managers */}
                              {ownerManagers.map((manager) => (
                                <div key={manager.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className="w-6" />
                                    <Avatar user={manager} />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900">
                                          {manager.firstName && manager.lastName ? `${manager.firstName} ${manager.lastName}` : 'Unnamed Manager'}
                                        </span>
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                          {manager.role}
                                        </Badge>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          manager.isActive 
                                            ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                                            : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                                        }`}>
                                          <span className={`h-1.5 w-1.5 rounded-full ${manager.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                                          {manager.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                                        <span className="flex items-center gap-1"><Mail size={10} /> {manager.email}</span>
                                        {manager.phone && <span className="flex items-center gap-1"><Phone size={10} /> {manager.phone}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hasPermission(PERMISSIONS.USERS_EDIT) && (
                                    <button
                                      onClick={() => handleEdit(manager)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                      title="Edit User"
                                    >
                                      <Edit size={18} />
                                    </button>
                                    )}
                                    {hasPermission(PERMISSIONS.USERS_EDIT) && (
                                    
                                    <button 
                                      onClick={() => handleToggleActive(manager)}
                                      disabled={processingId === manager.id}
                                      className={`p-1.5 rounded-md transition-colors ${
                                        manager.isActive 
                                          ? 'text-red-500 hover:bg-red-50' 
                                          : 'text-green-600 hover:bg-green-50'
                                      }`}
                                      title={manager.isActive ? "Deactivate User" : "Activate User"}
                                    >
                                      {processingId === manager.id ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                      ) : (
                                        manager.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                                      )}
                                    </button>
                                    )}
                                    {hasPermission(PERMISSIONS.USERS_DELETE) && (
                                    <button
                                      onClick={() => {
                                        setSelectedUser(manager);
                                        setShowDeleteModal(true);
                                      }}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                      title="Delete User"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Cleaners */}
                              {ownerCleaners.map((cleaner) => (
                                <div key={cleaner.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className="w-6" />
                                    <Avatar user={cleaner} />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900">
                                          {cleaner.firstName && cleaner.lastName ? `${cleaner.firstName} ${cleaner.lastName}` : 'Unnamed Cleaner'}
                                        </span>
                                        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                                          {cleaner.role}
                                        </Badge>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          cleaner.isActive 
                                            ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                                            : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                                        }`}>
                                          <span className={`h-1.5 w-1.5 rounded-full ${cleaner.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                                          {cleaner.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                                        <span className="flex items-center gap-1"><Mail size={10} /> {cleaner.email}</span>
                                        {cleaner.phone && <span className="flex items-center gap-1"><Phone size={10} /> {cleaner.phone}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hasPermission(PERMISSIONS.USERS_EDIT) && (
                                    <button
                                      onClick={() => handleEdit(cleaner)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                      title="Edit User"
                                    >
                                      <Edit size={18} />
                                    </button>
                                    )}
                                    {hasPermission(PERMISSIONS.USERS_EDIT) && (
                                    <button 
                                      onClick={() => handleToggleActive(cleaner)}
                                      disabled={processingId === cleaner.id}
                                      className={`p-1.5 rounded-md transition-colors ${
                                        cleaner.isActive 
                                          ? 'text-red-500 hover:bg-red-50' 
                                          : 'text-green-600 hover:bg-green-50'
                                      }`}
                                      title={cleaner.isActive ? "Deactivate User" : "Activate User"}
                                    >
                                      {processingId === cleaner.id ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                      ) : (
                                        cleaner.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                                      )}
                                    </button>
                                    )}
                                    {hasPermission(PERMISSIONS.USERS_DELETE) && (
                                   
                                    <button
                                      onClick={() => {
                                        setSelectedUser(cleaner);
                                        setShowDeleteModal(true);
                                      }}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                      title="Delete User"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                     )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Standalone Managers (without owner in same company) */}
                    {group.managers.filter(m => !group.owners.some(o => (o.companyId === m.companyId) || (!o.companyId && !m.companyId))).map((manager) => (
                      <div key={manager.id} className="mb-2">
                        <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-6" />
                            <Avatar user={manager} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {manager.firstName && manager.lastName ? `${manager.firstName} ${manager.lastName}` : 'Unnamed Manager'}
                                </span>
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                  {manager.role}
                                </Badge>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  manager.isActive 
                                    ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                                    : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${manager.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                                  {manager.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                                <span className="flex items-center gap-1"><Mail size={10} /> {manager.email}</span>
                                {manager.phone && <span className="flex items-center gap-1"><Phone size={10} /> {manager.phone}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasPermission(PERMISSIONS.USERS_EDIT) && (
                            <button
                              onClick={() => handleEdit(manager)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Edit User"
                            >
                              <Edit size={18} />
                            </button>
                            )}
                            {hasPermission(PERMISSIONS.USERS_EDIT) && (
                            <button 
                              onClick={() => handleToggleActive(manager)}
                              disabled={processingId === manager.id}
                              className={`p-1.5 rounded-md transition-colors ${
                                manager.isActive 
                                  ? 'text-red-500 hover:bg-red-50' 
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={manager.isActive ? "Deactivate User" : "Activate User"}
                            >
                              {processingId === manager.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                manager.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                              )}
                            </button>
                            )}
                            {hasPermission(PERMISSIONS.USERS_DELETE) && (
                            <button
                              onClick={() => {
                                setSelectedUser(manager);
                                setShowDeleteModal(true);
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete User"
                            >
                              <Trash2 size={18} />
                            </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Standalone Cleaners (without owner in same company) */}
                    {group.cleaners.filter(c => !group.owners.some(o => (o.companyId === c.companyId) || (!o.companyId && !c.companyId))).map((cleaner) => (
                      <div key={cleaner.id} className="mb-2">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-6" />
                            <Avatar user={cleaner} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {cleaner.firstName && cleaner.lastName ? `${cleaner.firstName} ${cleaner.lastName}` : 'Unnamed Cleaner'}
                                </span>
                                <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                                  {cleaner.role}
                                </Badge>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  cleaner.isActive 
                                    ? 'bg-green-100 text-green-700 ring-1 ring-green-600/20' 
                                    : 'bg-red-100 text-red-700 ring-1 ring-red-600/20'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${cleaner.isActive ? 'bg-green-600' : 'bg-red-600'}`} />
                                  {cleaner.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="flex flex-col text-xs text-gray-500 mt-0.5 space-y-0.5">
                                <span className="flex items-center gap-1"><Mail size={10} /> {cleaner.email}</span>
                                {cleaner.phone && <span className="flex items-center gap-1"><Phone size={10} /> {cleaner.phone}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasPermission(PERMISSIONS.USERS_EDIT) && (
                            <button
                              onClick={() => handleEdit(cleaner)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Edit User"
                            >
                              <Edit size={18} />
                            </button>
                            )}
                            {hasPermission(PERMISSIONS.USERS_EDIT) && (
                            <button 
                              onClick={() => handleToggleActive(cleaner)}
                              disabled={processingId === cleaner.id}
                              className={`p-1.5 rounded-md transition-colors ${
                                cleaner.isActive 
                                  ? 'text-red-500 hover:bg-red-50' 
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={cleaner.isActive ? "Deactivate User" : "Activate User"}
                            >
                              {processingId === cleaner.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                cleaner.isActive ? <XCircle size={18} /> : <CheckCircle2 size={18} />
                              )}
                            </button>
                            )}
                            {hasPermission(PERMISSIONS.USERS_DELETE) && (
                            <button
                              onClick={() => {
                                setSelectedUser(cleaner);
                                setShowDeleteModal(true);
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete User"
                            >
                              <Trash2 size={18} />
                            </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-4">
                  <UserIcon className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-900">No users found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
              </div>
            )}
            {!loading && users.length > 0 && (
              <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
                <span className="text-xs text-gray-500">Showing {users.length} results</span>
              </div>
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {showEditModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Edit User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'OWNER' | 'MANAGER' | 'CLEANER' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="MANAGER">Manager</option>
                    <option value="CLEANER">Cleaner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No Company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active</label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={processingId === selectedUser.id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {processingId === selectedUser.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Delete User</h2>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete <strong>{selectedUser.firstName && selectedUser.lastName ? `${selectedUser.firstName} ${selectedUser.lastName}` : selectedUser.email}</strong>? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={processingId === selectedUser.id}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {processingId === selectedUser.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
    </RequirePermission>
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
