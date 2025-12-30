"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"

interface ChecklistTemplate {
  id: number
  name: string
  description?: string
  items: string[]
  isDefault: boolean
  createdAt: string
}

export default function ChecklistTemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/checklist-templates", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        const templatesWithItems = response.data.data.templates.map((template: any) => ({
          ...template,
          items: typeof template.items === "string" ? JSON.parse(template.items) : template.items,
        }))
        setTemplates(templatesWithItems)
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (templateId: number) => {
    if (!confirm("Are you sure you want to delete this checklist template?")) return

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.delete(`/api/checklist-templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      loadTemplates()
    } catch (error) {
      console.error("Error deleting template:", error)
      alert("Failed to delete template")
    }
  }

  const handleSetDefault = async (templateId: number) => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.patch(
        `/api/checklist-templates/${templateId}`,
        { isDefault: true },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      loadTemplates()
    } catch (error) {
      console.error("Error setting default template:", error)
      alert("Failed to set default template")
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Checklist Templates</h1>
              <p className="text-gray-600 mt-1">Manage reusable checklist templates for tasks</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:from-cyan-600 hover:to-teal-700 transition"
            >
              + Create Template
            </button>
          </div>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{template.name}</h3>
                    {template.isDefault && (
                      <span className="inline-block mt-1 px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded">
                        Default
                      </span>
                    )}
                  </div>
                </div>
                {template.description && (
                  <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                )}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {template.items.length} Items:
                  </p>
                  <ul className="space-y-1">
                    {template.items.slice(0, 5).map((item, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex items-start">
                        <span className="mr-2">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                    {template.items.length > 5 && (
                      <li className="text-xs text-gray-500">
                        +{template.items.length - 5} more items
                      </li>
                    )}
                  </ul>
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setSelectedTemplate(template)
                      setShowEditModal(true)
                    }}
                    className="flex-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  {!template.isDefault && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="flex-1 px-3 py-2 text-sm text-green-600 hover:text-green-800 border border-green-300 rounded-lg hover:bg-green-50"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && templates.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No checklist templates found. Create your first template to get started.
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <ChecklistTemplateModal
          onClose={() => {
            setShowCreateModal(false)
            loadTemplates()
          }}
        />
      )}

      {/* Edit Template Modal */}
      {showEditModal && selectedTemplate && (
        <ChecklistTemplateModal
          template={selectedTemplate}
          onClose={() => {
            setShowEditModal(false)
            setSelectedTemplate(null)
            loadTemplates()
          }}
        />
      )}
    </AdminLayout>
  )
}

// Checklist Template Modal Component
function ChecklistTemplateModal({
  template,
  onClose,
}: {
  template?: ChecklistTemplate
  onClose: () => void
}) {
  const [formData, setFormData] = useState({
    name: template?.name || "",
    description: template?.description || "",
    items: template?.items || [""],
    isDefault: template?.isDefault || false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleItemChange = (index: number, value: string) => {
    const newItems = [...formData.items]
    newItems[index] = value
    setFormData({ ...formData, items: newItems })
  }

  const handleAddItem = () => {
    setFormData({ ...formData, items: [...formData.items, ""] })
  }

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData({ ...formData, items: newItems.length > 0 ? newItems : [""] })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const validItems = formData.items.filter((item) => item.trim() !== "")
    if (validItems.length === 0) {
      setError("At least one checklist item is required")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        items: JSON.stringify(validItems),
        isDefault: formData.isDefault,
      }

      const response = template
        ? await axios.patch(`/api/checklist-templates/${template.id}`, payload, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await axios.post("/api/checklist-templates", payload, {
            headers: { Authorization: `Bearer ${token}` },
          })

      if (response.data.success) {
        onClose()
      } else {
        setError(response.data.message || "Failed to save template")
      }
    } catch (error: any) {
      setError(error.response?.data?.message || "Failed to save template")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {template ? "Edit Checklist Template" : "Create Checklist Template"}
        </h2>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-800 rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Checklist Items *</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add Item
              </button>
            </div>
            <div className="space-y-2">
              {formData.items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleItemChange(index, e.target.value)}
                    placeholder={`Item ${index + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="px-3 py-2 text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Set as default template</span>
            </label>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg hover:from-cyan-600 hover:to-teal-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : template ? "Update Template" : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}



