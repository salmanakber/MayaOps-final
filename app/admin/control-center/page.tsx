"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import Link from "next/link"
import AdminLayout from "@/components/AdminLayout"
import { 
  Building2, 
  CreditCard, 
  AlertCircle, 
  TrendingUp, 
  Search, 
  Settings, 
  FileText, 
  MoreHorizontal, 
  Plus,
  ArrowRight,
  ShieldCheck,
  Briefcase
} from "lucide-react"

// --- Types ---
interface Company {
  id: number
  name: string
  email: string
  subscription_status: string
  monthly_cost: number
  properties_count: number
  created_at: string
}

interface BillingSummary {
  total_revenue: string
  total_transactions: number
  failed_payments: number
}

type TabType = "companies" | "billing"  | "audit"

export default function AdminControlCenter() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>("companies")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      const [companiesRes, billingRes] = await Promise.all([
        axios.get("/api/admin/companies", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`/api/admin/billing${selectedCompanyId ? `?companyId=${selectedCompanyId}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (companiesRes.data.success) {
        setCompanies(companiesRes.data.data)
      }

      if (billingRes.data.success) {
        setBillingSummary(billingRes.data.summary)
      }
    } catch (error) {
      console.error("Error loading dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  // Filter companies based on search
  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-sm text-gray-500 font-medium">Loading Control Center...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Control Center</h1>
            <p className="text-sm text-gray-500 mt-1">Super Admin overview and management console.</p>
          </div>
          <div className="flex items-center gap-3">
             <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                v2.4.0 (Stable)
             </span>
          </div>
        </div>

        {/* High-Level Stats Cards */}
        {billingSummary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard 
              label="Monthly Revenue" 
              value={`£${billingSummary.total_revenue}`} 
              subValue="+12% from last month"
              icon={TrendingUp} 
              color="text-emerald-600" 
              bg="bg-emerald-50" 
            />
            <StatCard 
              label="Total Transactions" 
              value={billingSummary.total_transactions} 
              subValue="Last 30 days"
              icon={CreditCard} 
              color="text-blue-600" 
              bg="bg-blue-50" 
            />
            <StatCard 
              label="Failed Payments" 
              value={billingSummary.failed_payments} 
              subValue="Requires attention"
              icon={AlertCircle} 
              color="text-red-600" 
              bg="bg-red-50" 
            />
          </div>
        )}

        {/* Navigation Tabs (Segmented Control) */}
        <div className="bg-gray-100/80 p-1 rounded-xl inline-flex w-full md:w-auto">
          {["companies", "billing", "audit"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 capitalize ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* --- COMPANIES TAB --- */}
        {activeTab === "companies" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text"
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              <Link
                href="/admin/control-center/add-company"
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm"
              >
                <Plus size={16} />
                Add New Company
              </Link>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50 text-xs text-gray-500 font-semibold uppercase tracking-wider text-left">
                  <tr>
                    <th className="px-6 py-4">Company Name</th>
                    <th className="px-6 py-4">Subscription</th>
                    <th className="px-6 py-4 text-center">Properties</th>
                    <th className="px-6 py-4">Monthly Cost</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCompanies.length > 0 ? (
                    filteredCompanies.map((company) => (
                      <tr key={company.id} className="group hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-sm">
                              {company.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{company.name}</p>
                              <p className="text-xs text-gray-500">{company.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={company.subscription_status} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                             {company.properties_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">£{Number(company.monthly_cost)?.toFixed(2) || 0}</div>
                          <div className="text-xs text-gray-400">/month</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/admin/control-center/company/${company.id}`}
                            className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                          >
                            <MoreHorizontal size={20} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            No companies found matching "{searchTerm}"
                        </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- OTHER TABS (Feature Cards) --- */}
        {activeTab === "billing" && (
            <FeatureCard 
                title="Billing & Invoicing"
                description="Manage global subscription plans, view transaction history across all companies, and handle refund requests."
                icon={CreditCard}
                href="/admin/control-center/billing"
                buttonText="Open Billing Dashboard"
            />
        )}

       

        {activeTab === "audit" && (
            <FeatureCard 
                title="Security & Audit Logs"
                description="Review security events, login attempts, and critical data changes performed by system administrators."
                icon={ShieldCheck}
                href="/admin/control-center/audit-logs"
                buttonText="View Audit Trail"
            />
        )}

      </div>
    </AdminLayout>
  )
}

// --- Sub-components ---

function StatCard({ label, value, subValue, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between group hover:border-gray-300 transition-colors">
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
                <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
                {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
            </div>
            <div className={`p-3 rounded-lg ${bg} ${color} group-hover:scale-110 transition-transform`}>
                <Icon size={20} />
            </div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'active';
    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
            isActive 
            ? "bg-green-50 text-green-700 border-green-200" 
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {status?.charAt(0)?.toUpperCase() + status?.slice(1)}
        </div>
    )
}

function FeatureCard({ title, description, icon: Icon, href, buttonText }: any) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex flex-col items-center text-center max-w-2xl mx-auto mt-8">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-6">
                <Icon size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
            <p className="text-gray-500 mb-8 max-w-md">{description}</p>
            <Link 
                href={href}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md"
            >
                {buttonText}
                <ArrowRight size={18} />
            </Link>
        </div>
    )
}