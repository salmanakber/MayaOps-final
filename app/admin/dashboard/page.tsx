"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  ClipboardList, 
  CheckCircle2, 
  Timer, 
  Clock, 
  Building2, 
  Users, 
  TrendingUp, 
  RefreshCw,
  MoreVertical,
  Calendar,
  AlertCircle
} from "lucide-react"

// --- Types ---
interface DashboardStats {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  pendingTasks: number
  totalProperties: number
  totalCleaners: number
  totalCompanies: number
  completionRate: string
}

interface Task {
  id: number
  title: string
  status: string
  createdAt: string
  property?: { address: string }
}

interface CleanerPerformance {
  cleanerId: number
  name: string
  tasksCompleted: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [cleanerPerformance, setCleanerPerformance] = useState<CleanerPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      
      // Artificial delay for smooth skeleton demonstration (remove in production)
      // await new Promise(r => setTimeout(r, 800)); 

      const [overviewRes, analyticsRes] = await Promise.all([
        axios.get("/api/dashboard/overview", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get("/api/dashboard/analytics", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (overviewRes.data.success) {
        setStats(overviewRes.data.data.stats)
        setRecentTasks(overviewRes.data.data.recentTasks)
      }

      if (analyticsRes.data.success) {
        setCleanerPerformance(analyticsRes.data.data.cleanerPerformance)
      }
      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error loading dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  if (loading || !stats) {
    return <DashboardSkeleton />
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
            <p className="text-sm text-gray-500 mt-1">
              Data last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button 
            onClick={loadDashboard}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm"
          >
            <RefreshCw size={16} />
            Refresh Data
          </button>
        </div>

        {/* Primary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Total Tasks" 
            value={stats.totalTasks} 
            icon={ClipboardList} 
            color="text-blue-600" 
            bg="bg-blue-50" 
          />
          <StatCard 
            label="Completed" 
            value={stats.completedTasks} 
            icon={CheckCircle2} 
            color="text-green-600" 
            bg="bg-green-50" 
          />
          <StatCard 
            label="In Progress" 
            value={stats.inProgressTasks} 
            icon={Timer} 
            color="text-amber-600" 
            bg="bg-amber-50" 
          />
          <StatCard 
            label="Pending" 
            value={stats.pendingTasks} 
            icon={Clock} 
            color="text-orange-600" 
            bg="bg-orange-50" 
          />
        </div>

        {/* Secondary Stats & Completion Rate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Completion Rate Card */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-8 -mt-8 z-0 opacity-50"></div>
                
                <div className="relative z-10">
                    <h3 className="text-gray-500 text-sm font-medium">Global Completion Rate</h3>
                    <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-bold text-gray-900">{stats.completionRate}%</span>
                        <span className="text-sm text-green-600 font-medium mb-1 flex items-center">
                            <TrendingUp size={14} className="mr-1" />
                            +2.4%
                        </span>
                    </div>
                </div>

                {/* Progress Bar Visual */}
                <div className="mt-6 relative z-10">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                            className="bg-indigo-600 h-2 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${stats.completionRate}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Based on all assigned tasks this month</p>
                </div>
            </div>

            {/* Asset Counters */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex items-center justify-between group hover:border-indigo-200 transition-colors">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Total Properties</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalProperties}</p>
                    <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded-full mt-2 inline-block">
                        Active Assets
                    </span>
                </div>
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Building2 size={24} />
                </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex items-center justify-between group hover:border-pink-200 transition-colors">
                <div>
                    <p className="text-gray-500 text-sm font-medium">Total Cleaners</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalCleaners}</p>
                    <span className="text-xs text-pink-600 font-medium bg-pink-50 px-2 py-1 rounded-full mt-2 inline-block">
                        Available Staff
                    </span>
                </div>
                <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors">
                    <Users size={24} />
                </div>
            </div>
        </div>

        {/* Bottom Section: Tasks & Cleaners */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Recent Tasks List */}
          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Recent Tasks</h2>
                <button className="text-sm text-indigo-600 font-medium hover:text-indigo-800">View All</button>
            </div>
            
            <div className="flex-1 overflow-auto max-h-[400px]">
                {recentTasks.length > 0 ? (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="px-6 py-3 font-medium">Task</th>
                            <th className="px-6 py-3 font-medium">Property</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium text-right">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {recentTasks.map((task) => (
                            <tr key={task.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{task.title}</div>
                                    <div className="text-xs text-gray-400">ID: #{task.id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Building2 size={14} className="text-gray-400" />
                                        {task.property?.address || "N/A"}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <StatusBadge status={task.status} />
                                </td>
                                <td className="px-6 py-4 text-right text-sm text-gray-500">
                                    {new Date(task.createdAt).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState message="No recent tasks found" />
                )}
            </div>
          </div>

          {/* Top Performers Leaderboard */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Top Performers</h2>
            </div>
            
            <div className="p-6 space-y-6">
              {cleanerPerformance.length > 0 ? (
                cleanerPerformance.slice(0, 5).map((performer, index) => {
                    const maxTasks = Math.max(...cleanerPerformance.map(p => p.tasksCompleted));
                    const percentage = (performer.tasksCompleted / maxTasks) * 100;
                    
                    return (
                        <div key={performer.cleanerId} className="group">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                        index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                                        index === 1 ? 'bg-gray-100 text-gray-700' : 
                                        index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'
                                    }`}>
                                        {index + 1}
                                    </div>
                                    <span className="font-medium text-gray-900 text-sm">{performer.name}</span>
                                </div>
                                <span className="text-sm font-bold text-gray-900">{performer.tasksCompleted}</span>
                            </div>
                            {/* Visual Progress Bar */}
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full ${index === 0 ? 'bg-yellow-500' : 'bg-indigo-500'} opacity-80`}
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                        </div>
                    )
                })
              ) : (
                <EmptyState message="No performance data available" />
              )}
            </div>
            <div className="mt-auto p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button className="w-full text-center text-sm text-gray-600 hover:text-gray-900 font-medium">
                    View Full Report
                </button>
            </div>
          </div>

        </div>
      </div>
    </AdminLayout>
  )
}

// --- Sub-components ---

function StatCard({ label, value, icon: Icon, color, bg }: { label: string, value: string | number, icon: any, color: string, bg: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${bg} ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
    PLANNED: "bg-blue-50 text-blue-700 border-blue-200",
    ASSIGNED: "bg-purple-50 text-purple-700 border-purple-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
    SUBMITTED: "bg-cyan-50 text-cyan-700 border-cyan-200",
    QA_REVIEW: "bg-pink-50 text-pink-700 border-pink-200",
    APPROVED: "bg-green-50 text-green-700 border-green-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
    ARCHIVED: "bg-gray-100 text-gray-500 border-gray-200 line-through",
  }
  
  const defaultStyle = "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || defaultStyle}`}>
      {status.replace("_", " ")}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-gray-50 p-4 rounded-full mb-3">
                <AlertCircle className="text-gray-400" size={24} />
            </div>
            <p className="text-gray-500 text-sm">{message}</p>
        </div>
    )
}

function DashboardSkeleton() {
    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
                <div className="flex justify-between">
                    <div className="h-8 bg-gray-200 rounded w-48"></div>
                    <div className="h-8 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="h-40 bg-gray-200 rounded-xl"></div>
                    <div className="h-40 bg-gray-200 rounded-xl"></div>
                    <div className="h-40 bg-gray-200 rounded-xl"></div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 h-96 bg-gray-200 rounded-xl"></div>
                    <div className="h-96 bg-gray-200 rounded-xl"></div>
                </div>
            </div>
        </AdminLayout>
    )
}