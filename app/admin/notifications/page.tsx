"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { Bell, Send, Users, Building2, CheckCircle, XCircle } from "lucide-react"
import CompanySelector from "@/components/CompanySelector"

interface Company {
  id: number
  name: string
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [userRole, setUserRole] = useState<string>("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    targetRole: "all",
    companyId: null as number | null,
    userIds: [] as number[],
  })

  useEffect(() => {
    loadUserRole()
    if (userRole === "SUPER_ADMIN" || userRole === "OWNER" || userRole === "DEVELOPER") {
      loadCompanies()
    }
  }, [userRole])

  const loadUserRole = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.data.success) {
        setUserRole(response.data.data.user.role)
        if (response.data.data.user.companyId) {
          setSelectedCompanyId(response.data.data.user.companyId)
          setFormData(prev => ({ ...prev, companyId: response.data.data.user.companyId }))
        }
      }
    } catch (error) {
      console.error("Error loading user:", error)
    }
  }

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/companies", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.data.success) {
        setCompanies(response.data.data)
      }
    } catch (error) {
      console.error("Error loading companies:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)
    setLoading(true)

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      const payload: any = {
        title: formData.title,
        message: formData.message,
        targetRole: formData.targetRole !== "all" ? formData.targetRole : null,
      }

      if (userRole === "SUPER_ADMIN" || userRole === "OWNER" || userRole === "DEVELOPER") {
        // Only include companyId if a specific company is selected (not null/undefined/empty)
        if (formData.companyId != null) {
          payload.companyId = Number(formData.companyId); // Ensure it's a number
        } else {
          // Explicitly don't include companyId to send to all companies
          console.log('No companyId - sending to all companies')
        }
      }

      if (formData.userIds.length > 0) {
        payload.userIds = formData.userIds
      }

      const response = await axios.post(
        "/api/admin/notifications/send",
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (response.data.success) {
        setSuccess(true)
        setFormData({
          title: "",
          message: "",
          targetRole: "all",
          companyId: selectedCompanyId,
          userIds: [],
        })
        setTimeout(() => setSuccess(false), 5000)
      } else {
        setError(response.data.error || "Failed to send notifications")
      }
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || "Failed to send notifications")
    } finally {
      setLoading(false)
    }
  }

  const canSelectCompany = userRole === "SUPER_ADMIN" || userRole === "OWNER" || userRole === "DEVELOPER"

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Bell className="text-indigo-600" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Send Notifications</h1>
              <p className="text-gray-600 mt-1">Send notifications to users by role or company</p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="text-green-600" size={20} />
            <p className="text-sm text-green-800">Notifications sent successfully!</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <XCircle className="text-red-600" size={20} />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Selector (only for super admins) */}
            {canSelectCompany && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company (Optional)
                </label>
                <select
                  value={formData.companyId || ""}
                  onChange={(e) => {
                    const companyId = e.target.value ? parseInt(e.target.value) : null
                    setFormData({ ...formData, companyId })
                    setSelectedCompanyId(companyId)
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">All Companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Leave empty to send to all companies</p>
              </div>
            )}

            {/* Target Role */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Target Role
              </label>
              <select
                value={formData.targetRole}
                onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              >
                <option value="all">All Roles</option>
                <option value="OWNER">Owner</option>
                <option value="COMPANY_ADMIN">Company Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="CLEANER">Cleaner</option>
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter notification title"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter notification message"
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Send Notifications
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  )
}

