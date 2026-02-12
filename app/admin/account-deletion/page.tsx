"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, XCircle } from "lucide-react"

interface DeletionRequest {
  id: number
  email: string
  status: string
  requestedAt: string
  scheduledDeletionAt: string
  processedAt?: string | null
  user?: {
    id: number
    email: string
    firstName?: string | null
    lastName?: string | null
    role: string
    companyId?: number | null
  } | null
}

type StatusFilter = "all" | "pending" | "cancelled" | "processed"

export default function AccountDeletionAdminPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending")
  const [selected, setSelected] = useState<DeletionRequest | null>(null)
  const [updating, setUpdating] = useState(false)

  const loadRequests = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

      const params: any = {}
      if (statusFilter !== "all") {
        params.status = statusFilter
      }

      const res = await axios.get("/api/admin/account-deletion-requests", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (res.data.success) {
        const list: DeletionRequest[] = res.data.data.requests || []
        setRequests(list)
        if (selected) {
          const updatedSel = list.find((r) => r.id === selected.id) || null
          setSelected(updatedSel)
        }
      } else {
        setError(res.data.message || "Failed to load account deletion requests")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to load account deletion requests")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const updateStatus = async (newStatus: "pending" | "cancelled" | "processed") => {
    if (!selected) return
    setUpdating(true)
    setError(null)
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const res = await axios.patch(
        `/api/admin/account-deletion-requests/${selected.id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.data.success) {
        await loadRequests()
      } else {
        setError(res.data.message || "Failed to update request")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to update request")
    } finally {
      setUpdating(false)
    }
  }

  const statusBadge = (status: string) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    if (status === "pending") {
      return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>Pending</span>
    }
    if (status === "cancelled") {
      return <span className={`${base} bg-slate-50 text-slate-600 border border-slate-200`}>Cancelled</span>
    }
    if (status === "processed") {
      return <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>Processed</span>
    }
    return <span className={`${base} bg-slate-50 text-slate-700 border border-slate-200`}>{status}</span>
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-rose-600" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Account Deletion Requests</h1>
              <p className="text-gray-600 mt-1">
                Review and control user account deletion requests submitted from the public deletion page.
              </p>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold mb-1">How this works:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              When a user verifies their email on the public deletion page, a{" "}
              <span className="font-semibold">pending</span> request is created with a scheduled deletion date
              (15 days from request).
            </li>
            <li>
              You can <span className="font-semibold">cancel</span> a request to prevent automatic deletion, or mark
              it as <span className="font-semibold">processed</span> once the account has been fully removed.
            </li>
            <li>
              A separate cron job should permanently delete accounts where the request is pending and the scheduled
              deletion date has passed.
            </li>
          </ul>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            <XCircle size={18} className="text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requests list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Requests</h2>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="pending">Pending</option>
                  <option value="processed">Processed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="all">All</option>
                </select>
                <button
                  type="button"
                  onClick={loadRequests}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Refresh
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
              {requests.length === 0 && !loading && (
                <div className="py-8 text-center text-sm text-gray-500">
                  No requests found for this filter.
                </div>
              )}
              {requests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setSelected(req)}
                  className={`w-full text-left px-3 py-3 hover:bg-gray-50 flex flex-col gap-1 ${
                    selected?.id === req.id ? "bg-rose-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-gray-800 truncate max-w-[180px]">
                      {req.email}
                    </div>
                    {statusBadge(req.status)}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    Requested:{" "}
                    {new Date(req.requestedAt).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    Scheduled deletion:{" "}
                    {new Date(req.scheduledDeletionAt).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Request detail / actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">
                      Request #{selected.id}
                    </h2>
                    <div className="text-xs text-gray-600">
                      User:{" "}
                      <span className="font-medium">
                        {selected.user?.firstName || selected.user?.lastName
                          ? `${selected.user?.firstName || ""} ${selected.user?.lastName || ""}`.trim()
                          : selected.email}
                      </span>{" "}
                      <span className="text-gray-400">
                        ({selected.user?.email || selected.email})
                      </span>
                    </div>
                    {selected.user?.role && (
                      <div className="text-[11px] text-gray-500">
                        Role: {selected.user.role.replace("_", " ").toLowerCase()}
                      </div>
                    )}
                  </div>
                  <div>{statusBadge(selected.status)}</div>
                </div>

                <div className="mb-3 text-xs text-gray-700 space-y-1">
                  <div>
                    <span className="font-semibold">Requested at:</span>{" "}
                    {new Date(selected.requestedAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold">Scheduled deletion:</span>{" "}
                    {new Date(selected.scheduledDeletionAt).toLocaleString()}
                  </div>
                  {selected.processedAt && (
                    <div>
                      <span className="font-semibold">Processed at:</span>{" "}
                      {new Date(selected.processedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    <CalendarClock className="w-3 h-3 text-gray-400" />
                    Pending requests will be picked up by the cron job once the scheduled deletion
                    date is reached.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => updateStatus("cancelled")}
                      disabled={updating || selected.status === "cancelled"}
                      className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Cancel request
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus("pending")}
                      disabled={updating || selected.status === "pending"}
                      className="inline-flex items-center rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Mark as pending
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus("processed")}
                      disabled={updating || selected.status === "processed"}
                      className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Mark as processed
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-sm text-gray-500">
                <AlertTriangle className="w-6 h-6 mb-2 text-gray-400" />
                <p>Select a request from the list to view details and update its status.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

