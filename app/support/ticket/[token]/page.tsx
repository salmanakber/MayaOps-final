"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { usePermissions } from "@/lib/hooks/usePermissions";
import RequirePermission from "@/components/RequirePermission";

interface TicketMessage {
  id: number;
  author: string;
  message: string;
  createdAt: string;
}

interface TicketData {
  id: number;
  subject: string;
  status: string;
  email: string;
  name?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  messages: TicketMessage[];
}

export default function PublicTicketPage() {
  const { hasPermission } = usePermissions()
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadTicket = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/support-tickets/${token}/messages`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load ticket");
      }
      setTicket(data.data);
    } catch (err: any) {
      setError(err.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !token) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/support-tickets/${token}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: reply }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send reply");
      }
      setReply("");
      await loadTicket();
    } catch (err: any) {
      setError(err.message || "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    if (status === "open") {
      return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>Open</span>;
    }
    if (status === "in_progress") {
      return (
        <span className={`${base} bg-sky-50 text-sky-700 border border-sky-200`}>In progress</span>
      );
    }
    if (status === "closed") {
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>
          Closed
        </span>
      );
    }
    return (
      <span className={`${base} bg-slate-50 text-slate-700 border border-slate-200`}>{status}</span>
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="text-sm text-slate-600">Loading your support ticket...</div>
      </main>
    );
  }

  if (error || !ticket) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Ticket not available</h1>
          <p className="text-sm text-slate-600 mb-2">
            We were unable to load your support ticket. The link may have expired or the ticket may
            have been removed.
          </p>
          {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
        </div>
      </main>
    );
  }

  const customerName = ticket.name || ticket.email;

  return (
    <RequirePermission permission={PERMISSIONS.SUPPORT_TICKETS_VIEW}>
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
          Support Ticket Conversation
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Hi{" "}
          <span className="font-semibold">
            {customerName}
          </span>
          , here you can view the conversation with the MayaOps support team and send additional
          replies if needed.
        </p>

        <div className="flex items-center justify-between mb-4 text-xs text-slate-600">
          <div>
            <div className="font-semibold text-slate-800">Subject: {ticket.subject}</div>
            <div>
              Created:{" "}
              {new Date(ticket.createdAt).toLocaleString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            {ticket.resolvedAt && (
              <div>
                Resolved:{" "}
                {new Date(ticket.resolvedAt).toLocaleString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <div>{statusBadge(ticket.status)}</div>
        </div>

        {/* Messages thread */}
        <div className="border border-slate-200 rounded-xl mb-4 max-h-80 overflow-y-auto bg-slate-50/80 p-3 space-y-3">
          {ticket.messages.map((msg) => {
            const isAdmin = msg.author === "admin";
            return (
              <div
                key={msg.id}
                className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                    isAdmin
                      ? "bg-sky-600 text-white rounded-br-none"
                      : "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                  }`}
                >
                  <div className="mb-1 font-semibold">
                    {isAdmin ? "MayaOps Support" : customerName || "You"}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.message}</div>
                  <div
                    className={`mt-1 text-[10px] ${
                      isAdmin ? "text-sky-100/80" : "text-slate-400"
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
            );
          })}
          {ticket.messages.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4">
              No messages in this ticket yet.
            </div>
          )}
        </div>

        {/* Reply form */}
        <form onSubmit={handleReply} className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            Your reply (this will be sent to the MayaOps support team)
          </label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
            placeholder="Type your message here..."
          />
          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? "Sending..." : "Send reply"}
          </button>
          <p className="text-[11px] text-slate-500 mt-1">
            Your reply will be added to this ticket and our support team will be notified by email.
          </p>
        </form>
      </div>
    </main>
    </RequirePermission>
  );
}

