"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  Plus, Search, Calendar, Filter, LayoutList, Grid, 
  MoreVertical, Clock, MapPin, User as UserIcon, 
  CheckCircle2, AlertCircle, X, Repeat, Loader2, 
  ArrowRight, Trash2, Save, FileText, Check, ChevronDown
} from "lucide-react"

// --- Types ---
interface Task {
  id: number
  title: string
  description?: string
  status: TaskStatus
  scheduledDate?: string
  isRecurring: boolean
  recurringPattern?: string
  property: { id: number; address: string }
  assignedUser?: { id: number; firstName?: string; email: string; profileImage?: string }
  company?: { id: number; name: string }
}

type TaskStatus = "DRAFT" | "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "QA_REVIEW" | "APPROVED" | "REJECTED"

interface Property { id: number; address: string }
interface User { id: number; firstName?: string; lastName?: string; role?: string; isActive?: boolean }

// --- Constants ---
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT: { label: "Draft", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
  PLANNED: { label: "Planned", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  ASSIGNED: { label: "Assigned", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
  IN_PROGRESS: { label: "In Progress", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  SUBMITTED: { label: "Submitted", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  QA_REVIEW: { label: "QA Review", color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200" },
  APPROVED: { label: "Approved", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  REJECTED: { label: "Rejected", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
}

const BOARD_COLUMNS = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "APPROVED"];

// --- Utility: Smart Date Formatting ---
const formatSmartDate = (dateString?: string) => {
  if (!dateString) return "Unscheduled";
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.setDate(now.getDate() + 1)).toDateString() === date.toDateString();
  
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Array<{id: number, type: 'success'|'error', msg: string}>>([])
  
  // UI State
  const [viewMode, setViewMode] = useState<"list" | "board">("list")
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [propertyFilter, setPropertyFilter] = useState("all")

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    return {
      total: tasks.length,
      inProgress: tasks.filter(t => t.status === "IN_PROGRESS").length,
      pending: tasks.filter(t => ["PLANNED", "ASSIGNED"].includes(t.status)).length,
      issues: tasks.filter(t => t.status === "REJECTED").length
    }
  }, [tasks])

  useEffect(() => { loadData() }, [])

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const headers = { Authorization: `Bearer ${token}` }
      const params = { companyId: selectedCompanyId }

      const [tasksRes, propsRes, usersRes] = await Promise.all([
        axios.get("/api/tasks", { headers, params }),
        axios.get("/api/properties", { headers, params }),
        axios.get("/api/users", { headers, params })
      ])

      if (tasksRes.data.success) setTasks(tasksRes.data.data.tasks || [])
      if (propsRes.data.success) setProperties(propsRes.data.data.properties || [])
      if (usersRes.data.success) {
        const allUsers = Array.isArray(usersRes.data.data) ? usersRes.data.data : (usersRes.data.data.users || [])
        setUsers(allUsers.filter((u: User) => u.role?.toUpperCase() === "CLEANER" && u.isActive !== false))
      }
    } catch (error) {
      console.error("Data load failed", error)
      showToast("Failed to load data", "error")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (taskId: number) => {
    if (!confirm("Are you sure you want to delete this task?")) return
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.delete(`/api/tasks/${taskId}`, { headers: { Authorization: `Bearer ${token}` } })
      setTasks(prev => prev.filter(t => t.id !== taskId))
      showToast("Task deleted successfully")
    } catch (e) {
      showToast("Failed to delete task", "error")
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          task.property.address.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || task.status === statusFilter
    const matchesProperty = propertyFilter === "all" || task.property.id.toString() === propertyFilter
    return matchesSearch && matchesStatus && matchesProperty
  })

  return (
    <AdminLayout>
      <div className="relative h-[calc(100vh-theme(spacing.16))] flex flex-col max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Toast Container */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-in slide-in-from-bottom-5 fade-in ${t.type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
              {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {t.msg}
            </div>
          ))}
        </div>

        {/* Header & Stats */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Task Management</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> {stats.total} Total</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> {stats.inProgress} In Progress</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> {stats.pending} Pending</span>
              {stats.issues > 0 && <span className="flex items-center gap-1.5 text-red-600 font-medium"><div className="w-2 h-2 rounded-full bg-red-500"></div> {stats.issues} Issues</span>}
            </div>
          </div>
          <button
            onClick={() => { setSelectedTask(null); setIsDrawerOpen(true) }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
          >
            <Plus size={18} />
            Create Task
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by title or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-indigo-300 focus:ring-0 rounded-lg text-sm transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <div className="flex items-center border-l border-gray-200 pl-3 gap-2">
              <Filter size={16} className="text-gray-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm border-none bg-transparent text-gray-700 font-medium focus:ring-0 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
              </select>
            </div>

            <div className="flex items-center border-l border-gray-200 pl-3 gap-2">
              <MapPin size={16} className="text-gray-400" />
              <select 
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="text-sm border-none bg-transparent text-gray-700 font-medium focus:ring-0 cursor-pointer max-w-[150px] truncate"
              >
                <option value="all">All Properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
              </select>
            </div>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-lg ml-auto">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "board" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Grid size={18} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
              <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
          ) : viewMode === "list" ? (
            <TaskListView 
              tasks={filteredTasks} 
              onEdit={(t: Task) => { setSelectedTask(t); setIsDrawerOpen(true) }}
              onDelete={handleDelete}
            />
          ) : (
            <TaskBoardView 
              tasks={filteredTasks}
              onEdit={(t: Task) => { setSelectedTask(t); setIsDrawerOpen(true) }}
            />
          )}
        </div>
      </div>

      <TaskDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        task={selectedTask}
        properties={properties}
        users={users}
        onSave={() => { setIsDrawerOpen(false); loadData(); showToast("Task saved successfully") }}
        onError={(msg: string) => showToast(msg, "error")}
      />
    </AdminLayout>
  )
}

