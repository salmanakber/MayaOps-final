"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter, 
  MoreVertical, 
  MapPin, 
  User, 
  Calendar,
  X,
  AlertOctagon,
  ArrowRight
} from "lucide-react"

// --- Types ---
interface Issue {
  id: number
  content: string
  severity: string
  status: string
  task: {
    id: number
    title: string
    property: { address: string }
  }
  user: {
    firstName: string
    lastName: string
    email: string
  }
  createdAt: string
}

interface IssueStats {
  totalIssues: number
  openIssues: number
  inProgressIssues: number
  bySeverity: Array<{ severity: string; count: number }>
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [stats, setStats] = useState<IssueStats | null>(null)
  const [loading, setLoading] = useState(true)
  
  // UI State
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)

  useEffect(() => {
    loadIssues()
  }, [statusFilter])

  const loadIssues = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      const params: any = {}
      if (statusFilter !== "all") {
        params.status = statusFilter
      }
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }
      
      const [issuesRes, statsRes] = await Promise.all([
        axios.get("/api/issues", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }),
        axios.get("/api/issues/stats", {
          headers: { Authorization: `Bearer ${token}` },
          params: selectedCompanyId ? { companyId: selectedCompanyId } : {},
        }),
      ])

      if (issuesRes.data.success) setIssues(issuesRes.data.data.issues)
      if (statsRes.data.success) setStats(statsRes.data.data)
    } catch (error) {
      console.error("Error loading issues:", error)
    } finally {
      setLoading(false)
    }
  }

  // Client-side filtering for Search & Severity (assuming API handles Status)
  const filteredIssues = issues.filter(issue => {
    const matchesSearch = 
        issue.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.task.property.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.task.title.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesSeverity = severityFilter === "all" || issue.severity === severityFilter

    return matchesSearch && matchesSeverity
  })

  // --- Subcomponents ---

  const SeverityBadge = ({ severity }: { severity: string }) => {
    const s = severity.toUpperCase()
    let styles = "bg-gray-100 text-gray-800"
    let Icon = AlertTriangle

    if (s === 'HIGH') {
        styles = "bg-red-50 text-red-700 border border-red-200"
        Icon = AlertOctagon
    } else if (s === 'MEDIUM') {
        styles = "bg-orange-50 text-orange-700 border border-orange-200"
        Icon = AlertTriangle
    } else if (s === 'LOW') {
        styles = "bg-blue-50 text-blue-700 border border-blue-200"
        Icon = Clock
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${styles}`}>
            <Icon size={12} />
            {severity}
        </span>
    )
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const s = status.toUpperCase()
    let styles = "bg-gray-100 text-gray-600"
    
    if (s === 'OPEN') styles = "bg-red-50 text-red-700 ring-1 ring-red-600/20"
    else if (s === 'IN_PROGRESS') styles = "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
    else if (s === 'RESOLVED') styles = "bg-green-50 text-green-700 ring-1 ring-green-600/20"

    return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${styles}`}>
            {status.replace("_", " ")}
        </span>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Issues Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor and resolve operational incidents.</p>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard 
              label="Total Issues" 
              value={stats.totalIssues} 
              icon={AlertTriangle} 
              color="text-indigo-600" 
              bg="bg-indigo-50" 
            />
            <StatCard 
              label="Open Tickets" 
              value={stats.openIssues} 
              icon={AlertOctagon} 
              color="text-red-600" 
              bg="bg-red-50" 
              highlight={stats.openIssues > 0}
            />
            <StatCard 
              label="In Progress" 
              value={stats.inProgressIssues} 
              icon={Clock} 
              color="text-amber-600" 
              bg="bg-amber-50" 
            />
            <StatCard 
              label="Resolved" 
              value={stats.totalIssues - (stats.openIssues + stats.inProgressIssues)} 
              icon={CheckCircle2} 
              color="text-green-600" 
              bg="bg-green-50" 
            />
          </div>
        )}

        {/* Filters & Search */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Search by issue content, property or task..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
            
            <div className="flex gap-3 w-full md:w-auto">
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    <option value="all">All Statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                </select>
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    <option value="all">All Severities</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                </select>
            </div>
        </div>

        {/* Issues List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
             <div className="p-12 space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
             </div>
          ) : filteredIssues.length === 0 ? (
             <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 size={32} className="text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">No issues found</h3>
                <p className="text-sm mt-1">Great job! Everything seems to be running smoothly.</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issue Details</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Context</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reporter</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Severity</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredIssues.map((issue) => (
                    <tr key={issue.id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                            <p className="text-sm text-gray-900 font-medium truncate" title={issue.content}>{issue.content}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                <Calendar size={12} />
                                {new Date(issue.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-indigo-600">{issue.task.title}</span>
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                                <MapPin size={12} />
                                {issue.task.property.address}
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                {issue.user.firstName[0]}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-900">{issue.user.firstName} {issue.user.lastName}</span>
                                <span className="text-xs text-gray-400">Reporter</span>
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <SeverityBadge severity={issue.severity} />
                      </td>
                      <td className="px-6 py-4">
                         <StatusBadge status={issue.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button 
                            onClick={() => setSelectedIssue(issue)}
                            className="text-gray-400 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-colors"
                         >
                            <ArrowRight size={18} />
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setSelectedIssue(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h3 className="font-bold text-gray-900">Issue Details #{selectedIssue.id}</h3>
                    <button onClick={() => setSelectedIssue(null)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full p-1"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-800 leading-relaxed">
                            {selectedIssue.content}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white border border-gray-200 p-3 rounded-lg">
                            <span className="text-xs text-gray-400">Status</span>
                            <div className="mt-1"><StatusBadge status={selectedIssue.status} /></div>
                        </div>
                        <div className="bg-white border border-gray-200 p-3 rounded-lg">
                            <span className="text-xs text-gray-400">Severity</span>
                            <div className="mt-1"><SeverityBadge severity={selectedIssue.severity} /></div>
                        </div>
                    </div>

                    <div>
                         <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Context</h4>
                         <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                             <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                                 <MapPin size={20} />
                             </div>
                             <div>
                                 <p className="text-sm font-medium text-gray-900">{selectedIssue.task.property.address}</p>
                                 <p className="text-xs text-gray-500">Task: {selectedIssue.task.title}</p>
                             </div>
                         </div>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                    <button 
                        onClick={() => setSelectedIssue(null)}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                        Close
                    </button>
                    <button 
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                        onClick={() => alert("Navigate to Task Details page...")}
                    >
                        View Associated Task
                    </button>
                </div>
            </div>
        </div>
      )}
    </AdminLayout>
  )
}

function StatCard({ label, value, icon: Icon, color, bg, highlight }: any) {
    return (
        <div className={`bg-white p-5 rounded-xl border ${highlight ? 'border-red-200 ring-4 ring-red-50' : 'border-gray-200'} shadow-sm flex items-start justify-between`}>
            <div>
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${bg} ${color}`}>
                <Icon size={20} />
            </div>
        </div>
    )
}