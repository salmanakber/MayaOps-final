"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  BarChart3, 
  Calendar, 
  Download, 
  FileText, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  Wallet, 
  ArrowUpRight,
  Loader2
} from "lucide-react"
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  Legend 
} from "recharts"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Interfaces ---
interface ReportData {
  taskCompletion: {
    total: number
    completed: number
    inProgress: number
    pending: number
    completionRate: number
  }
  cleanerPerformance: Array<{
    cleanerId: number
    name: string
    tasksCompleted: number
    averageScore: number
    onTimeRate: number
  }>
  issueStats: {
    total: number
    open: number
    resolved: number
    highSeverity: number
  }
  billingSummary: {
    totalRevenue: number
    activeSubscriptions: number
    failedPayments: number
  }
  dateRange: {
    start: string
    end: string
  }
}

// --- Components ---

// 1. Stat Card Component
function StatCard({ 
  label, 
  value, 
  subValue,
  icon: Icon, 
  trend,
  className 
}: { 
  label: string 
  value: string | number 
  subValue?: string
  icon: any
  trend?: "up" | "down" | "neutral"
  className?: string 
}) {
  return (
    <div className={cn("bg-white rounded-xl p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-2">{value}</h3>
          {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
        </div>
        <div className={cn("p-3 rounded-lg bg-opacity-10", className?.includes("bg-") ? "bg-white/50" : "bg-gray-50")}>
          <Icon className="w-6 h-6 text-gray-700" />
        </div>
      </div>
    </div>
  )
}

// 2. Quick Date Filter Component
const QuickDateBtn = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
      active 
        ? "bg-cyan-50 text-cyan-700 border border-cyan-200" 
        : "text-gray-600 hover:bg-gray-50 border border-transparent"
    )}
  >
    {label}
  </button>
)

