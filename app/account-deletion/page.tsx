"use client";

import { useState } from "react";

export default function AccountDeletionPage() {
  // --- EXISTING LOGIC (Unchanged) ---
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"enterEmail" | "enterOtp" | "done">("enterEmail");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
 

  const handleSendOtp = async () => {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter the email address associated with your MayaOps account.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, method: "email" }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send verification code.");
      }

      setMessage("We have sent a 6‑digit verification code to your email.");
      setStep("enterOtp");
    } catch (err: any) {
      setError(err.message || "Something went wrong while sending the verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletion = async () => {
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();

    if (!trimmedOtp) {
      setError("Please enter the verification code we sent to your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, otp: trimmedOtp }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to submit account deletion request.");
      }

      if (data.data?.scheduledDeletionAt) {
        setScheduledDate(data.data.scheduledDeletionAt);
      }

      setMessage(
        "Your account deletion request has been received. Your account is scheduled for deletion in 15 days."
      );
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Something went wrong while submitting your request.");
    } finally {
      setLoading(false);
    }
  };

  const formattedScheduledDate =
    scheduledDate && new Date(scheduledDate).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // --- NEW UI DESIGN ---
  return (
    
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      
      {/* Brand / Header Area */}
      <div className="mb-8 text-center">
        {/* Replace text with <img src="/logo.png" /> if you have a logo */}
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">MayaOps</h2>
        <p className="text-sm text-gray-500 mt-1">Data Safety & Privacy Center</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        
        {/* Top Accent Bar */}
        <div className={`h-2 w-full ${step === 'done' ? 'bg-green-500' : 'bg-red-600'}`}></div>

        <div className="p-6 sm:p-8">
          
          {/* Section: Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {step === 'done' ? 'Request Submitted' : 'Request Account Deletion'}
            </h1>
            <p className="text-gray-600 text-sm mt-2 leading-relaxed">
              Use this form to request the permanent removal of your MayaOps account and associated data. 
            </p>
          </div>

          {/* Section: Success State (Only shows when done) */}
          {step === "done" ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center animate-in fade-in zoom-in duration-300">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-green-900 mb-2">Deletion Scheduled</h3>
              <p className="text-green-800 text-sm mb-4">
                Your account is queued for deletion. You will lose access to your data on:
              </p>
              {formattedScheduledDate && (
                <div className="inline-block bg-white px-4 py-2 rounded-lg border border-green-200 font-medium text-green-700 shadow-sm mb-4">
                  {formattedScheduledDate}
                </div>
              )}
              <p className="text-xs text-green-700/80">
                You may close this window. A confirmation email has been sent to {email}.
              </p>
            </div>
          ) : (
            <>
              {/* Section: Information Accordion/Box */}
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">Before you proceed</h3>
                    <div className="mt-2 text-sm text-amber-700/90 space-y-2">
                      <p>By submitting this request, the following data will be permanently removed:</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs">
                        <li>User profile information (Name, Email, Phone)</li>
                        <li>App usage history and logs</li>
                        <li>Uploaded media and documents</li>
                      </ul>
                      <p className="font-semibold pt-1">
                        Note: There is a 15-day safety grace period during which you can contact support to reverse this action.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Status Messages */}
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                   <svg className="h-5 w-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                   <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              {message && !error && (
                 <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <svg className="h-5 w-5 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-blue-700">{message}</p>
                 </div>
              )}

              {/* Section: Input Form */}
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Verified Account Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={step !== "enterEmail" || loading}
                      placeholder="name@company.com"
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:text-gray-500 transition-colors sm:text-sm"
                    />
                  </div>
                </div>

                {(step === "enterOtp") && (
                  <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                      Verification Code
                    </label>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      disabled={loading}
                      maxLength={6}
                      placeholder="123456"
                      className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm tracking-widest text-center font-mono"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Check your email inbox and spam folder.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  {step === "enterEmail" && (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={loading}
                      className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-wait transition-all"
                    >
                      {loading ? "Sending..." : "Continue & Verify"}
                    </button>
                  )}

                  {step === "enterOtp" && (
                    <div className="flex flex-col gap-3">
                       <button
                        type="button"
                        onClick={handleConfirmDeletion}
                        disabled={loading}
                        className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-wait transition-all"
                      >
                        {loading ? "Processing..." : "Permanently Delete Account"}
                      </button>
                      
                      <button 
                        onClick={() => { setStep('enterEmail'); setOtp(''); }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
                      >
                        Use a different email address
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Card Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
           <span className="text-xs text-gray-400">MayaOps Inc.</span>
           <a href="/support" className="text-xs text-gray-500 hover:text-gray-900 font-medium">Contact Support</a>
        </div>
      </div>
    </div>
    
  );
}