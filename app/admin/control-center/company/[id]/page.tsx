"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Users,
  MapPin,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  FileText,
} from "lucide-react"

interface CompanyDetail {
  id: number
  name: string
  subscriptionStatus: string
  basePrice: number
  propertyCount: number
  isTrialActive: boolean
  trialEndsAt?: string
  daysRemaining: number
  createdAt: string
  updatedAt: string
  stats: {
    users: number
    properties: number
    tasks: number
    billingRecords: number
  }
  totalRevenue: number
  billingRecords: Array<{
    id: number
    status: string
    amountPaid: number
    amountDue: number
    billingDate?: string
    nextBillingDate?: string
    propertyCount: number
    isTrialPeriod: boolean
    trialEndsAt?: string
    createdAt: string
  }>
  users: Array<{
    id: number
    email: string
    firstName?: string
    lastName?: string
    role: string
    isActive: boolean
  }>
  properties: Array<{
    id: number
    address: string
    isActive: boolean
  }>
}

export default function CompanyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const companyId = params.id as string

  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    if (companyId) {
      loadCompany()
    }
  }, [companyId])

  const loadCompany = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get(`/api/admin/companies/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setCompany(response.data.data)
      } else {
        setError(response.data.error || "Failed to load company")
      }
    } catch (error: any) {
      setError(error.response?.data?.error || "Failed to load company")
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200"
      case "inactive":
        return "bg-gray-100 text-gray-800 border-gray-200"
      case "suspended":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !company) {
    return (
      <AdminLayout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">{error || "Company not found"}</p>
            <Link
              href="/admin/control-center"
              className="mt-4 inline-block text-sm text-red-600 hover:text-red-800"
            >
              ← Back to Control Center
            </Link>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/control-center"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Building2 className="text-indigo-600" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
                <p className="text-sm text-gray-500">Company Details & Billing</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Edit size={16} />
            Edit Company
          </button>
        </div>

        {/* Trial Status Banner */}
        {company.isTrialActive && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Clock className="text-blue-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Trial Period Active</h3>
                  <p className="text-sm text-gray-600">
                    {company.daysRemaining} days remaining
                    {company.trialEndsAt && ` • Ends on ${formatDate(company.trialEndsAt)}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{company.daysRemaining}</p>
                <p className="text-xs text-gray-500">Days Left</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Users"
            value={company.stats.users}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <StatCard
            icon={MapPin}
            label="Properties"
            value={company.stats.properties}
            color="text-green-600"
            bg="bg-green-50"
          />
          <StatCard
            icon={FileText}
            label="Total Tasks"
            value={company.stats.tasks}
            color="text-purple-600"
            bg="bg-purple-50"
          />
          <StatCard
            icon={DollarSign}
            label="Total Revenue"
            value={formatCurrency(company.totalRevenue)}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Subscription Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Details</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Status</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                      company.subscriptionStatus
                    )}`}
                  >
                    {company.subscriptionStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Base Monthly Price</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(company.basePrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Trial Status</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {company.isTrialActive ? (
                      <span className="text-blue-600">Active</span>
                    ) : (
                      <span className="text-gray-500">Inactive</span>
                    )}
                  </span>
                </div>
                {company.trialEndsAt && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Trial End Date</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatDate(company.trialEndsAt)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-t border-gray-200 pt-4">
                  <span className="text-sm text-gray-600">Created</span>
                  <span className="text-sm text-gray-900">{formatDate(company.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Billing History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Billing History</h2>
                <Link
                  href={`/admin/control-center/billing?companyId=${company.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  View All →
                </Link>
              </div>
              {company.billingRecords.length > 0 ? (
                <div className="space-y-3">
                  {company.billingRecords.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatDate(record.billingDate)}
                          </span>
                          {record.isTrialPeriod && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                              Trial
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {record.propertyCount} properties • Status: {record.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(record.amountPaid)}
                        </p>
                        {record.amountDue > 0 && (
                          <p className="text-xs text-red-600">Due: {formatCurrency(record.amountDue)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No billing records found</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                <Link
                  href={`/admin/billing?companyId=${company.id}`}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  View Full Billing →
                </Link>
                <Link
                  href={`/admin/users?companyId=${company.id}`}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Manage Users →
                </Link>
                <Link
                  href={`/admin/properties?companyId=${company.id}`}
                  className="block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  View Properties →
                </Link>
              </div>
            </div>

            {/* Recent Users */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Users</h2>
              {company.users.length > 0 ? (
                <div className="space-y-2">
                  {company.users.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user.email}
                        </p>
                        <p className="text-xs text-gray-500">{user.role}</p>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          user.isActive ? "bg-green-500" : "bg-gray-300"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No users found</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditCompanyModal
          company={company}
          onClose={() => {
            setShowEditModal(false)
            loadCompany()
          }}
        />
      )}
    </AdminLayout>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any
  label: string
  value: string | number
  color: string
  bg: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${bg} ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function EditCompanyModal({
  company,
  onClose,
}: {
  company: CompanyDetail
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    name: company.name,
    basePrice: company.basePrice.toString(),
    subscriptionStatus: company.subscriptionStatus,
    isTrialActive: company.isTrialActive,
    trialDays: company.trialEndsAt
      ? Math.ceil(
          (new Date(company.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ).toString()
      : "14",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const trialEndsAt = formData.isTrialActive
        ? new Date(Date.now() + parseInt(formData.trialDays) * 24 * 60 * 60 * 1000)
        : null

      const response = await axios.patch(
        `/api/admin/companies/${company.id}`,
        {
          name: formData.name,
          basePrice: parseFloat(formData.basePrice),
          subscriptionStatus: formData.subscriptionStatus,
          isTrialActive: formData.isTrialActive,
          trialEndsAt: trialEndsAt?.toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (response.data.success) {
        onClose()
      } else {
        setError(response.data.error || "Failed to update company")
      }
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || "Failed to update company")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Edit Company</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-lg">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
            <input
              type="number"
              step="0.01"
              value={formData.basePrice}
              onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Status</label>
            <select
              value={formData.subscriptionStatus}
              onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isTrialActive}
                onChange={(e) => setFormData({ ...formData, isTrialActive: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Enable Trial</span>
            </label>
          </div>
          {formData.isTrialActive && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trial Days</label>
              <input
                type="number"
                min="1"
                value={formData.trialDays}
                onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

