"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { ArrowLeft, Building2 } from "lucide-react"
import Link from "next/link"

interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  companyId?: number | null
}

export default function AddCompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    basePrice: "55.00",
    subscriptionStatus: "active",
    isTrialActive: true,
    trialDays: "14",
    userId: null as number | null,
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (response.data.success) {
        // Filter users without a company
        const usersWithoutCompany = (response.data.data.users || response.data.data || []).filter(
          (user: User) => !user.companyId
        )
        setUsers(usersWithoutCompany)
      }
    } catch (error) {
      console.error("Error loading users:", error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      // Calculate trial end date
      const trialEndsAt = formData.isTrialActive
        ? new Date(Date.now() + parseInt(formData.trialDays) * 24 * 60 * 60 * 1000)
        : null

      const response = await axios.post(
        "/api/admin/companies",
        {
          name: formData.name,
          basePrice: parseFloat(formData.basePrice),
          subscriptionStatus: formData.subscriptionStatus,
          isTrialActive: formData.isTrialActive,
          trialEndsAt: trialEndsAt?.toISOString(),
          userId: formData.userId || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (response.data.success) {
        router.push(`/admin/control-center/company/${response.data.data.id}`)
      } else {
        setError(response.data.error || "Failed to create company")
      }
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || "Failed to create company")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/control-center"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Control Center</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Building2 className="text-indigo-600" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Add New Company</h1>
              <p className="text-gray-600 mt-1">Create a new company account with subscription settings</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter company name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Base Price */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Base Monthly Price (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">Default monthly subscription fee</p>
            </div>

            {/* Subscription Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subscription Status
              </label>
              <select
                value={formData.subscriptionStatus}
                onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Assign User to Company */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Assign User to Company (Optional)
              </label>
              <select
                value={formData.userId || ""}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                disabled={loadingUsers}
              >
                <option value="">No user assignment</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName || user.lastName 
                      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                      : user.email}
                    {user.email && (user.firstName || user.lastName) ? ` (${user.email})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select a user without a company to assign them to this company
              </p>
            </div>

            {/* Trial Settings */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="trialActive"
                  checked={formData.isTrialActive}
                  onChange={(e) => setFormData({ ...formData, isTrialActive: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="trialActive" className="text-sm font-semibold text-gray-700">
                  Enable Trial Period
                </label>
              </div>

              {formData.isTrialActive && (
                <div className="ml-7 space-y-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Trial Duration (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={formData.trialDays}
                      onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Trial will end on:{" "}
                      {new Date(
                        Date.now() + parseInt(formData.trialDays || "14") * 24 * 60 * 60 * 1000
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 pt-6 border-t border-gray-200">
              <Link
                href="/admin/control-center"
                className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  "Create Company"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  )
}

