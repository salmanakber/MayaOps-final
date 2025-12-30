"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"

interface Configuration {
  id: number
  photo_count_requirement: number
  watermark_enabled: boolean
  geofence_radius: number
  timezone: string
  data_retention_days: number
  notification_template?: string
}

export default function ConfigurationsPage() {
  const [config, setConfig] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    loadConfigurations()
  }, [])

  const loadConfigurations = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/configurations", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.data.success) {
        setConfig(response.data.data || {
          photo_count_requirement: 20,
          watermark_enabled: false,
          geofence_radius: 150,
          timezone: "UTC",
          data_retention_days: 365,
        })
      }
    } catch (error) {
      console.error("Error loading configurations:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return
    try {
      setSaving(true)
      setMessage(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.patch(
        "/api/admin/configurations",
        config,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (response.data.success) {
        setMessage({ type: "success", text: "Configuration saved successfully!" })
        setConfig(response.data.data)
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to save configuration",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Configurations</h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Photo Count Requirement */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Minimum Photos Required (Before & After)
            </label>
            <input
              type="number"
              min="1"
              value={config?.photo_count_requirement || 20}
              onChange={(e) =>
                setConfig({
                  ...config!,
                  photo_count_requirement: Number.parseInt(e.target.value),
                })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum number of photos required before and after cleaning
            </p>
          </div>

          {/* Watermark Toggle */}
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config?.watermark_enabled || false}
                onChange={(e) =>
                  setConfig({ ...config!, watermark_enabled: e.target.checked })
                }
                className="w-4 h-4 border border-gray-300 rounded"
              />
              <span className="text-sm font-medium text-gray-900">Enable Watermark on Photos</span>
            </label>
          </div>

          {/* Geofence Radius */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Geofence Radius (meters)
            </label>
            <input
              type="number"
              min="50"
              max="500"
              value={config?.geofence_radius || 150}
              onChange={(e) =>
                setConfig({ ...config!, geofence_radius: Number.parseInt(e.target.value) })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum distance (in meters) from property for geofence validation
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Timezone</label>
            <select
              value={config?.timezone || "UTC"}
              onChange={(e) => setConfig({ ...config!, timezone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Europe/Berlin">Europe/Berlin (CET)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
            </select>
          </div>

          {/* Data Retention */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Data Retention (days)
            </label>
            <input
              type="number"
              min="30"
              max="3650"
              value={config?.data_retention_days || 365}
              onChange={(e) =>
                setConfig({ ...config!, data_retention_days: Number.parseInt(e.target.value) })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of days to retain data before automatic deletion
            </p>
          </div>

          {/* Notification Template */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Notification Template
            </label>
            <textarea
              value={config?.notification_template || ""}
              onChange={(e) =>
                setConfig({ ...config!, notification_template: e.target.value })
              }
              rows={4}
              placeholder="Custom notification template..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Custom template for notifications (optional)
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || !config}
            className="w-full bg-gradient-to-r from-cyan-500 to-teal-600 text-white py-3 rounded-lg hover:from-cyan-600 hover:to-teal-700 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "Saving..." : "Save Configurations"}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
