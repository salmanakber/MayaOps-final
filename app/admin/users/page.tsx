"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import axios, { AxiosError } from "axios"
import AdminLayout from "@/components/AdminLayout"
// Ideally, use a library like 'lucide-react' for icons
// import { Edit, Trash2, Power, Plus, Search } from "lucide-react" 

// --- Types ---
interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: UserRole
  companyId?: number
  isActive: boolean
  createdAt: string
  company?: {
    name: string
  }
}

interface Company {
  id: number
  name: string
}

type UserRole = "SUPER_ADMIN" | "OWNER" | "DEVELOPER" | "COMPANY_ADMIN" | "MANAGER" | "CLEANER"

// --- API Helper ---
// In a real app, move this to @/lib/api.ts
const api = axios.create({
  baseURL: "/api",
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Custom Hook for User Logic ---
const useUserActions = () => {
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const params = selectedCompanyId ? { companyId: selectedCompanyId } : {}
      
      const { data } = await api.get("/users", { params })
      if (data.success) setUsers(data.data)
    } catch (error) {
      console.error("Failed to load users", error)
      // toast.error("Failed to load users") 
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteUser = async (userId: number) => {
    try {
      await api.delete(`/users/${userId}`)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      return true
    } catch (error) {
      console.error("Failed to delete", error)
      return false
    }
  }

  const toggleStatus = async (user: User) => {
    try {
      // Optimistic update
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
      )
      
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive })
    } catch (error) {
      console.error("Failed to update status", error)
      // Revert on failure
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: user.isActive } : u))
      )
    }
  }

  return { users, loading, fetchUsers, deleteUser, toggleStatus, setUsers }
}

// --- Main Component ---
export default function UserManagementPage() {
  const { users, loading, fetchUsers, deleteUser, toggleStatus } = useUserActions()
  
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Optimized Filtering using useMemo
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    return users.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(term) ||
        user.firstName?.toLowerCase().includes(term) ||
        user.lastName?.toLowerCase().includes(term)
      
      const matchesRole = roleFilter === "all" || user.role === roleFilter
      
      return matchesSearch && matchesRole
    })
  }, [users, searchTerm, roleFilter])

  const handleDeleteClick = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      await deleteUser(id)
    }
  }

  const openCreateModal = () => {
    setSelectedUser(null)
    setIsModalOpen(true)
  }

  const openEditModal = (user: User) => {
    setSelectedUser(user)
    setIsModalOpen(true)
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-1">Manage system access and permissions</p>
          </div>
          <button
            onClick={openCreateModal}
            className="mt-4 sm:mt-0 px-5 py-2.5 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 focus:ring-4 focus:ring-cyan-200 transition-all shadow-sm"
          >
            + Add New User
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Name or email..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white"
              >
                <option value="all">All Roles</option>
                {Object.keys(ROLE_COLORS).map(role => (
                   <option key={role} value={role}>{role.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
             <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["User Info", "Role", "Company", "Status", "Joined", "Actions"].map((head) => (
                      <th key={head} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900">
                            {user.firstName || user.lastName ? `${user.firstName} ${user.lastName}` : "Unnamed"}
                          </span>
                          <span className="text-sm text-gray-500">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {user.company?.name || <span className="text-gray-400 italic">None</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge isActive={user.isActive} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEditModal(user)} className="text-cyan-600 hover:text-cyan-900 font-medium">
                            Edit
                          </button>
                          <button 
                            onClick={() => toggleStatus(user)}
                            className={`${user.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} font-medium`}
                          >
                            {user.isActive ? "Disable" : "Enable"}
                          </button>
                          <button onClick={() => handleDeleteClick(user.id)} className="text-red-600 hover:text-red-900 font-medium">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No users found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Reusable User Form Modal */}
      {isModalOpen && (
        <UserFormModal
          user={selectedUser}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            fetchUsers()
          }}
        />
      )}
    </AdminLayout>
  )
}

// --- Sub-Components ---

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
  OWNER: "bg-blue-100 text-blue-800 border-blue-200",
  DEVELOPER: "bg-indigo-100 text-indigo-800 border-indigo-200",
  COMPANY_ADMIN: "bg-teal-100 text-teal-800 border-teal-200",
  MANAGER: "bg-amber-100 text-amber-800 border-amber-200",
  CLEANER: "bg-gray-100 text-gray-800 border-gray-200",
}

function RoleBadge({ role }: { role: string }) {
  const className = ROLE_COLORS[role] || "bg-gray-100 text-gray-800"
  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${className}`}>
      {role.replace("_", " ")}
    </span>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? "bg-green-600" : "bg-red-600"}`}></span>
      {isActive ? "Active" : "Inactive"}
    </span>
  )
}

// --- Unified Form Modal ---
interface UserFormModalProps {
  user: User | null
  onClose: () => void
  onSuccess: () => void
}

function UserFormModal({ user, onClose, onSuccess }: UserFormModalProps) {
  const isEditing = !!user
  
  const [formData, setFormData] = useState({
    email: user?.email || "",
    password: "", // Only for create
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    role: user?.role || "CLEANER",
    companyId: user?.companyId?.toString() || "",
    isActive: user?.isActive ?? true
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])

  useEffect(() => {
    // Load companies once when modal opens
    api.get("/admin/companies")
      .then(res => res.data.success && setCompanies(res.data.data))
      .catch(err => console.error("Failed loading companies", err))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    
    // Simple Validation
    if (!formData.companyId) {
      setError("Please select a company")
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...formData,
        companyId: parseInt(formData.companyId),
        // Don't send empty password string on update usually
        ...(isEditing ? { password: undefined } : {}) 
      }

      if (isEditing) {
        await api.patch(`/users/${user.id}`, payload)
      } else {
        await api.post("/users", payload)
      }
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.message || "Operation failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? "Edit User" : "Create New User"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">{error}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                disabled={isEditing}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <select
                  required
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">Select Company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  {Object.keys(ROLE_COLORS).map((role) => (
                    <option key={role} value={role}>{role.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>

            {isEditing && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">User Account Active</label>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex justify-center items-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                isEditing ? "Save Changes" : "Create User"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}