export default function ReportingPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  
  // Date State
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  })
  const [activeFilter, setActiveFilter] = useState("30d")
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv")

  useEffect(() => {
    loadReports()
  }, [dateRange])

  const loadReports = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      
      const params: any = { startDate: dateRange.start, endDate: dateRange.end }
      if (selectedCompanyId) params.companyId = selectedCompanyId
      
      const response = await axios.get("/api/admin/reporting", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (response.data.success) {
        setReportData(response.data.data)
      }
    } catch (error) {
      console.error("Error loading reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickFilter = (days: number, label: string) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)
    
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    })
    setActiveFilter(label)
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const response = await axios.get("/api/analytics/export", {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          format: exportFormat,
          startDate: dateRange.start,
          endDate: dateRange.end,
          companyId: selectedCompanyId,
        },
        responseType: "blob",
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `mayaops-report-${dateRange.start}-${dateRange.end}.${exportFormat}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error("Error exporting report:", error)
      alert("Failed to export report")
    } finally {
      setIsExporting(false)
    }
  }

  // --- Render Helpers ---

  // Prepare chart data for Issues
  const issueChartData = reportData ? [
    { name: 'Resolved', value: reportData.issueStats.resolved, color: '#10B981' }, // emerald-500
    { name: 'Open', value: reportData.issueStats.open, color: '#F59E0B' }, // amber-500
    { name: 'High Sev', value: reportData.issueStats.highSeverity, color: '#EF4444' }, // red-500
  ] : []

  if (loading && !reportData) {
    return (
      <AdminLayout>
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">Overview of performance, billing, and operational issues.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              <QuickDateBtn label="7D" active={activeFilter === "7d"} onClick={() => handleQuickFilter(7, "7d")} />
              <QuickDateBtn label="30D" active={activeFilter === "30d"} onClick={() => handleQuickFilter(30, "30d")} />
              <QuickDateBtn label="90D" active={activeFilter === "90d"} onClick={() => handleQuickFilter(90, "90d")} />
            </div>

            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => { setDateRange({ ...dateRange, start: e.target.value }); setActiveFilter("custom") }}
                className="text-sm border-none p-0 focus:ring-0 text-gray-700 w-28"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => { setDateRange({ ...dateRange, end: e.target.value }); setActiveFilter("custom") }}
                className="text-sm border-none p-0 focus:ring-0 text-gray-700 w-28"
              />
            </div>
            
            <div className="flex items-center gap-0 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ml-auto sm:ml-0">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as "csv" | "pdf")}
                className="bg-transparent border-none text-sm py-2 pl-3 pr-8 focus:ring-0 text-gray-700 bg-gray-50/50"
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors flex items-center gap-2 border-l border-gray-700"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Top KPI Cards */}
        {reportData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              label="Total Revenue"
              value={`£${reportData.billingSummary.totalRevenue.toLocaleString()}`}
              icon={Wallet}
              className="border-l-4 border-l-cyan-500"
            />
            <StatCard
              label="Tasks Completed"
              value={reportData.taskCompletion.completed}
              subValue={`${reportData.taskCompletion.completionRate}% Completion Rate`}
              icon={CheckCircle2}
              className="border-l-4 border-l-emerald-500"
            />
             <StatCard
              label="Active Subs"
              value={reportData.billingSummary.activeSubscriptions}
              subValue={`${reportData.billingSummary.failedPayments} Failed Payments`}
              icon={Users}
              className="border-l-4 border-l-blue-500"
            />
            <StatCard
              label="Pending Issues"
              value={reportData.issueStats.open}
              subValue={`${reportData.issueStats.highSeverity} High Severity`}
              icon={AlertCircle}
              className="border-l-4 border-l-amber-500"
            />
          </div>
        )}

        {reportData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Tables (Span 2) */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Cleaner Performance Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-600" />
                    Top Performing Cleaners
                  </h2>
                  <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded-full">Top 10</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                      <tr>
                        <th className="px-6 py-3">Cleaner</th>
                        <th className="px-6 py-3 text-center">Tasks</th>
                        <th className="px-6 py-3 text-center">Avg Score</th>
                        <th className="px-6 py-3 text-center">On-Time %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportData.cleanerPerformance.length > 0 ? (
                        reportData.cleanerPerformance.slice(0, 10).map((performer) => (
                          <tr key={performer.cleanerId} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900">{performer.name}</td>
                            <td className="px-6 py-4 text-center text-gray-600">{performer.tasksCompleted}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-bold",
                                performer.averageScore >= 4.5 ? "bg-green-100 text-green-700" :
                                performer.averageScore >= 4.0 ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              )}>
                                {performer.averageScore.toFixed(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-gray-600">{performer.onTimeRate}%</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                            No performance data available for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

               {/* Task Summary Bar */}
               <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-cyan-600" />
                  Task Distribution
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm mb-1">
                     <span className="text-gray-600">Completion Progress</span>
                     <span className="font-bold text-gray-900">{reportData.taskCompletion.completionRate}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div 
                      className="bg-cyan-500 h-2.5 rounded-full transition-all duration-1000" 
                      style={{ width: `${reportData.taskCompletion.completionRate}%` }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{reportData.taskCompletion.completed}</div>
                      <div className="text-xs text-gray-500 uppercase mt-1">Done</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{reportData.taskCompletion.inProgress}</div>
                      <div className="text-xs text-gray-500 uppercase mt-1">Active</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-400">{reportData.taskCompletion.pending}</div>
                      <div className="text-xs text-gray-500 uppercase mt-1">Pending</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Charts & Secondary Stats */}
            <div className="space-y-8">
              
              {/* Issue Visualizer */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-auto">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Issue Breakdown</h2>
                <p className="text-sm text-gray-500 mb-6">Distribution of {reportData.issueStats.total} total reported issues</p>
                
                <div className="h-64 w-full">
                   <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={issueChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {issueChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      Critical
                    </span>
                    <span className="font-bold text-gray-900">{reportData.issueStats.highSeverity}</span>
                  </div>
                </div>
              </div>

              {/* Billing Mini Summary */}
              <div className="bg-gradient-to-br from-cyan-900 to-slate-900 rounded-xl shadow-lg p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Wallet className="w-24 h-24" />
                </div>
                <h3 className="text-cyan-200 font-medium mb-1">Monthly Recurring Revenue</h3>
                <div className="text-3xl font-bold mb-6">£{reportData.billingSummary.totalRevenue.toLocaleString()}</div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm bg-white/10 p-2 rounded">
                    <span className="text-cyan-100">Active Subs</span>
                    <span className="font-bold">{reportData.billingSummary.activeSubscriptions}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm bg-red-500/20 p-2 rounded border border-red-500/30">
                    <span className="text-red-200">Failed Payments</span>
                    <span className="font-bold text-red-100">{reportData.billingSummary.failedPayments}</span>
                  </div>
                </div>
                <button className="w-full mt-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  View Billing Details <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}