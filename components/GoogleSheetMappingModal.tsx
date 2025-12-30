"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import { X, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react"


interface GoogleSheetMappingModalProps {
  propertyId: number
  sheetUrl: string
  onClose: () => void
  onSuccess: () => void
}

// Task model fields that can be mapped
const TASK_FIELDS = [
  { value: "title", label: "Title", required: true },
  { value: "description", label: "Description", required: false },
  { value: "scheduledDate", label: "Scheduled Date", required: false },
  { value: "assignedUserEmail", label: "Assigned User Email", required: false },
  { value: "status", label: "Status", required: false },
]

export default function GoogleSheetMappingModal({
  propertyId,
  sheetUrl,
  onClose,
  onSuccess,
}: GoogleSheetMappingModalProps) {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  
  const [sheetInfo, setSheetInfo] = useState<{
    spreadsheetId: string
    spreadsheetTitle: string
    sheets: Array<{ id: number; title: string }>
    headers: string[]
    defaultSheet: string
  } | null>(null)
  
  const [selectedSheet, setSelectedSheet] = useState("")
  const [columnMapping, setColumnMapping] = useState<{ [key: string]: string }>({})
  const [uniqueColumn, setUniqueColumn] = useState("")

  // Verify sheet on mount
  useEffect(() => {
    verifySheet()
  }, [])

  const verifySheet = async () => {
    setVerifying(true)
    setError("")
    
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.post(
        `/api/properties/${propertyId}/google-sheet/verify`,
        { sheetUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.data.success) {
        setSheetInfo(response.data.data)
        setSelectedSheet(response.data.data.defaultSheet)
        
        // Auto-map common column names
        const autoMapping: { [key: string]: string } = {}
        response.data.data.headers.forEach((header: string) => {
          const lowerHeader = header.toLowerCase()
          if (lowerHeader.includes("title") || lowerHeader.includes("task")) {
            autoMapping[header] = "title"
          } else if (lowerHeader.includes("description") || lowerHeader.includes("notes")) {
            autoMapping[header] = "description"
          } else if (lowerHeader.includes("date") || lowerHeader.includes("scheduled")) {
            autoMapping[header] = "scheduledDate"
          } else if (lowerHeader.includes("email") || lowerHeader.includes("assigned")) {
            autoMapping[header] = "assignedUserEmail"
          } else if (lowerHeader.includes("status")) {
            autoMapping[header] = "status"
          }
        })
        setColumnMapping(autoMapping)
      } else {
        setError(response.data.message || "Failed to verify sheet")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to verify Google Sheet")
    } finally {
      setVerifying(false)
    }
  }

  const handleSave = async () => {
    // Validate required mappings
    const requiredFields = TASK_FIELDS.filter(f => f.required)
    const missingFields = requiredFields.filter(f => !Object.values(columnMapping).includes(f.value))
    
    if (missingFields.length > 0) {
      setError(`Please map the following required fields: ${missingFields.map(f => f.label).join(", ")}`)
      return
    }

    setLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.post(
        `/api/properties/${propertyId}/google-sheet/map`,
        {
          spreadsheetId: sheetInfo?.spreadsheetId,
          sheetName: selectedSheet,
          columnMapping,
          uniqueColumn: uniqueColumn || undefined,
          googleSheetUrl: sheetUrl,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.data.success) {
        setSuccess(true)
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2000)
      } else {
        setError(response.data.message || "Failed to save mapping")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to save mapping and import tasks")
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
            <p className="text-gray-700 font-medium">Verifying Google Sheet...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!sheetInfo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Google Sheet Mapping</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <button
            onClick={verifySheet}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry Verification
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Map Google Sheet Columns</h3>
            <p className="text-sm text-gray-600 mt-1">{sheetInfo.spreadsheetTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2">
              <CheckCircle2 size={16} />
              Mapping saved and tasks imported successfully!
            </div>
          )}

          {/* Sheet Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Sheet</label>
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              {sheetInfo.sheets.map((sheet) => (
                <option key={sheet.id} value={sheet.title}>
                  {sheet.title}
                </option>
              ))}
            </select>
          </div>

          {/* Column Mapping */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Map Sheet Columns to Task Fields
            </label>
            <div className="space-y-3">
              {TASK_FIELDS.map((field) => (
                <div key={field.value} className="flex items-center gap-4">
                  <div className="w-40 text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </div>
                  <select
                    value={Object.keys(columnMapping).find(k => columnMapping[k] === field.value) || ""}
                    onChange={(e) => {
                      const newMapping = { ...columnMapping }
                      // Remove old mapping for this field
                      Object.keys(newMapping).forEach(key => {
                        if (newMapping[key] === field.value) {
                          delete newMapping[key]
                        }
                      })
                      // Add new mapping
                      if (e.target.value) {
                        newMapping[e.target.value] = field.value
                      }
                      setColumnMapping(newMapping)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Column --</option>
                    {sheetInfo.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Unique Column */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Unique Column (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Select a column that uniquely identifies each row. This prevents duplicate tasks when syncing.
            </p>
            <select
              value={uniqueColumn}
              onChange={(e) => setUniqueColumn(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- None --</option>
              {sheetInfo.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || success}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {success ? "Saved!" : "Save & Import Tasks"}
          </button>
        </div>
      </div>
    </div>
  )
}

