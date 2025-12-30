"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"

interface Task {
  id: number
  title: string
  scheduledDate: string
  property: {
    id: number
    address: string
  }
  assignedUser?: {
    id: number
    firstName?: string
    lastName?: string
    email: string
  }
  status: string
}

interface Cleaner {
  id: number
  email: string
  firstName?: string
  lastName?: string
  workload: number
  availability: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    isAvailable: boolean
  }>
}

interface RotaData {
  tasks: Task[]
  cleaners: Cleaner[]
  conflicts: Array<{
    taskId: number
    cleanerId: number
    reason: string
  }>
}

export default function RotaBuilderPage() {
  const [rotaData, setRotaData] = useState<RotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1)
    return monday.toISOString().split("T")[0]
  })
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [showConflicts, setShowConflicts] = useState(false)

  useEffect(() => {
    loadRota()
  }, [selectedWeek])

  const getWeekDates = () => {
    const start = new Date(selectedWeek)
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const getWeekStartEnd = () => {
    const start = new Date(selectedWeek)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    }
  }

  const loadRota = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const { start, end } = getWeekStartEnd()

      const params: any = { weekStart: start, weekEnd: end }
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }

      const [rotaRes, conflictsRes] = await Promise.all([
        axios.get("/api/admin/rota", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }),
        axios.get("/api/admin/rota/conflicts", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }),
      ])

      if (rotaRes.data.success && conflictsRes.data.success) {
        setRotaData({
          tasks: rotaRes.data.data.tasks || [],
          cleaners: rotaRes.data.data.cleaners || [],
          conflicts: conflictsRes.data.data.conflicts || [],
        })
      }
    } catch (error) {
      console.error("Error loading rota:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async (taskId: number, cleanerId: number | null) => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.post(
        "/api/admin/rota/assign",
        { taskId, cleanerId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      loadRota()
    } catch (error) {
      console.error("Error assigning task:", error)
      alert("Failed to assign task")
    }
  }

  const handleDragStart = (task: Task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, cleanerId: number) => {
    e.preventDefault()
    if (draggedTask) {
      await handleAssign(draggedTask.id, cleanerId)
      setDraggedTask(null)
    }
  }

  const handleUnassign = async (taskId: number) => {
    await handleAssign(taskId, null)
  }

  const handleCloneWeek = async () => {
    if (!confirm("Clone this week's assignments to next week?")) return

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const { start, end } = getWeekStartEnd()
      
      const payload: any = { weekStart: start, weekEnd: end }
      if (selectedCompanyId) {
        payload.companyId = parseInt(selectedCompanyId)
      }
      
      await axios.post(
        "/api/admin/rota/week-clone",
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      alert("Week cloned successfully!")
      const nextWeek = new Date(selectedWeek)
      nextWeek.setDate(nextWeek.getDate() + 7)
      setSelectedWeek(nextWeek.toISOString().split("T")[0])
      loadRota() // Reload rota to show cloned tasks
    } catch (error: any) {
      console.error("Error cloning week:", error)
      const errorMessage = error.response?.data?.message || "Failed to clone week"
      alert(errorMessage)
    }
  }

  const getTasksForDay = (date: Date) => {
    if (!rotaData) return []
    const dateStr = date.toISOString().split("T")[0]
    return rotaData.tasks.filter(
      (task) => task.scheduledDate && task.scheduledDate.split("T")[0] === dateStr
    )
  }

  const getTasksForCleaner = (cleanerId: number) => {
    if (!rotaData) return []
    return rotaData.tasks.filter((task) => task.assignedUser?.id === cleanerId)
  }

  const weekDates = getWeekDates()
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Rota Builder</h1>
              <p className="text-gray-600 mt-1">Visual calendar for weekly cleaner assignments</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloneWeek}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Clone Week
              </button>
              {rotaData && rotaData.conflicts.length > 0 && (
                <button
                  onClick={() => setShowConflicts(!showConflicts)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Conflicts ({rotaData.conflicts.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Week Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  const prevWeek = new Date(selectedWeek)
                  prevWeek.setDate(prevWeek.getDate() - 7)
                  setSelectedWeek(prevWeek.toISOString().split("T")[0])
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Previous
              </button>
              <input
                type="date"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={() => {
                  const nextWeek = new Date(selectedWeek)
                  nextWeek.setDate(nextWeek.getDate() + 7)
                  setSelectedWeek(nextWeek.toISOString().split("T")[0])
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Next →
              </button>
              <button
                onClick={() => {
                  const today = new Date()
                  const monday = new Date(today)
                  monday.setDate(today.getDate() - today.getDay() + 1)
                  setSelectedWeek(monday.toISOString().split("T")[0])
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                This Week
              </button>
            </div>
          </div>
        </div>

        {/* Conflicts Alert */}
        {showConflicts && rotaData && rotaData.conflicts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-red-900 mb-2">Conflicts Detected</h3>
            <ul className="space-y-1">
              {rotaData.conflicts.map((conflict, idx) => (
                <li key={idx} className="text-sm text-red-800">
                  • {conflict.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
          </div>
        ) : rotaData ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Calendar Grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 w-48">
                      Cleaner
                    </th>
                    {weekDates.map((date, idx) => (
                      <th
                        key={idx}
                        className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border-l border-gray-200 min-w-[200px]"
                      >
                        <div>{dayNames[idx]}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rotaData.cleaners.map((cleaner) => (
                    <tr key={cleaner.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {cleaner.firstName && cleaner.lastName
                            ? `${cleaner.firstName} ${cleaner.lastName}`
                            : cleaner.email}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {getTasksForCleaner(cleaner.id).length} tasks
                        </div>
                      </td>
                      {weekDates.map((date, dayIdx) => {
                        const dayTasks = getTasksForDay(date).filter(
                          (task) => task.assignedUser?.id === cleaner.id
                        )
                        return (
                          <td
                            key={dayIdx}
                            className="px-2 py-2 border-l border-gray-200 align-top"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, cleaner.id)}
                          >
                            <div className="space-y-1 min-h-[60px]">
                              {dayTasks.map((task) => (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={() => handleDragStart(task)}
                                  className="bg-cyan-100 border border-cyan-300 rounded p-2 text-xs cursor-move hover:bg-cyan-200"
                                >
                                  <div className="font-medium text-gray-900 truncate">
                                    {task.property.address}
                                  </div>
                                  <div className="text-gray-600 truncate">{task.title}</div>
                                  <button
                                    onClick={() => handleUnassign(task.id)}
                                    className="mt-1 text-red-600 hover:text-red-800 text-xs"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {/* Unassigned Tasks Row */}
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td className="px-4 py-3 font-medium text-gray-900">Unassigned</td>
                    {weekDates.map((date, dayIdx) => {
                      const dayTasks = getTasksForDay(date).filter((task) => !task.assignedUser)
                      return (
                        <td key={dayIdx} className="px-2 py-2 border-l border-gray-200 align-top">
                          <div className="space-y-1 min-h-[60px]">
                            {dayTasks.map((task) => (
                              <div
                                key={task.id}
                                draggable
                                onDragStart={() => handleDragStart(task)}
                                className="bg-yellow-100 border border-yellow-300 rounded p-2 text-xs cursor-move hover:bg-yellow-200"
                              >
                                <div className="font-medium text-gray-900 truncate">
                                  {task.property.address}
                                </div>
                                <div className="text-gray-600 truncate">{task.title}</div>
                                <div className="text-xs text-gray-500 mt-1">Drag to assign</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No rota data available
          </div>
        )}
      </div>
    </AdminLayout>
  )
}


