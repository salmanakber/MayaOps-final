"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import axios, { AxiosError } from "axios"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
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

  // Filter out admin roles - only show OWNER, CLEANER, MANAGER
  const allowedRoles = ["OWNER", "CLEANER", "MANAGER"]
  const nonAdminUsers = useMemo(() => {
    return users.filter((user) => allowedRoles.includes(user.role))
  }, [users])

  // Group users by company and role for tree view
  const groupedUsers = useMemo(() => {
    const grouped: Record<number, {
      company: { id: number; name: string } | null
      owners: User[]
      managers: User[]
      cleaners: User[]
    }> = {}

    nonAdminUsers.forEach((user) => {
      const companyId = user.companyId || 0
      if (!grouped[companyId]) {
        grouped[companyId] = {
          company: user.company && user.companyId ? { id: user.companyId, name: user.company.name } : null,
          owners: [],
          managers: [],
          cleaners: [],
        }
      }

      if (user.role === "OWNER") {
        grouped[companyId].owners.push(user)
      } else if (user.role === "MANAGER") {
        grouped[companyId].managers.push(user)
      } else if (user.role === "CLEANER") {
        grouped[companyId].cleaners.push(user)
      }
    })

    return grouped
  }, [nonAdminUsers])

  // Optimized Filtering using useMemo
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    return nonAdminUsers.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(term) ||
        user.firstName?.toLowerCase().includes(term) ||
        user.lastName?.toLowerCase().includes(term)
      
      const matchesRole = roleFilter === "all" || user.role === roleFilter
      
      return matchesSearch && matchesRole
    })
  }, [nonAdminUsers, searchTerm, roleFilter])

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
      <ProtectedPage>
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
                <option value="OWNER">Owner</option>
                <option value="MANAGER">Manager</option>
                <option value="CLEANER">Cleaner</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tree View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
             <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
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

                  {/* Owners */}
                  {group.owners.map((owner) => (
                    <div key={owner.id} className="mb-4">
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center">
                            <span className="text-blue-700 font-bold text-sm">O</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {owner.firstName || owner.lastName ? `${owner.firstName} ${owner.lastName}` : "Unnamed Owner"}
                              </span>
                              <RoleBadge role={owner.role} />
                              <StatusBadge isActive={owner.isActive} />
                            </div>
                            <span className="text-sm text-gray-500">{owner.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(owner)} className="text-cyan-600 hover:text-cyan-900 text-sm font-medium">
                            Edit
                          </button>
                          <button 
                            onClick={() => toggleStatus(owner)}
                            className={`${owner.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} text-sm font-medium`}
                          >
                            {owner.isActive ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>

                      {/* Managers under this owner */}
                      {group.managers.filter(m => m.companyId === owner.companyId || (!m.companyId && !owner.companyId)).length > 0 && (
                        <div className="ml-8 mt-2 space-y-2">
                          {group.managers.filter(m => m.companyId === owner.companyId || (!m.companyId && !owner.companyId)).map((manager) => (
                            <div key={manager.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center">
                                  <span className="text-amber-700 font-bold text-xs">M</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">
                                      {manager.firstName || manager.lastName ? `${manager.firstName} ${manager.lastName}` : "Unnamed Manager"}
                                    </span>
                                    <RoleBadge role={manager.role} />
                                    <StatusBadge isActive={manager.isActive} />
                                  </div>
                                  <span className="text-xs text-gray-500">{manager.email}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => openEditModal(manager)} className="text-cyan-600 hover:text-cyan-900 text-xs font-medium">
                                  Edit
                                </button>
                                <button 
                                  onClick={() => toggleStatus(manager)}
                                  className={`${manager.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} text-xs font-medium`}
                                >
                                  {manager.isActive ? "Disable" : "Enable"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Cleaners under this owner */}
                      {group.cleaners.filter(c => c.companyId === owner.companyId || (!c.companyId && !owner.companyId)).length > 0 && (
                        <div className="ml-8 mt-2 space-y-2">
                          {group.cleaners.filter(c => c.companyId === owner.companyId || (!c.companyId && !owner.companyId)).map((cleaner) => (
                            <div key={cleaner.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-300 flex items-center justify-center">
                                  <span className="text-gray-700 font-bold text-xs">C</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">
                                      {cleaner.firstName || cleaner.lastName ? `${cleaner.firstName} ${cleaner.lastName}` : "Unnamed Cleaner"}
                                    </span>
                                    <RoleBadge role={cleaner.role} />
                                    <StatusBadge isActive={cleaner.isActive} />
                                  </div>
                                  <span className="text-xs text-gray-500">{cleaner.email}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => openEditModal(cleaner)} className="text-cyan-600 hover:text-cyan-900 text-xs font-medium">
                                  Edit
                                </button>
                                <button 
                                  onClick={() => toggleStatus(cleaner)}
                                  className={`${cleaner.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} text-xs font-medium`}
                                >
                                  {cleaner.isActive ? "Disable" : "Enable"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Standalone Managers (without owner in same company) */}
                  {group.managers.filter(m => !group.owners.some(o => (o.companyId === m.companyId) || (!o.companyId && !m.companyId))).map((manager) => (
                    <div key={manager.id} className="mb-2">
                      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center">
                            <span className="text-amber-700 font-bold text-xs">M</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {manager.firstName || manager.lastName ? `${manager.firstName} ${manager.lastName}` : "Unnamed Manager"}
                              </span>
                              <RoleBadge role={manager.role} />
                              <StatusBadge isActive={manager.isActive} />
                            </div>
                            <span className="text-xs text-gray-500">{manager.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(manager)} className="text-cyan-600 hover:text-cyan-900 text-xs font-medium">
                            Edit
                          </button>
                          <button 
                            onClick={() => toggleStatus(manager)}
                            className={`${manager.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} text-xs font-medium`}
                          >
                            {manager.isActive ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Standalone Cleaners (without owner in same company) */}
                  {group.cleaners.filter(c => !group.owners.some(o => (o.companyId === c.companyId) || (!o.companyId && !c.companyId))).map((cleaner) => (
                    <div key={cleaner.id} className="mb-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-300 flex items-center justify-center">
                            <span className="text-gray-700 font-bold text-xs">C</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {cleaner.firstName || cleaner.lastName ? `${cleaner.firstName} ${cleaner.lastName}` : "Unnamed Cleaner"}
                              </span>
                              <RoleBadge role={cleaner.role} />
                              <StatusBadge isActive={cleaner.isActive} />
                            </div>
                            <span className="text-xs text-gray-500">{cleaner.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(cleaner)} className="text-cyan-600 hover:text-cyan-900 text-xs font-medium">
                            Edit
                          </button>
                          <button 
                            onClick={() => toggleStatus(cleaner)}
                            className={`${cleaner.isActive ? "text-amber-600 hover:text-amber-800" : "text-green-600 hover:text-green-800"} text-xs font-medium`}
                          >
                            {cleaner.isActive ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              No users found matching your criteria.
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
      </ProtectedPage>
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
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="OWNER">Owner</option>
                  <option value="MANAGER">Manager</option>
                  <option value="CLEANER">Cleaner</option>
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