// --- List View ---
function TaskListView({ tasks, onEdit, onDelete }: { tasks: Task[], onEdit: (t: Task) => void, onDelete: (id: number) => void }) {
  if (tasks.length === 0) return <EmptyState />

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="overflow-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/80 backdrop-blur sticky top-0 z-10 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Info</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignee</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <tr key={task.id} className="group hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600" onClick={() => onEdit(task)}>{task.title}</span>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                      <MapPin size={12} />
                      <span className="truncate max-w-[200px]">{task.property.address}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-gray-700 flex items-center gap-1.5">
                      <Calendar size={14} className="text-gray-400" />
                      {formatSmartDate(task.scheduledDate)}
                    </span>
                    {task.isRecurring && (
                      <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                        <Repeat size={10} /> {task.recurringPattern}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {task.assignedUser ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm">
                        {task.assignedUser.firstName?.[0] || "U"}
                      </div>
                      <span className="text-sm text-gray-700">{task.assignedUser.firstName}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic bg-gray-50 px-2 py-1 rounded">Unassigned</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={task.status} />
                </td>
                <td className="px-6 py-4 text-right">
                   <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(task)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                        <FileText size={16} />
                      </button>
                      <button onClick={() => onDelete(task.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Board View ---
function TaskBoardView({ tasks, onEdit }: { tasks: Task[], onEdit: (t: Task) => void }) {
  return (
    <div className="h-full overflow-x-auto pb-4">
      <div className="flex gap-6 h-full min-w-max px-2">
        {BOARD_COLUMNS.map(status => {
           const columnTasks = tasks.filter((t) => t.status === status);
           const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
           
           return (
             <div key={status} className="w-80 flex flex-col h-full bg-gray-50/50 rounded-2xl border border-gray-200/60">
                {/* Column Header */}
                <div className={`p-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl ${config.bg}`}>
                   <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-')}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>{config.label}</span>
                   </div>
                   <span className="bg-white/60 px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 shadow-sm">{columnTasks.length}</span>
                </div>
                
                {/* Column Content */}
                <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                   {columnTasks.length === 0 ? (
                     <div className="h-24 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-xs">
                       Empty
                     </div>
                   ) : (
                     columnTasks.map((task) => (
                       <div 
                          key={task.id} 
                          onClick={() => onEdit(task)}
                          className="group bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all duration-200 relative"
                       >
                          <div className="flex justify-between items-start mb-2">
                             <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{task.title}</h4>
                             {task.isRecurring && <Repeat size={14} className="text-blue-500 shrink-0 ml-2" />}
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                             <MapPin size={12} className="shrink-0" />
                             <span className="truncate">{task.property.address}</span>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                             <div className={`flex items-center gap-1.5 text-xs ${!task.scheduledDate ? 'text-gray-400' : 'text-gray-600'}`}>
                               <Clock size={12} />
                               {task.scheduledDate ? new Date(task.scheduledDate).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : 'No Date'}
                             </div>
                             
                             {task.assignedUser ? (
                                <div className="flex items-center gap-1 bg-indigo-50 pl-1 pr-2 py-0.5 rounded-full">
                                   <div className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[8px] font-bold">
                                      {task.assignedUser.firstName?.[0]}
                                   </div>
                                   <span className="text-[10px] text-indigo-700 font-medium truncate max-w-[60px]">{task.assignedUser.firstName}</span>
                                </div>
                             ) : (
                               <div className="p-1 rounded bg-gray-100 text-gray-400"><UserIcon size={12} /></div>
                             )}
                          </div>
                       </div>
                     ))
                   )}
                </div>
             </div>
           )
        })}
      </div>
    </div>
  )
}

// --- Status Badge ---
function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.color} border ${config.border}`}>
            {config.label}
        </span>
    )
}

// --- Empty State ---
function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gray-50/30 rounded-xl border border-dashed border-gray-200">
       <div className="bg-white p-4 rounded-full mb-4 shadow-sm border border-gray-100">
           <Filter size={32} className="text-indigo-200" />
       </div>
       <h3 className="text-lg font-bold text-gray-900">No tasks found</h3>
       <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
         No tasks match your current filters. Try adjusting them or create a new task to get started.
       </p>
    </div>
  )
}

// --- Task Drawer ---
function TaskDrawer({ isOpen, onClose, task, properties, users, onSave, onError }: any) {
  const [formData, setFormData] = useState<any>({
    title: "", propertyId: "", assignedUserId: "", status: "DRAFT", 
    scheduledDate: "", description: "", isRecurring: false, recurringPattern: "weekly"
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (task) {
        setFormData({
            title: task.title,
            description: task.description || "",
            propertyId: task.property.id,
            assignedUserId: task.assignedUser?.id || "",
            status: task.status,
            scheduledDate: task.scheduledDate ? new Date(task.scheduledDate).toISOString().slice(0, 16) : "",
            isRecurring: task.isRecurring,
            recurringPattern: task.recurringPattern || "weekly"
        })
    } else {
        setFormData({ title: "", propertyId: "", status: "DRAFT", isRecurring: false, recurringPattern: "weekly", scheduledDate: "" })
    }
  }, [task, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
        const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
        const payload = {
            ...formData,
            propertyId: parseInt(formData.propertyId),
            assignedUserId: formData.assignedUserId ? parseInt(formData.assignedUserId) : undefined,
            scheduledDate: formData.scheduledDate ? new Date(formData.scheduledDate).toISOString() : undefined,
        }

        const url = task ? `/api/tasks/${task.id}` : "/api/tasks"
        const method = task ? "patch" : "post"
        
        await axios[method](url, payload, { headers: { Authorization: `Bearer ${token}` } })
        onSave()
    } catch (e) {
        onError("Operation failed. Please try again.")
    } finally {
        setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onClose} 
      />
      
      {/* Slide-over Panel */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{task ? "Edit Task" : "New Task"}</h2>
                <p className="text-xs text-gray-500 mt-1">Fill in the details below to manage this task.</p>
              </div>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Task Title <span className="text-red-500">*</span></label>
                      <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all placeholder:text-gray-400" placeholder="e.g. End of Tenancy Clean" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                          <div className="relative">
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 appearance-none bg-white">
                                {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                          </div>
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
                          <input type="datetime-local" value={formData.scheduledDate} onChange={e => setFormData({...formData, scheduledDate: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-indigo-500" />
                       </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Property <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <select required value={formData.propertyId} onChange={e => setFormData({...formData, propertyId: e.target.value})} className="w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 appearance-none bg-white">
                            <option value="">Select a property...</option>
                            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                        </select>
                        <MapPin className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Cleaner</label>
                      <div className="relative">
                        <select value={formData.assignedUserId} onChange={e => setFormData({...formData, assignedUserId: e.target.value})} className="w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 appearance-none bg-white">
                            <option value="">Unassigned</option>
                            {users.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                        </select>
                        <UserIcon className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                      </div>
                  </div>

                  <div className={`p-4 rounded-xl border transition-all ${formData.isRecurring ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                      <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={formData.isRecurring} onChange={e => setFormData({...formData, isRecurring: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                          <span className="text-sm font-medium text-gray-800">Repeat this task</span>
                      </label>
                      
                      {formData.isRecurring && (
                         <div className="mt-3 pl-8 animate-in slide-in-from-top-2 fade-in">
                             <label className="text-xs font-semibold text-indigo-800 uppercase tracking-wide block mb-1">Frequency</label>
                             <div className="flex gap-2">
                               {['daily', 'weekly', 'monthly'].map((p) => (
                                 <button
                                  key={p} type="button"
                                  onClick={() => setFormData({...formData, recurringPattern: p})}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-md border ${formData.recurringPattern === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                 >
                                   {p.charAt(0).toUpperCase() + p.slice(1)}
                                 </button>
                               ))}
                             </div>
                         </div>
                      )}
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                      <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 resize-none" placeholder="Add any specific instructions or notes..." />
                  </div>
              </div>
          </form>

          <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3">
               <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  Cancel
               </button>
               <button 
                  onClick={handleSubmit} 
                  disabled={loading}
                  className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shadow-indigo-200"
               >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {task ? "Save Changes" : "Create Task"}
               </button>
          </div>
      </div>
    </>
  )
}