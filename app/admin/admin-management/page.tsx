"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Shield,
  CheckCircle2,
  X,
  Search,
  Save,
  AlertCircle,
  Key,
  Lock,
  Loader2,
  MoreVertical
} from "lucide-react"

import { usePermissions  } from "@/lib/hooks/usePermissions"
import { initializePermissions } from "@/lib/permissions"
import RequirePermission from "@/components/RequirePermission"
// --- Types ---

interface AdminUser {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: string
  isActive: boolean
  isHeadSuperAdmin: boolean
  createdAt: string
  company?: { id: number; name: string }
  adminPermissions?: Array<{
    permission: { id: number; key: string; name: string; category: string }
  }>
}

interface Permission {
  id: number
  key: string
  name: string
  description?: string
  category: string
}

// --- Sub-Components ---

const UserAvatar = ({ first, last, email }: { first?: string, last?: string, email: string }) => {
  const initials = first && last 
    ? `${first[0]}${last[0]}`.toUpperCase() 
    : email.substring(0, 2).toUpperCase()

  return (
    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm ring-2 ring-white shadow-sm">
      {initials}
    </div>
  )
}

const PermissionSelector = ({ 
  groupedPermissions, 
  selectedPermissions, 
  togglePermission, 
  disabled 
}: any) => {
  if (disabled) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
        <Shield className="text-green-600" size={24} />
        <div>
          <p className="text-sm font-semibold text-green-900">Full Access Granted</p>
          <p className="text-xs text-green-700">Head Super Admins automatically inherit all permissions.</p>
        </div>
      </div>
    )
  }

  // Check if groupedPermissions is empty or undefined
  if (!groupedPermissions || Object.keys(groupedPermissions).length === 0) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
        <AlertCircle className="text-yellow-600" size={24} />
        <div>
          <p className="text-sm font-semibold text-yellow-900">No Permissions Available</p>
          <p className="text-xs text-yellow-700">
            Permissions have not been initialized. Please contact a system administrator to initialize permissions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
      {Object.entries(groupedPermissions).map(([category, perms]: [string, any]) => (
        <div key={category} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Key size={12} /> {category}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {perms && perms.length > 0 ? (
              perms.map((perm: Permission) => (
                <label
                  key={perm.id}
                  className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-all ${
                    selectedPermissions.includes(perm.key)
                      ? "bg-white border-indigo-200 shadow-sm"
                      : "border-transparent hover:bg-white hover:border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(perm.key)}
                    onChange={() => togglePermission(perm.key)}
                    className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 leading-tight">{perm.name}</div>
                    {perm.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{perm.description}</div>
                    )}
                  </div>
                </label>
              ))
            ) : (
              <p className="text-xs text-gray-400 col-span-2">No permissions in this category</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const AdminUserForm = ({ 
  initialData, 
  onSubmit, 
  onCancel, 
  groupedPermissions, 
  isSubmitting,
  currentUserId,
  isCurrentUserHeadAdmin
}: any) => {
  const isEditingSelf = currentUserId && initialData && currentUserId === initialData.id
  const [formData, setFormData] = useState({
    email: initialData?.email || "",
    password: "",
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    isHeadSuperAdmin: initialData?.isHeadSuperAdmin || false,
    permissions: initialData?.permissions || [], // Simplified array of keys
  })
 

  const togglePermission = (key: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p: string) => p !== key)
        : [...prev.permissions, key]
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              required
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              placeholder="admin@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {initialData ? "New Password (Optional)" : "Password"}
            </label>
            <input
              required={!initialData}
              type="password"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              placeholder={initialData ? "Leave blank to keep current" : "••••••••"}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={e => setFormData({...formData, firstName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={e => setFormData({...formData, lastName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <label className={`relative flex items-start gap-3 p-3 rounded-lg border transition-colors ${
          isEditingSelf && initialData?.isHeadSuperAdmin
            ? "border-yellow-200 bg-yellow-50 cursor-not-allowed opacity-60"
            : "border-gray-200 hover:bg-gray-50 cursor-pointer"
        }`}>
          <input
            type="checkbox"
            checked={formData.isHeadSuperAdmin}
            onChange={e => setFormData({...formData, isHeadSuperAdmin: e.target.checked})}
            disabled={isEditingSelf && initialData?.isHeadSuperAdmin}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div>
            <span className="block text-sm font-medium text-gray-900">Head Super Admin</span>
            <span className="block text-xs text-gray-500">
              {isEditingSelf && initialData?.isHeadSuperAdmin
                ? "You cannot change your own Head Super Admin status."
                : "Check this to grant full system access. Only one Head Super Admin is recommended."}
            </span>
          </div>
        </label>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-sm font-medium text-gray-900 mb-3">Permissions</label>
        
        {isEditingSelf && initialData?.isHeadSuperAdmin ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="text-yellow-600" size={24} />
            <div>
              <p className="text-sm font-semibold text-yellow-900">Cannot Modify Own Permissions</p>
              <p className="text-xs text-yellow-700">
                As a Head Super Admin, you cannot modify your own permissions. Please ask another Head Super Admin to make changes.
              </p>
            </div>
          </div>
        ) : (
          <PermissionSelector 
            groupedPermissions={groupedPermissions}
            selectedPermissions={formData.permissions}
            togglePermission={togglePermission}
            disabled={formData.isHeadSuperAdmin}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {initialData ? "Save Changes" : "Create Administrator"}
        </button>
      </div>
    </form>
  )
}

// --- Main Page Component ---

export default function AdminManagementPage() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, Permission[]>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentUser, setCurrentUser] = useState<{ id: number; isHeadSuperAdmin: boolean } | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  
  // Modal State
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Feedback State
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [permissionsEmpty, setPermissionsEmpty] = useState(false)

  useEffect(() => {
    loadCurrentUser()
    loadData()
  }, [])

  const loadCurrentUser = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        const user = response.data.data.user
        setCurrentUser({
          id: user.id,
          isHeadSuperAdmin: user.isHeadSuperAdmin || false
        })
        
        // Check if user is head super admin
        if (!user.isHeadSuperAdmin) {
          setAccessDenied(true)
          setError("Access denied. Only Head Super Admins can manage admin users.")
        }
      }
    } catch (err: any) {
      console.error("Error loading current user:", err)
      setAccessDenied(true)
      setError("Failed to verify access. Please refresh the page.")
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

      const [usersRes, permissionsRes] = await Promise.all([
        axios.get("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
        axios.get("/api/admin/permissions", { headers: { Authorization: `Bearer ${token}` } }),
      ])
      
      if (usersRes.data.success) {
        
        setAdminUsers(usersRes.data.data)
      } else {
        setError(usersRes.data.message || "Failed to load admin users")
      }

      if (permissionsRes.data.success) {
        const grouped = permissionsRes.data.data?.grouped || {}
        if (Object.keys(grouped).length === 0) {
          setPermissionsEmpty(true)
          setError("No permissions found. Please initialize permissions first.")
        } else {
          setPermissionsEmpty(false)
          setGroupedPermissions(grouped)
        }
      } else {
        const errorMsg = permissionsRes.data.message || "Failed to load permissions"
        setError(errorMsg)
        setPermissionsEmpty(true)
        console.error("Permissions API error:", permissionsRes.data)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || "Failed to load system data"
      setError(errorMsg)
      if (err.response?.status === 403 || err.response?.status === 401) {
        setPermissionsEmpty(true)
      }
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleInitializePermissions = async () => {
    try {
      setIsSubmitting(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      const response = await axios.post("/api/admin/init-permissions", {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (response.data.success) {
        setSuccess("Permissions initialized successfully")
        setPermissionsEmpty(false)
        loadData() // Reload to get the new permissions
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to initialize permissions")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFormSubmit = async (formData: any) => {
    try {
      setIsSubmitting(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      if (modalMode === "create") {
        const response = await axios.post("/api/admin/users", formData, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.data.success) {
          setSuccess("Administrator created successfully")
          closeModal()
          loadData()
        }
      } else if (modalMode === "edit" && editingUser) {
        const updateData = { ...formData }
        if (!updateData.password) delete updateData.password
        
        const response = await axios.patch(`/api/admin/users/${editingUser.id}`, updateData, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.data.success) {
          setSuccess("Administrator updated successfully")
          closeModal()
          loadData()
        }
      }
      
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to ${modalMode} admin user`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (userId: number) => {
    if (!confirm("Are you sure you want to deactivate this admin user? This action cannot be easily undone.")) return

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.delete(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setSuccess("User deactivated successfully")
        loadData()
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to deactivate user")
    }
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setModalMode("create")
  }

  const openEditModal = (user: AdminUser) => {
    // Prevent head super admin from editing themselves
    if (currentUser && currentUser.id === user.id && user.isHeadSuperAdmin) {
      setError("You cannot modify your own permissions or status. Please ask another Head Super Admin to make changes.")
      return
    }
    
    // Transform user data to match form expectations
    const formReadyUser = {
      ...user,
      permissions: user.adminPermissions?.map(ap => ap.permission.key) || []
    }
    setEditingUser(formReadyUser as any)
    setModalMode("edit")
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingUser(null)
    setError("")
  }

  const filteredUsers = adminUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Show access denied message if user is not head super admin
  if (accessDenied || (currentUser && !currentUser.isHeadSuperAdmin)) {
    return (
      <AdminLayout>
        <div className="max-w-7xl mx-auto space-y-6 pb-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-red-600" size={24} />
              <div>
                <h2 className="text-lg font-semibold text-red-900">Access Denied</h2>
                <p className="text-sm text-red-700 mt-1">
                  Only Head Super Admins can access the Admin Management page. Please contact a Head Super Admin if you need access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <ProtectedPage>
        <div className="max-w-7xl mx-auto space-y-6 pb-12">
          {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Users className="text-indigo-600" size={26} />
              Admin Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage system administrators, roles, and access controls. (Head Super Admin Only)</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Administrator
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
            {permissionsEmpty && (
              <button
                onClick={handleInitializePermissions}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Key size={14} />
                    Initialize Permissions
                  </>
                )}
              </button>
            )}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={18} className="flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Search & Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-transparent border-none rounded-lg focus:ring-0 text-sm"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
               {[1, 2, 3].map(i => (
                 <div key={i} className="flex items-center space-x-4 animate-pulse">
                   <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                   <div className="flex-1 space-y-2">
                     <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                     <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                   </div>
                 </div>
               ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User Profile</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role & Status</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Access Scope</th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <Users className="text-gray-300 mb-2" size={32} />
                          <p>No administrators found matching your search.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <UserAvatar first={user.firstName} last={user.lastName} email={user.email} />
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : "Unnamed Admin"}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1.5">
                            {user.isHeadSuperAdmin ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                <Shield size={10} className="mr-1" /> Head Super Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {user.role.replace("_", " ")}
                              </span>
                            )}
                            <div className={`flex items-center gap-1.5 text-xs ${user.isActive ? "text-green-600" : "text-gray-500"}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                              {user.isActive ? "Active Account" : "Inactive"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs">
                            {user.isHeadSuperAdmin ? (
                              <span className="text-xs text-gray-500 italic">Global access enabled</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {user.adminPermissions && user.adminPermissions.length > 0 ? (
                                  <>
                                    {user.adminPermissions.slice(0, 3).map((ap) => (
                                      <span key={ap.permission.id} className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 border border-gray-200">
                                        {ap.permission.name}
                                      </span>
                                    ))}
                                    {user.adminPermissions.length > 3 && (
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-50 text-gray-500 border border-gray-200">
                                        +{user.adminPermissions.length - 3}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-400">Restricted Access</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(user)}
                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit User"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Deactivate User"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Unified Modal */}
        {modalMode && (
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  {modalMode === "create" ? "Add New Administrator" : "Edit Administrator"}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-500 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar">
                <AdminUserForm
                  initialData={modalMode === "edit" ? editingUser : null}
                  groupedPermissions={groupedPermissions}
                  onSubmit={handleFormSubmit}
                  onCancel={closeModal}
                  isSubmitting={isSubmitting}
                  currentUserId={currentUser?.id}
                  isCurrentUserHeadAdmin={currentUser?.isHeadSuperAdmin}
                />
              </div>
            </div>
          </div>
        )}
        </div>
      </ProtectedPage>
    </AdminLayout>
  )
}