"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import Link from "next/link"
import AdminLayout from "@/components/AdminLayout"
import { 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  Search, 
  Download, 
  FileText, 
  Calendar, 
  Filter,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react"

// --- Types ---
interface BillingRecord {
  id: number
  companyId: number
  companyName: string
  stripeCustomerId?: string
  subscriptionId?: string
  status: string
  amountPaid: number
  amountDue: number
  propertyCount: number
  billingDate?: string
  nextBillingDate?: string
  isTrialPeriod: boolean
  trialEndsAt?: string
  createdAt: string
  company?: {
    id: number
    name: string
    subscriptionStatus: string
    basePrice: number
    propertyCount: number
    isTrialActive: boolean
    trialEndsAt?: string
  }
}

interface BillingSummary {
  total_revenue: string
  total_transactions: number
  failed_payments: number
}

type StatusFilter = "all" | "paid" | "pending" | "failed"

export default function BillingDashboard() {
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Filtering State
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  useEffect(() => {
    loadBilling()
  }, [])

  const loadBilling = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      // In a real app, you might want to debounce search/filter params to the API
      // For this design, we will filter client-side for immediate UI feedback
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const params: any = {}
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }
      
      const response = await axios.get("/api/admin/billing", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      if (response.data.success) {
        setRecords(response.data.billingRecords || [])
        setSummary(response.data.summary)
      }
    } catch (error) {
      console.error("Error loading billing:", error)
    } finally {
      setLoading(false)
    }
  }

  // --- Helpers ---
  const formatCurrency = (amount: number | string) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(Number(amount))
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }
console.log(records)
  // --- Filtering Logic ---
  const filteredRecords = records?.filter(record => {
    const matchesSearch = record.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          record.stripeCustomerId?.toLowerCase().includes(searchTerm.toLowerCase())
    
    let matchesStatus = true
    if (statusFilter === 'paid') matchesStatus = record.status === 'active' || record.status === 'processed'
    if (statusFilter === 'pending') matchesStatus = record.status === 'pending' || record.status === 'due'
    if (statusFilter === 'failed') matchesStatus = record.status === 'failed'

    return matchesSearch && matchesStatus
  })

  if (loading) {
    return <BillingSkeleton />
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Billing & Invoices</h1>
            <p className="text-sm text-gray-500 mt-1">Manage subscriptions, track revenue, and handle billing issues.</p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Stats Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              label="Total Revenue (30d)" 
              value={formatCurrency(summary.total_revenue || 0)} 
              icon={TrendingUp} 
              color="text-emerald-600" 
              bg="bg-emerald-50" 
            />
            <StatCard 
              label="Total Transactions" 
              value={summary.total_transactions} 
              icon={CreditCard} 
              color="text-blue-600" 
              bg="bg-blue-50" 
            />
            <StatCard 
              label="Failed Payments" 
              value={summary.failed_payments} 
              icon={AlertCircle} 
              color="text-red-600" 
              bg="bg-red-50" 
              highlight={summary.failed_payments > 0}
            />
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          
          {/* Filters Toolbar */}
          <div className="p-5 border-b border-gray-200 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Status Tabs */}
            <div className="flex p-1 bg-gray-200/60 rounded-lg self-start">
              {[
                { id: 'all', label: 'All Records' },
                { id: 'paid', label: 'Paid' },
                { id: 'pending', label: 'Pending' },
                { id: 'failed', label: 'Failed' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as StatusFilter)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    statusFilter === tab.id 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search company or invoice ID..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider text-left border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Next Billing</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords?.length && filteredRecords?.length > 0 ? (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                            {record.companyName?.substring(0, 2).toUpperCase() || "CO"}
                          </div>
                          <div>
                            <Link
                              href={`/admin/control-center/company/${record.companyId}`}
                              className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                            >
                              {record.companyName || `Company #${record.companyId}`}
                            </Link>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                <span className="text-gray-400">Props:</span> {record.propertyCount}
                                {record.isTrialPeriod && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Trial</span>
                                )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">
                                {formatCurrency(record.amountPaid > 0 ? record.amountPaid : record.amountDue)}
                            </span>
                            {record.amountDue > 0 && record.status !== 'active' && (
                                <span className="text-xs text-red-500 font-medium">Due: {formatCurrency(record.amountDue)}</span>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                           <Calendar size={14} className="text-gray-400" />
                           {formatDate(record.billingDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="text-sm text-gray-600">
                           {formatDate(record.nextBillingDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-gray-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full" title="Download Invoice">
                            <FileText size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-gray-500">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                <Filter size={20} className="text-gray-400" />
                            </div>
                            <p className="text-sm font-medium">No records found</p>
                            <p className="text-xs mt-1">Try adjusting your search or filters</p>
                        </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer Pagination (Visual Only) */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
             <p className="text-xs text-gray-500">Showing {filteredRecords?.length || 0} results</p>
             <div className="flex gap-2">
                <button disabled className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-400 cursor-not-allowed">Previous</button>
                <button disabled className="px-3 py-1 border border-gray-300 rounded text-xs text-gray-400 cursor-not-allowed">Next</button>
             </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

// --- Sub-components ---

function StatCard({ label, value, icon: Icon, color, bg, highlight }: any) {
  return (
    <div className={`bg-white rounded-xl p-6 border ${highlight ? 'border-red-200 ring-2 ring-red-50' : 'border-gray-200'} shadow-sm flex items-start justify-between`}>
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-lg ${bg} ${color}`}>
        <Icon size={20} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
    const s = status.toLowerCase()
    let styles = "bg-gray-100 text-gray-600 border-gray-200"
    let Icon = Clock
    let text = status

    if (s === 'active' || s === 'processed' || s === 'paid') {
        styles = "bg-emerald-50 text-emerald-700 border-emerald-200"
        Icon = CheckCircle2
        text = "Paid"
    } else if (s === 'failed' || s === 'overdue') {
        styles = "bg-red-50 text-red-700 border-red-200"
        Icon = XCircle
        text = "Failed"
    } else if (s === 'pending' || s === 'due') {
        styles = "bg-amber-50 text-amber-700 border-amber-200"
        Icon = Clock
        text = "Pending"
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles}`}>
            <Icon size={12} />
            <span className="capitalize">{text}</span>
        </span>
    )
}

function BillingSkeleton() {
    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
                </div>
                <div className="h-96 bg-gray-200 rounded-xl"></div>
            </div>
        </AdminLayout>
    )
}