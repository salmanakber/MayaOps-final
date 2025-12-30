"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  Users, 
  Building2, 
  CreditCard, 
  Settings, 
  Edit2, 
  Trash2, 
  Plus,
  Search,
  Loader2,
  X,
  Save,
  AlertCircle
} from "lucide-react"
import { UserRole } from "@prisma/client"

interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: UserRole
  companyId?: number
  company?: { id: number; name: string }
  isActive: boolean
  createdAt: string
}

interface BillingRecord {
  id: number
  companyId: number
  company?: { id: number; name: string }
  stripeCustomerId?: string
  subscriptionId?: string
  status: string
  amountPaid: number
  amountDue: number
  billingDate?: string
  nextBillingDate?: string
  createdAt: string
}

interface SystemSetting {
  id: number
  key: string
  value: string
  category: string
  description?: string
  isEncrypted: boolean
  updatedAt: string
}

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "billings" | "settings">("users")
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  
  const [users, setUsers] = useState<User[]>([])
  const [billings, setBillings] = useState<BillingRecord[]>([])
  const [settings, setSettings] = useState<SystemSetting[]>([])
  
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [error, setError] = useState("")

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setError("")
    
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      if (activeTab === "users") {
        const response = await axios.get("/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.data.success) {
          setUsers(response.data.data.users || [])
        }
      } else if (activeTab === "billings") {
        const response = await axios.get("/api/admin/billing", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.data.success) {
          setBillings(response.data.data || [])
        }
      } else if (activeTab === "settings") {
        const response = await axios.get("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.data.success) {
          setSettings(response.data.data || [])
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setEditData({ ...item })
  }

  const handleSave = async () => {
    if (!editingId) return

    setLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      if (activeTab === "users") {
        await axios.patch(`/api/users/${editingId}`, editData, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else if (activeTab === "billings") {
        await axios.patch(`/api/admin/billing/${editingId}`, editData, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else if (activeTab === "settings") {
        await axios.patch(`/api/admin/settings/${editingId}`, editData, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }

      setEditingId(null)
      setEditData({})
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to save changes")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return

    setLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      if (activeTab === "users") {
        await axios.delete(`/api/users/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else if (activeTab === "billings") {
        await axios.delete(`/api/admin/billing/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else if (activeTab === "settings") {
        await axios.delete(`/api/admin/settings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }

      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete")
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      user.email.toLowerCase().includes(search) ||
      user.firstName?.toLowerCase().includes(search) ||
      user.lastName?.toLowerCase().includes(search) ||
      user.role.toLowerCase().includes(search)
    )
  })

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Super Admin Panel</h1>
          <p className="text-gray-600 mt-1">Manage all users, billings, and system settings</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="text-red-600" size={20} />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === "users"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Users className="inline mr-2" size={18} />
              Users
            </button>
            <button
              onClick={() => setActiveTab("billings")}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === "billings"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <CreditCard className="inline mr-2" size={18} />
              Billings
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === "settings"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Settings className="inline mr-2" size={18} />
              Settings
            </button>
          </div>
        </div>

        {/* Search */}
        {activeTab === "users" && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Content */}
        {loading && !users.length && !billings.length && !settings.length ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {activeTab === "users" && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      {editingId === user.id ? (
                        <>
                          <td className="px-6 py-4">
                            <input
                              type="email"
                              value={editData.email}
                              onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={editData.firstName || ""}
                              onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                              placeholder="First Name"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-1"
                            />
                            <input
                              type="text"
                              value={editData.lastName || ""}
                              onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                              placeholder="Last Name"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={editData.role}
                              onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {Object.values(UserRole).map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.company?.name || "N/A"}
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={editData.isActive}
                              onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={handleSave}
                                className="text-green-600 hover:text-green-800"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null)
                                  setEditData({})
                                }}
                                className="text-gray-600 hover:text-gray-800"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.firstName} {user.lastName}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-medium">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.company?.name || "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              user.isActive 
                                ? "bg-green-100 text-green-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(user)}
                                className="text-indigo-600 hover:text-indigo-800"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(user.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === "billings" && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Due</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Billing</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {billings.map((billing) => (
                    <tr key={billing.id}>
                      {editingId === billing.id ? (
                        <>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {billing.company?.name || "N/A"}
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={editData.status}
                              onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="active">Active</option>
                              <option value="trialing">Trialing</option>
                              <option value="canceled">Canceled</option>
                              <option value="past_due">Past Due</option>
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              step="0.01"
                              value={editData.amountPaid}
                              onChange={(e) => setEditData({ ...editData, amountPaid: parseFloat(e.target.value) })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              step="0.01"
                              value={editData.amountDue}
                              onChange={(e) => setEditData({ ...editData, amountDue: parseFloat(e.target.value) })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {billing.nextBillingDate ? new Date(billing.nextBillingDate).toLocaleDateString() : "N/A"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button onClick={handleSave} className="text-green-600 hover:text-green-800">
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null)
                                  setEditData({})
                                }}
                                className="text-gray-600 hover:text-gray-800"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {billing.company?.name || "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              billing.status === "active" 
                                ? "bg-green-100 text-green-800"
                                : billing.status === "trialing"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-red-100 text-red-800"
                            }`}>
                              {billing.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            £{Number(billing.amountPaid).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            £{Number(billing.amountDue).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {billing.nextBillingDate ? new Date(billing.nextBillingDate).toLocaleDateString() : "N/A"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(billing)}
                                className="text-indigo-600 hover:text-indigo-800"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(billing.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === "settings" && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {settings.map((setting) => (
                    <tr key={setting.id}>
                      {editingId === setting.id ? (
                        <>
                          <td className="px-6 py-4 text-sm text-gray-900">{setting.key}</td>
                          <td className="px-6 py-4">
                            <textarea
                              value={editData.value}
                              onChange={(e) => setEditData({ ...editData, value: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              rows={3}
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{setting.category}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button onClick={handleSave} className="text-green-600 hover:text-green-800">
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null)
                                  setEditData({})
                                }}
                                className="text-gray-600 hover:text-gray-800"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-gray-900">{setting.key}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {setting.isEncrypted ? "***ENCRYPTED***" : setting.value.substring(0, 100)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{setting.category}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(setting)}
                                className="text-indigo-600 hover:text-indigo-800"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(setting.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

