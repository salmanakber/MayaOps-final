"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  RefreshCcw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Info,
  Database,
  ExternalLink,
  Loader2,
  Code
} from "lucide-react"

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
    propertySheet: {
      configured: boolean
      watchActive: boolean
      watch: any
    }
    taskSheet: {
      configured: boolean
      watchActive: boolean
      watch: any
    }
  }>
}

interface RecreateResult {
  success: boolean
  message: string
  results: Array<{
    companyId?: number
    sheetType?: string
    success: boolean
    error?: string
    watchChannel?: any
  }>
  totalRecreated: number
}

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
    if (!confirm("Are you sure you want to recreate all watch channels? This will stop existing watches and create new ones with the current webhook URL.")) {
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
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const formatHours = (hours: number) => {
    if (hours < 0) return "Expired"
    if (hours < 24) return `${Math.round(hours)} hours`
    return `${Math.round(hours / 24)} days`
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Code className="text-indigo-600" size={28} />
              Developer Tools
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage Google Drive watch channels and webhooks</p>
          </div>
          <button
            onClick={loadWatchStatus}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCcw className={loading ? "animate-spin" : ""} size={16} />
            Refresh Status
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Webhook URL Info */}
        {watchStatus && (
          <div className={`border rounded-lg p-4 ${
            watchStatus.isLocalhost 
              ? "bg-red-50 border-red-200" 
              : "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-start gap-3">
              {watchStatus.isLocalhost ? (
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              ) : (
                <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  watchStatus.isLocalhost ? "text-red-800" : "text-blue-800"
                }`}>
                  Current Webhook URL
                </p>
                <p className={`text-sm mt-1 font-mono ${
                  watchStatus.isLocalhost ? "text-red-600" : "text-blue-600"
                }`}>
                  {watchStatus.currentWebhookUrl}
                </p>
                {watchStatus.warning && (
                  <p className="text-sm text-red-600 mt-2 font-medium">{watchStatus.warning}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {watchStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Database className="text-indigo-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Companies</p>
                  <p className="text-xl font-bold text-gray-900">{watchStatus.totalCompanies}</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="text-green-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Watches</p>
                  <p className="text-xl font-bold text-gray-900">{watchStatus.companiesWithWatches}</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ExternalLink className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Webhook Endpoint</p>
                  <p className="text-xs font-mono text-gray-600 truncate">{watchStatus.webhookUrl}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recreate Watches Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recreate Watch Channels</h2>
              <p className="text-sm text-gray-500 mt-1">
                Stop all existing watch channels and recreate them with the current webhook URL.
                Use this when the webhook URL changes (e.g., ngrok URL changes).
              </p>
            </div>
            <button
              onClick={handleRecreateWatches}
              disabled={recreating || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {recreating ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Recreating...
                </>
              ) : (
                <>
                  <RefreshCcw size={16} />
                  Recreate All Watches
                </>
              )}
            </button>
          </div>

          {recreateResult && (
            <div className={`mt-4 border rounded-lg p-4 ${
              recreateResult.success 
                ? "bg-green-50 border-green-200" 
                : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-start gap-3">
                {recreateResult.success ? (
                  <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                ) : (
                  <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    recreateResult.success ? "text-green-800" : "text-red-800"
                  }`}>
                    {recreateResult.message}
                  </p>
                  <p className={`text-sm mt-1 ${
                    recreateResult.success ? "text-green-600" : "text-red-600"
                  }`}>
                    {recreateResult.totalRecreated} watch channel(s) recreated
                  </p>
                  {recreateResult.results.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {recreateResult.results.slice(0, 5).map((result, idx) => (
                        <div key={idx} className="text-xs font-mono bg-white/50 p-2 rounded">
                          {result.companyId && result.sheetType ? (
                            <>
                              Company {result.companyId} - {result.sheetType}:{" "}
                              {result.success ? (
                                <span className="text-green-600">✓ Success</span>
                              ) : (
                                <span className="text-red-600">✗ {result.error}</span>
                              )}
                            </>
                          ) : (
                            result.error || "Unknown result"
                          )}
                        </div>
                      ))}
                      {recreateResult.results.length > 5 && (
                        <p className="text-xs text-gray-500">
                          ... and {recreateResult.results.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Watch Status Table */}
        {loading && !watchStatus ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <p className="text-sm text-gray-500 mt-4">Loading watch status...</p>
          </div>
        ) : watchStatus && watchStatus.status.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Watch Channel Status</h2>
              <p className="text-sm text-gray-500 mt-1">
                Detailed status of watch channels for each company
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Sheet
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task Sheet
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {watchStatus.status.map((company) => (
                    <tr key={company.companyId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{company.companyName}</p>
                          <p className="text-xs text-gray-500">ID: {company.companyId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {company.propertySheet.configured ? (
                          company.propertySheet.watchActive && company.propertySheet.watch ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="text-green-600" size={16} />
                                <span className="text-sm text-gray-900">Active</span>
                              </div>
                              {company.propertySheet.watch.expiration && (
                                <div className="text-xs text-gray-500 ml-6">
                                  Expires: {formatDate(company.propertySheet.watch.expiration)}
                                  {company.propertySheet.watch.hoursUntilExpiration !== undefined && (
                                    <span className="ml-2">
                                      ({formatHours(company.propertySheet.watch.hoursUntilExpiration)})
                                    </span>
                                  )}
                                </div>
                              )}
                              {company.propertySheet.watch.isExpired && (
                                <span className="text-xs text-red-600 ml-6">⚠️ Expired</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Not set up</span>
                          )
                        ) : (
                          <span className="text-sm text-gray-400">Not configured</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {company.taskSheet.configured ? (
                          company.taskSheet.watchActive && company.taskSheet.watch ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="text-green-600" size={16} />
                                <span className="text-sm text-gray-900">Active</span>
                              </div>
                              {company.taskSheet.watch.expiration && (
                                <div className="text-xs text-gray-500 ml-6">
                                  Expires: {formatDate(company.taskSheet.watch.expiration)}
                                  {company.taskSheet.watch.hoursUntilExpiration !== undefined && (
                                    <span className="ml-2">
                                      ({formatHours(company.taskSheet.watch.hoursUntilExpiration)})
                                    </span>
                                  )}
                                </div>
                              )}
                              {company.taskSheet.watch.isExpired && (
                                <span className="text-xs text-red-600 ml-6">⚠️ Expired</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Not set up</span>
                          )
                        ) : (
                          <span className="text-sm text-gray-400">Not configured</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : watchStatus ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Database className="mx-auto text-gray-400" size={48} />
            <p className="text-sm text-gray-500 mt-4">No watch channels configured</p>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
