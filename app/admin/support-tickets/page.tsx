"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { Mail, MessageSquare, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { PERMISSIONS } from "@/lib/permissions";
import { usePermissions } from "@/lib/hooks/usePermissions";
import RequirePermission from "@/components/RequirePermission";

interface SupportTicketMessage {
  id: number
  author: string
  message: string
  createdAt: string
}

interface SupportTicket {
  id: number
  email: string
  name?: string | null
  subject: string
  status: string
  createdAt: string
  resolvedAt?: string | null
  messages?: SupportTicketMessage[]
}

type StatusFilter = "all" | "open" | "in_progress" | "closed"

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [replyMessage, setReplyMessage] = useState("")
  const [replySending, setReplySending] = useState(false)
  const [sendEmailToUser, setSendEmailToUser] = useState(true)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const { hasPermission } = usePermissions()
  const loadTickets = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

      const params: any = {}
      if (statusFilter !== "all") {
        params.status = statusFilter
      }

      const res = await axios.get("/api/admin/support-tickets", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (res.data.success) {
        setTickets(res.data.data.tickets || [])
        if (selectedTicket) {
          const updatedSelected = res.data.data.tickets.find((t: SupportTicket) => t.id === selectedTicket.id) || null
          setSelectedTicket(updatedSelected)
        }
      } else {
        setError(res.data.message || "Failed to load support tickets")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to load support tickets")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const handleSelectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket)
    setReplyMessage("")
  }

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return

    setReplySending(true)
    setStatusUpdating(true)
    setError(null)

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const res = await axios.patch(
        `/api/admin/support-tickets/${selectedTicket.id}`,
        {
          status: selectedTicket.status,
          replyMessage: replyMessage || undefined,
          sendEmail: sendEmailToUser && !!replyMessage.trim(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.data.success) {
        await loadTickets()
        setReplyMessage("")
      } else {
        setError(res.data.message || "Failed to update ticket")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to update ticket")
    } finally {
      setReplySending(false)
      setStatusUpdating(false)
    }
  }

  const statusBadge = (status: string) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    if (status === "open") {
      return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>Open</span>
    }
    if (status === "in_progress") {
      return <span className={`${base} bg-sky-50 text-sky-700 border border-sky-200`}>In progress</span>
    }
    if (status === "closed") {
      return <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>Closed</span>
    }
    return <span className={`${base} bg-slate-50 text-slate-700 border border-slate-200`}>{status}</span>
  }

  return (
    <RequirePermission permission={PERMISSIONS.SUPPORT_TICKETS_CREATE}>
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="text-indigo-600" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
              <p className="text-gray-600 mt-1">
                View and respond to support requests submitted from the public support form.
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            <XCircle size={18} className="text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tickets list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Tickets</h2>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
                <button
                  type="button"
                  onClick={loadTickets}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Refresh
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
              {tickets.length === 0 && !loading && (
                <div className="py-10 text-center text-sm text-gray-500">
                  <AlertCircle className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                  No tickets found for this filter.
                </div>
              )}
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => handleSelectTicket(ticket)}
                  className={`w-full text-left px-3 py-3 hover:bg-gray-50 flex flex-col gap-1 ${
                    selectedTicket?.id === ticket.id ? "bg-indigo-50/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[180px]">
                        {ticket.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ticket.status === "open" && (
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
                      )}
                      {statusBadge(ticket.status)}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-gray-900 truncate">{ticket.subject}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {new Date(ticket.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Ticket detail / reply */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            {selectedTicket ? (
              <>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">
                      Ticket #{selectedTicket.id}
                    </h2>
                    <div className="text-xs text-gray-600">
                      From:{" "}
                      <span className="font-medium">
                        {selectedTicket.name
                          ? `${selectedTicket.name} <${selectedTicket.email}>`
                          : selectedTicket.email}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Created at:{" "}
                      {new Date(selectedTicket.createdAt).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {selectedTicket.resolvedAt && (
                      <div className="text-xs text-gray-500">
                        Resolved at:{" "}
                        {new Date(selectedTicket.resolvedAt).toLocaleString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                  <div>{statusBadge(selectedTicket.status)}</div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-1">Subject</div>
                  <div className="text-sm text-gray-900 border border-gray-100 rounded-md px-3 py-2 bg-gray-50">
                    {selectedTicket.subject}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-1">Conversation</div>
                  <div className="border border-gray-100 rounded-md px-3 py-2 bg-gray-50 max-h-48 overflow-y-auto space-y-2">
                    {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                      selectedTicket.messages.map((msg) => {
                        const isAdmin = msg.author === "admin"
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] ${
                                isAdmin
                                  ? "bg-indigo-600 text-white rounded-br-none"
                                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-none"
                              }`}
                            >
                              <div className="font-semibold mb-0.5">
                                {isAdmin ? "Admin" : selectedTicket.name || selectedTicket.email}
                              </div>
                              <div className="whitespace-pre-wrap text-[11px]">{msg.message}</div>
                              <div
                                className={`mt-1 text-[10px] ${
                                  isAdmin ? "text-indigo-100/80" : "text-gray-400"
                                }`}
                              >
                                {new Date(msg.createdAt).toLocaleString(undefined, {
                                  day: "2-digit",
                                  month: "short",
                                  year: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-[11px] text-gray-500 text-center py-4">
                        No messages in this ticket yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ticket status
                  </label>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) =>
                      setSelectedTicket({ ...selectedTicket, status: e.target.value })
                    }
                    className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reply (optional)
                  </label>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={4}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                    placeholder="Write your reply to the user. If you choose to send email, this text will be emailed to them."
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={sendEmailToUser}
                      onChange={(e) => setSendEmailToUser(e.target.checked)}
                    />
                    <span>Send this reply by email to the user</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleUpdateTicket}
                    disabled={replySending || statusUpdating}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {(replySending || statusUpdating) && (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    )}
                    Save changes
                  </button>
                </div>

                <p className="mt-2 text-[11px] text-gray-500">
                  Closing a ticket will mark it as resolved. You can reopen it later by changing the
                  status back to &quot;Open&quot; or &quot;In progress&quot;.
                </p>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-sm text-gray-500">
                <MessageSquare className="w-6 h-6 mb-2 text-gray-400" />
                <p>Select a ticket from the list to view details and reply.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
    </RequirePermission>
  )
}

