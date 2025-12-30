"use client"

import React, { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { 
  FileSpreadsheet, 
  ArrowRight, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Map as MapIcon, 
  Database,
  RefreshCw,
  Link as LinkIcon,
  Search,
  ChevronDown,
  ChevronUp
} from "lucide-react"

// --- Types ---
interface SyncResult {
  createdProperties: number
  updatedProperties: number
  geocodedAddresses: number
  errors: number
  totalProcessed: number
}

interface Company {
  id: number
  name: string
}

interface ColumnMapping {
  [sheetColumn: string]: string
}

const DATABASE_FIELDS = [
  { value: "", label: "Ignore this column" },
  { value: "address", label: "📍 Address (Required)" },
  { value: "postcode", label: "📮 Postcode" },
  { value: "latitude", label: "🌍 Latitude" },
  { value: "longitude", label: "🌍 Longitude" },
  { value: "propertyType", label: "Rx Property Type" },
  { value: "checkInDate", label: "📅 Check-in Date" },
  { value: "checkOutDate", label: "📅 Check-out Date" },
  { value: "cleaningDate", label: "🧹 Cleaning Date" },
  { value: "notes", label: "📝 Notes" },
]

export default function SheetsSyncPage() {
  // --- State ---
  const [spreadsheetInput, setSpreadsheetInput] = useState("") // Stores URL or ID
  const [spreadsheetId, setSpreadsheetId] = useState("")       // Stores extracted ID
  const [range, setRange] = useState("Sheet1!A1:F100")
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  
  // UI State
  const [loading, setLoading] = useState(false)
  const [loadingHeaders, setLoadingHeaders] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showMappingModal, setShowMappingModal] = useState(false)
  
  // Data State
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState("")
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})

  useEffect(() => {
    loadCompanies()
  }, [])

  // Smart ID Extraction
  useEffect(() => {
    const extractId = (input: string) => {
      // Regex to find ID between /d/ and /
      const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/)
      return match ? match[1] : input
    }
    setSpreadsheetId(extractId(spreadsheetInput))
  }, [spreadsheetInput])

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      let response
      try {
        response = await axios.get("/api/admin/companies", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.data.success) {
          setCompanies(response.data.data || [])
          return
        }
      } catch (e) {
        // Fallback
      }
      response = await axios.get("/api/companies", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.data.success) {
        setCompanies(response.data.data?.companies || [])
      }
    } catch (error) {
      console.error("Error loading companies:", error)
    }
  }

  const handleLoadHeaders = async () => {
    if (!spreadsheetId.trim()) {
      setError("Please enter a valid Spreadsheet URL or ID")
      return
    }

    try {
      setLoadingHeaders(true)
      setError("")
      setResult(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.put("/api/sheets/sync", {
        spreadsheetId,
        range,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        const headers = response.data.data.headers
        setSheetHeaders(headers)
        
        // Auto-match common headers
        const initialMapping: ColumnMapping = {}
        headers.forEach((header: string) => {
          const lowerHeader = header.toLowerCase()
          const match = DATABASE_FIELDS.find(f => 
            f.value && (lowerHeader.includes(f.value.toLowerCase()) || f.label.toLowerCase().includes(lowerHeader))
          )
          initialMapping[header] = match ? match.value : ""
        })
        
        setColumnMapping(initialMapping)
        setShowMappingModal(true)
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || "Failed to load sheet headers"
      setError(errorMessage)
    } finally {
      setLoadingHeaders(false)
    }
  }

  const handleSync = async () => {
    if (!companyId) return setError("Please select a company")
    
    if (!Object.values(columnMapping).includes("address")) {
        // Simple visual shake or alert could go here
        alert("Please map at least one column to 'Address'")
        return
    }

    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.post("/api/sheets/sync", {
        spreadsheetId,
        range,
        companyId,
        columnMapping,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setResult(response.data.data)
        setShowMappingModal(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to sync sheets")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="text-green-600" />
              Google Sheets Sync
            </h1>
            <p className="text-gray-500 mt-1">Import properties and tasks directly from your spreadsheets.</p>
          </div>
          <button 
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors"
          >
            <HelpCircle size={18} />
            {showInstructions ? "Hide Guide" : "Setup Guide"}
            {showInstructions ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
          </button>
        </div>

        {/* Collapsible Instructions */}
        {showInstructions && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 animate-in slide-in-from-top-2 duration-200">
            <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <CheckCircle2 size={18} /> 
              Prerequisites
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-indigo-800 ml-1">
              <li>Ensure your Google Sheet has a header row.</li>
              <li>
                Share the sheet with the Service Account Email: <br/>
                <code className="bg-white/50 px-2 py-0.5 rounded mt-1 inline-block select-all text-indigo-600 font-mono">
                  (Check your GOOGLE_SHEETS_CREDENTIALS env var)
                </code>
              </li>
              <li>Copy the URL from your browser address bar.</li>
            </ol>
          </div>
        )}

        {/* Main Configuration Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 md:p-8 space-y-6">
                {/* ID / URL Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Spreadsheet URL or ID
                    </label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <LinkIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={spreadsheetInput}
                            onChange={(e) => setSpreadsheetInput(e.target.value)}
                            placeholder="Paste the full Google Sheet URL here..."
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-shadow"
                        />
                    </div>
                    {spreadsheetId && spreadsheetId !== spreadsheetInput && (
                        <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            ID extracted: <span className="font-mono">{spreadsheetId.substring(0, 15)}...</span>
                        </p>
                    )}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Range Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Data Range
                        </label>
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Database className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                value={range}
                                onChange={(e) => setRange(e.target.value)}
                                placeholder="e.g. Sheet1!A1:Z100"
                                className="block w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">Include headers in range.</p>
                    </div>

                    {/* Company Selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Target Company
                        </label>
                        <select
                            value={companyId || ""}
                            onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}
                            className="block w-full pl-3 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        >
                            <option value="">Select Company...</option>
                            {companies.map((company) => (
                                <option key={company.id} value={company.id}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Action Button */}
                <div className="pt-2">
                    <button
                        onClick={handleLoadHeaders}
                        disabled={loadingHeaders || !spreadsheetId || !companyId}
                        className="w-full md:w-auto md:min-w-[200px] flex justify-center items-center gap-2 bg-gray-900 text-white font-medium py-2.5 px-6 rounded-lg hover:bg-gray-800 focus:ring-4 focus:ring-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {loadingHeaders ? (
                            <>
                                <RefreshCw className="animate-spin" size={18} />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <Search size={18} />
                                Analyze Sheet & Map Columns
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            {/* Error Banner */}
            {error && (
                <div className="border-t border-red-100 bg-red-50 p-4">
                    <div className="flex gap-3">
                        <AlertCircle className="text-red-600 shrink-0" size={20} />
                        <div className="text-sm text-red-800 whitespace-pre-wrap font-medium">
                            {error}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Results Section */}
        {result && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Sync Results</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <StatCard icon={CheckCircle2} label="Created" value={result.createdProperties} color="text-green-600" bg="bg-green-50" />
                    <StatCard icon={RefreshCw} label="Updated" value={result.updatedProperties} color="text-blue-600" bg="bg-blue-50" />
                    <StatCard icon={MapIcon} label="Geocoded" value={result.geocodedAddresses} color="text-amber-600" bg="bg-amber-50" />
                    <StatCard icon={AlertCircle} label="Errors" value={result.errors} color="text-red-600" bg="bg-red-50" />
                    <StatCard icon={Database} label="Total" value={result.totalProcessed} color="text-purple-600" bg="bg-purple-50" />
                </div>
                {result.errors > 0 && (
                    <p className="text-sm text-gray-500 mt-4 text-center">
                        Check the "ValidationReport" tab in your Google Sheet for details on failed rows.
                    </p>
                )}
            </div>
        )}
      </div>

      {/* Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowMappingModal(false)} />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Map Columns</h2>
                <p className="text-sm text-gray-500 mt-1">Match your sheet columns to database fields</p>
              </div>
              <button onClick={() => setShowMappingModal(false)} className="text-gray-400 hover:text-gray-600 p-2">
                <span className="sr-only">Close</span>
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                <div className="space-y-3">
                    {/* Header Labels */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <div className="col-span-5">Google Sheet Column</div>
                        <div className="col-span-2 text-center">Map To</div>
                        <div className="col-span-5">Database Field</div>
                    </div>

                    {sheetHeaders.map((header, index) => {
                        const isMapped = !!columnMapping[header];
                        return (
                            <div 
                                key={index} 
                                className={`
                                    relative grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center p-4 rounded-lg border transition-all
                                    ${isMapped ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-70'}
                                `}
                            >
                                {/* Source Column */}
                                <div className="md:col-span-5 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-green-100 text-green-700 flex items-center justify-center shrink-0 font-bold text-xs">
                                        {String.fromCharCode(65 + index)}
                                    </div>
                                    <span className="font-medium text-gray-700 truncate" title={header}>{header}</span>
                                </div>

                                {/* Connector Icon */}
                                <div className="hidden md:flex md:col-span-2 justify-center">
                                    <ArrowRight className={isMapped ? "text-indigo-400" : "text-gray-300"} size={20} />
                                </div>

                                {/* Target Select */}
                                <div className="md:col-span-5">
                                    <select
                                        value={columnMapping[header] || ""}
                                        onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                                        className={`
                                            w-full px-3 py-2 rounded-md border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none
                                            ${isMapped ? 'border-indigo-300 bg-indigo-50/30 text-indigo-900 font-medium' : 'border-gray-300 text-gray-500'}
                                        `}
                                    >
                                        {DATABASE_FIELDS.map((field) => (
                                            <option key={field.value} value={field.value}>
                                                {field.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-white rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${Object.values(columnMapping).includes("address") ? "bg-green-500" : "bg-red-500"}`}></span>
                    Address field is {Object.values(columnMapping).includes("address") ? "mapped" : "missing"}
                </div>
                
                <div className="flex gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => setShowMappingModal(false)}
                        className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={loading || !Object.values(columnMapping).includes("address")}
                        className="flex-1 sm:flex-none px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        {loading ? <RefreshCw className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                        Start Sync
                    </button>
                </div>
            </div>

          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// --- Subcomponents ---

function StatCard({ icon: Icon, label, value, color, bg }: { icon: any, label: string, value: number, color: string, bg: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center hover:shadow-md transition-shadow">
      <div className={`${bg} p-3 rounded-full mb-3`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">{label}</p>
    </div>
  )
}