"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  Download, 
  Search, 
  Calendar, 
  Filter, 
  Eye, 
  Activity, 
  ArrowRight,
  User,
  X,
  ShieldAlert,
  Clock,
  Globe
} from "lucide-react"

// --- Types ---
interface AuditLog {
  id: number
  action: string
  entity_type: string
  entity_id: string
  user_id: number
  user?: {
    email: string
    firstName?: string
    lastName?: string
  }
  old_values?: string
  new_values?: string
  ip_address?: string
  created_at: string
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null) // For Modal
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    // Debounce or simple effect for loading
    const timer = setTimeout(() => {
      loadAuditLogs()
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, dateFrom, dateTo])

  const loadAuditLogs = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      const params: any = {
        search: searchTerm || undefined, // Assumes backend handles generic search, or map to action/entity
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }
      
      const response = await axios.get("/api/admin/audit-log", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      if (response.data.success) {
        setLogs(response.data.data)
      }
    } catch (error) {
      console.error("Error loading audit logs:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/audit-log/export", {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: searchTerm, dateFrom, dateTo },
        responseType: "blob",
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `audit_logs_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error("Error exporting audit logs:", error)
      alert("Failed to export audit logs")
    }
  }

  // Helper to parse JSON safely
  const parseChanges = (data?: string) => {
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  if (loading && logs.length === 0) {
    return <AuditSkeleton />
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ShieldAlert className="text-indigo-600" />
              Security Audit Logs
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Track system changes, user access, and critical events.
            </p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by action, entity ID, or user..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            
            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-3 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-600"
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="relative">
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-3 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">IP Address</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                           <Clock size={14} className="text-gray-400" />
                           {new Date(log.created_at).toLocaleString('en-GB', { 
                             day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                           })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{log.entity_type}</span>
                            <span className="text-xs font-mono text-gray-400">ID: {log.entity_id}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                              {log.user?.firstName?.[0] || "U"}
                           </div>
                           <div className="flex flex-col">
                             <span className="text-sm text-gray-900 font-medium">
                               {log.user ? `${log.user.firstName || ''} ${log.user.lastName || ''}` : `User ${log.user_id}`}
                             </span>
                             <span className="text-xs text-gray-500">{log.user?.email}</span>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded w-fit">
                            <Globe size={12} />
                            {log.ip_address || "Unknown"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                         <button 
                            onClick={() => setSelectedLog(log)}
                            className="text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                         >
                            View
                         </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <Activity size={32} className="text-gray-300 mb-2" />
                        <p>No audit logs found matching filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Log Details</h3>
                        <p className="text-xs text-gray-500 font-mono mt-1">ID: {selectedLog.id} • {selectedLog.created_at}</p>
                    </div>
                    <button 
                        onClick={() => setSelectedLog(null)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <span className="text-xs text-gray-500 uppercase font-semibold">Actor</span>
                            <div className="flex items-center gap-2 mt-1">
                                <User size={16} className="text-indigo-600" />
                                <span className="text-sm font-medium">{selectedLog.user?.email || selectedLog.user_id}</span>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <span className="text-xs text-gray-500 uppercase font-semibold">Entity</span>
                            <div className="flex items-center gap-2 mt-1">
                                <Activity size={16} className="text-indigo-600" />
                                <span className="text-sm font-medium">{selectedLog.entity_type} #{selectedLog.entity_id}</span>
                            </div>
                        </div>
                    </div>

                    {/* Data Changes */}
                    {(selectedLog.old_values || selectedLog.new_values) ? (
                        <div className="space-y-3">
                             <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <Filter size={14} /> Data Changes
                             </h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">Old Values</span>
                                    <pre className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 overflow-x-auto font-mono">
                                        {JSON.stringify(parseChanges(selectedLog.old_values), null, 2) || "N/A"}
                                    </pre>
                                </div>
                                <div className="space-y-2">
                                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">New Values</span>
                                    <pre className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 overflow-x-auto font-mono">
                                        {JSON.stringify(parseChanges(selectedLog.new_values), null, 2) || "N/A"}
                                    </pre>
                                </div>
                             </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            <p className="text-sm text-gray-500">No data changes recorded for this action.</p>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end">
                    <button 
                        onClick={() => setSelectedLog(null)}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}
    </AdminLayout>
  )
}

// --- Sub-components ---

function ActionBadge({ action }: { action: string }) {
    const act = action.toUpperCase()
    let styles = "bg-gray-100 text-gray-700 border-gray-200"
    
    if (act.includes("CREATE") || act.includes("ADD")) {
        styles = "bg-green-50 text-green-700 border-green-200"
    } else if (act.includes("UPDATE") || act.includes("EDIT") || act.includes("MODIFY")) {
        styles = "bg-blue-50 text-blue-700 border-blue-200"
    } else if (act.includes("DELETE") || act.includes("REMOVE")) {
        styles = "bg-red-50 text-red-700 border-red-200"
    } else if (act.includes("LOGIN") || act.includes("AUTH")) {
        styles = "bg-purple-50 text-purple-700 border-purple-200"
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles}`}>
            {action}
        </span>
    )
}

function AuditSkeleton() {
    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
                <div className="flex justify-between">
                    <div className="h-8 bg-gray-200 rounded w-64"></div>
                    <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="h-16 bg-gray-200 rounded-xl"></div>
                <div className="h-96 bg-gray-200 rounded-xl"></div>
            </div>
        </AdminLayout>
    )
}