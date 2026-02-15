"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  RefreshCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Database,
  Globe,
  Loader2,
  Terminal,
  Activity,
  Clock,
  ShieldAlert
} from "lucide-react"

import RequirePermission from "@/components/RequirePermission"
import { PERMISSIONS } from "@/lib/permissions"

// --- Types ---
interface WatchStatus {
  success: boolean
  webhookUrl: string
  currentWebhookUrl: string
  isLocalhost: boolean
  warning: string | null
  totalCompanies: number
  companiesWithWatches: number
  status: Array<{
    companyId: number
    companyName: string
    propertySheet: SheetWatchStatus
    taskSheet: SheetWatchStatus
  }>
}

interface SheetWatchStatus {
  configured: boolean
  watchActive: boolean
  watch: {
    expiration?: string
    hoursUntilExpiration?: number
    isExpired?: boolean
    resourceId?: string
  }
}

interface RecreateResult {
  success: boolean
  message: string
  results: Array<{
    companyId?: number
    sheetType?: string
    success: boolean
    error?: string
  }>
  totalRecreated: number
}

// --- Helper Components ---

const StatCard = ({ title, value, icon: Icon, colorClass, bgClass }: any) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgClass}`}>
        <Icon className={colorClass} size={20} />
      </div>
    </div>
  </div>
)

const WatchBadge = ({ sheetData }: { sheetData: SheetWatchStatus }) => {
  if (!sheetData.configured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Not Configured
      </span>
    )
  }

  if (!sheetData.watchActive || !sheetData.watch) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
        <AlertTriangle size={12} />
        Inactive
      </span>
    )
  }

  const { isExpired, hoursUntilExpiration, expiration } = sheetData.watch

  if (isExpired) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <XCircle size={12} />
          Expired
        </span>
        <span className="text-[10px] text-gray-400 font-mono ml-1">
          {new Date(expiration || "").toLocaleDateString()}
        </span>
      </div>
    )
  }

  // Warning if less than 24 hours
  if (hoursUntilExpiration !== undefined && hoursUntilExpiration < 24) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Clock size={12} />
          Expiring Soon
        </span>
        <span className="text-[10px] text-gray-500 font-mono ml-1">
          {Math.round(hoursUntilExpiration)}h remaining
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 size={12} />
        Active
      </span>
      {hoursUntilExpiration !== undefined && (
        <span className="text-[10px] text-gray-500 font-mono ml-1">
           {Math.round(hoursUntilExpiration / 24)} days left
        </span>
      )}
    </div>
  )
}

// --- Main Component ---

export default function DeveloperPage() {
  const [watchStatus, setWatchStatus] = useState<WatchStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [recreating, setRecreating] = useState(false)
  const [recreateResult, setRecreateResult] = useState<RecreateResult | null>(null)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    loadWatchStatus()
  }, [])

  const loadWatchStatus = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/watch/status", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setWatchStatus(response.data)
      } else {
        setError(response.data.message || "Failed to load watch status")
      }
    } catch (err: any) {
      console.error("Error loading watch status:", err)
      setError(err.response?.data?.message || "Failed to load watch status")
    } finally {
      setLoading(false)
    }
  }

  const handleRecreateWatches = async () => {
    if (!confirm("⚠️ CAUTION: This will stop ALL existing watches and create new ones.\n\nAre you sure you want to proceed?")) {
      return
    }

    try {
      setRecreating(true)
      setError("")
      setRecreateResult(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      const response = await axios.post(
        "/api/watch/force-recreate",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.data.success) {
        setRecreateResult(response.data)
        // Reload status after recreating
        setTimeout(() => {
          loadWatchStatus()
        }, 2000)
      } else {
        setError(response.data.message || "Failed to recreate watches")
      }
    } catch (err: any) {
      console.error("Error recreating watches:", err)
      setError(err.response?.data?.message || "Failed to recreate watches")
    } finally {
      setRecreating(false)
    }
  }

  return (
    <AdminLayout>
      <RequirePermission permissions={[PERMISSIONS.SYSTEM_DEVELOPER]}>
      <div className="max-w-7xl mx-auto space-y-8 pb-10">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
                <Terminal className="text-white" size={24} />
              </div>
              Developer Tools
            </h1>
            <p className="text-sm text-gray-500 mt-1 ml-1">
              Monitor and manage Google Drive Push Notifications (Webhooks)
            </p>
          </div>
          <button
            onClick={loadWatchStatus}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-semibold text-red-800">System Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {watchStatus && (
          <>
            {/* System Health Banner */}
            <div className={`rounded-lg border px-4 py-3 flex items-start md:items-center gap-4 shadow-sm ${
              watchStatus.isLocalhost 
                ? "bg-amber-50 border-amber-200" 
                : "bg-indigo-50 border-indigo-200"
            }`}>
              <div className={`p-2 rounded-full ${watchStatus.isLocalhost ? "bg-amber-100" : "bg-indigo-100"}`}>
                {watchStatus.isLocalhost ? (
                  <ShieldAlert className="text-amber-600" size={20} />
                ) : (
                  <Globe className="text-indigo-600" size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <span className={`text-sm font-bold ${watchStatus.isLocalhost ? "text-amber-800" : "text-indigo-900"}`}>
                    Webhook Endpoint:
                  </span>
                  <code className={`text-xs font-mono px-2 py-1 rounded bg-white/60 border truncate ${
                     watchStatus.isLocalhost ? "text-amber-700 border-amber-200" : "text-indigo-700 border-indigo-200"
                  }`}>
                    {watchStatus.currentWebhookUrl}
                  </code>
                </div>
                {watchStatus.warning && (
                  <p className="text-xs text-amber-700 mt-1 font-medium flex items-center gap-1">
                    <Info size={12} /> {watchStatus.warning}
                  </p>
                )}
              </div>
              <div className="hidden md:block">
                 <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                   watchStatus.isLocalhost ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                 }`}>
                   {watchStatus.isLocalhost ? "Local Environment" : "Production"}
                 </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title="Total Companies" 
                value={watchStatus.totalCompanies} 
                icon={Database}
                bgClass="bg-gray-100"
                colorClass="text-gray-600"
              />
              <StatCard 
                title="Active Watches" 
                value={watchStatus.companiesWithWatches} 
                icon={CheckCircle2}
                bgClass="bg-green-100"
                colorClass="text-green-600"
              />
              <StatCard 
                title="Watch Efficiency" 
                value={`${watchStatus.totalCompanies > 0 
                  ? Math.round((watchStatus.companiesWithWatches / (watchStatus.totalCompanies * 2)) * 100) 
                  : 0}%`}
                icon={Activity}
                bgClass="bg-blue-100"
                colorClass="text-blue-600"
              />
            </div>
          </>
        )}

        {/* Action: Recreate Watches */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Webhook Management</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                Force recreate all watch channels. Use this if the backend URL changes (e.g., ngrok restart) or if watches have expired massively.
              </p>
            </div>
            <button
              onClick={handleRecreateWatches}
              disabled={recreating || loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-900 border border-transparent rounded-lg hover:bg-gray-800 focus:ring-4 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0"
            >
              {recreating ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCcw className="mr-2" size={16} />
                  Recreate All Channels
                </>
              )}
            </button>
          </div>

          {/* Console Output for Recreation */}
          {recreateResult && (
            <div className="p-6 bg-gray-900 border-t border-gray-800">
              <div className="flex items-center gap-2 mb-3 text-gray-400 text-xs uppercase tracking-wider font-semibold">
                <Terminal size={14} />
                Operation Log
              </div>
              <div className="font-mono text-sm max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
                <div className={`flex items-center gap-2 ${recreateResult.success ? "text-green-400" : "text-red-400"}`}>
                  <span>{recreateResult.success ? "SUCCESS:" : "FAILED:"}</span>
                  <span>{recreateResult.message}</span>
                </div>
                <div className="text-gray-500 mt-2 border-b border-gray-800 pb-2 mb-2">
                  --- Details ({recreateResult.totalRecreated} processed) ---
                </div>
                {recreateResult.results.map((result, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>
                    {result.companyId ? (
                      <>
                         <span className="text-blue-400">Co.{result.companyId}</span>
                         <span className="text-gray-400">::</span>
                         <span className="text-purple-400 w-16">{result.sheetType}</span>
                         <span className="text-gray-600">→</span>
                         {result.success ? (
                           <span className="text-green-500">OK</span>
                         ) : (
                           <span className="text-red-500">ERR: {result.error}</span>
                         )}
                      </>
                    ) : (
                      <span className="text-red-400">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Status Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-base font-semibold text-gray-900">Active Companies & Channels</h2>
            <span className="text-xs text-gray-500 bg-white border px-2 py-1 rounded">
              {watchStatus?.status.length || 0} Records
            </span>
          </div>

          {loading && !watchStatus ? (
            <div className="p-12 text-center">
              <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={32} />
              <p className="text-gray-500">Synchronizing watch status...</p>
            </div>
          ) : watchStatus && watchStatus.status.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs uppercase font-medium text-gray-500 text-left">
                  <tr>
                    <th className="px-6 py-3 w-1/3">Company Details</th>
                    <th className="px-6 py-3 w-1/3">Property Sheet</th>
                    <th className="px-6 py-3 w-1/3">Task Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {watchStatus.status.map((company) => (
                    <tr key={company.companyId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                            {company.companyName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{company.companyName}</p>
                            <p className="text-xs text-gray-500 font-mono">ID: {company.companyId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <WatchBadge sheetData={company.propertySheet} />
                      </td>
                      <td className="px-6 py-4">
                        <WatchBadge sheetData={company.taskSheet} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Database className="text-gray-400" size={24} />
              </div>
              <h3 className="text-gray-900 font-medium">No Data Found</h3>
              <p className="text-gray-500 text-sm mt-1">No configured companies or watches found.</p>
            </div>
          )}
        </div>
      </div>
      </RequirePermission>
    </AdminLayout>
  )
}