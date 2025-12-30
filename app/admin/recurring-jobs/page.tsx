"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"

interface RecurringTask {
  id: number
  title: string
  description?: string
  recurringPattern: string
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
  scheduledDate?: string
  createdAt: string
  childTasks: Array<{
    id: number
    scheduledDate: string
    status: string
  }>
}

export default function RecurringJobsPage() {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [patternFilter, setPatternFilter] = useState("all")

  useEffect(() => {
    loadRecurringTasks()
  }, [])

  const loadRecurringTasks = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      const params: any = { isRecurring: true }
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }
      
      const response = await axios.get("/api/tasks", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (response.data.success) {
        // Filter to only parent tasks (those without a parentTaskId)
        const parentTasks = response.data.data.tasks.filter(
          (task: any) => task.isRecurring && !task.parentTaskId
        )
        setRecurringTasks(parentTasks)
      }
    } catch (error) {
      console.error("Error loading recurring tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateInstances = async (taskId: number, count: number = 4) => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.post(
        "/api/tasks/recurring",
        { parentTaskId: taskId, count },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      alert(`Generated ${count} instances successfully!`)
      loadRecurringTasks()
    } catch (error) {
      console.error("Error generating instances:", error)
      alert("Failed to generate instances")
    }
  }

  const handleDelete = async (taskId: number) => {
    if (!confirm("Are you sure you want to delete this recurring job series? This will also delete all generated instances."))
      return

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.delete(`/api/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      loadRecurringTasks()
    } catch (error) {
      console.error("Error deleting recurring task:", error)
      alert("Failed to delete recurring job")
    }
  }

  const filteredTasks = recurringTasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.property.address.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesPattern = patternFilter === "all" || task.recurringPattern === patternFilter
    return matchesSearch && matchesPattern
  })

  const getPatternBadge = (pattern: string) => {
    const colors: Record<string, string> = {
      daily: "bg-blue-100 text-blue-800",
      weekly: "bg-green-100 text-green-800",
      biweekly: "bg-yellow-100 text-yellow-800",
      monthly: "bg-purple-100 text-purple-800",
    }
    return colors[pattern] || "bg-gray-100 text-gray-800"
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Recurring Jobs</h1>
              <p className="text-gray-600 mt-1">Manage recurring task series and generate instances</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search recurring jobs..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pattern</label>
              <select
                value={patternFilter}
                onChange={(e) => setPatternFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="all">All Patterns</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        </div>

        {/* Recurring Jobs List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Instances
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{task.title}</div>
                          {task.description && (
                            <div className="text-xs text-gray-500 mt-1">{task.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {task.property.address}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getPatternBadge(
                            task.recurringPattern
                          )}`}
                        >
                          {task.recurringPattern}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.assignedUser
                          ? `${task.assignedUser.firstName || ""} ${task.assignedUser.lastName || ""}`.trim() ||
                            task.assignedUser.email
                          : "Unassigned"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <span className="font-medium">{task.childTasks?.length || 0}</span> generated
                        </div>
                        {task.childTasks && task.childTasks.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            {task.childTasks.filter((t) => t.status === "APPROVED").length} completed
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/tasks/${task.id}`}
                            className="text-cyan-600 hover:text-cyan-900"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleGenerateInstances(task.id, 4)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Generate 4
                          </button>
                          <button
                            onClick={() => handleGenerateInstances(task.id, 8)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Generate 8
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredTasks.length === 0 && (
            <div className="p-12 text-center text-gray-500">No recurring jobs found</div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}


