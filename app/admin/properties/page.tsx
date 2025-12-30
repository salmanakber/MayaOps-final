"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import { 
  Building2, 
  Home, 
  Building, 
  Search, 
  Plus, 
  MapPin, 
  MoreHorizontal, 
  Edit2, 
  Trash2, 
  Power, 
  Filter,
  X,
  Loader2,
  CheckCircle2,
  XCircle
} from "lucide-react"

// --- Types ---
interface Property {
  id: number
  address: string
  postcode?: string
  latitude?: number
  longitude?: number
  propertyType: string
  notes?: string
  isActive: boolean
  createdAt: string
  company?: {
    id: number
    name: string
  }
  _count?: {
    tasks: number
  }
}

interface Company {
  id: number
  name: string
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [companyFilter, setCompanyFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  useEffect(() => {
    loadProperties()
    loadCompanies()
  }, [])

  // Reload properties when company selection changes (check on window focus)
  useEffect(() => {
    const handleFocus = () => {
      loadProperties()
    }
    window.addEventListener('focus', handleFocus)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const loadProperties = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      
      const params: any = { q: searchTerm || undefined }
      if (selectedCompanyId) {
        params.companyId = selectedCompanyId
      }
      
      const response = await axios.get("/api/properties", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (response.data.success) {
        setProperties(response.data.data.properties)
      }
    } catch (error) {
      console.error("Error loading properties:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/companies", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setCompanies(response.data.data)
      }
    } catch (error) {
      console.error("Error loading companies:", error)
    }
  }

  const handleDelete = async (propertyId: number) => {
    if (!confirm("Are you sure you want to delete this property? This action cannot be undone.")) return

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.delete(`/api/properties/${propertyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      loadProperties()
    } catch (error) {
      alert("Failed to delete property")
    }
  }

  const handleToggleActive = async (property: Property) => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.patch(
        `/api/properties/${property.id}`,
        { isActive: !property.isActive },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      loadProperties()
    } catch (error) {
      alert("Failed to update property status")
    }
  }

  // Client-side filtering wrapper (since API handles search, we handle type/company here for speed)
  const filteredProperties = properties.filter((property) => {
    const matchesCompany = companyFilter === "all" || property.company?.id.toString() === companyFilter
    const matchesType = typeFilter === "all" || property.propertyType === typeFilter
    return matchesCompany && matchesType
  })

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Properties</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your real estate assets and assignments.</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Property
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    loadProperties()
                  }
                }}
                placeholder="Search address or postcode..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <div className="relative min-w-[160px]">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <Filter size={16} />
                    </div>
                    <select
                        value={companyFilter}
                        onChange={(e) => setCompanyFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white"
                    >
                        <option value="all">All Companies</option>
                        {companies.map((c) => (
                            <option key={c.id} value={c.id.toString()}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className="relative min-w-[140px]">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                        <option value="all">All Types</option>
                        <option value="block">Block</option>
                        <option value="apartment">Apartment</option>
                        <option value="hmo">HMO</option>
                    </select>
                </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
             <div className="p-12 flex justify-center">
                 <Loader2 className="animate-spin text-indigo-600" size={32} />
             </div>
          ) : filteredProperties.length === 0 ? (
             <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                 <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                     <Home size={32} className="text-gray-400" />
                 </div>
                 <h3 className="text-lg font-medium text-gray-900">No properties found</h3>
                 <p className="text-sm mt-1">Try adjusting your search or add a new property.</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasks</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProperties.map((property) => (
                    <tr key={property.id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-1 text-gray-400">
                                <MapPin size={16} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-gray-900">{property.address}</div>
                                {property.postcode && (
                                    <div className="text-xs text-gray-500 font-mono mt-0.5">{property.postcode}</div>
                                )}
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <PropertyTypeBadge type={property.propertyType} />
                      </td>
                      <td className="px-6 py-4">
                         <span className="text-sm text-gray-600">{property.company?.name || "—"}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {property._count?.tasks || 0}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                         <StatusBadge isActive={property.isActive} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => {
                                    setSelectedProperty(property)
                                    setShowEditModal(true)
                                }}
                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Property"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                onClick={() => handleToggleActive(property)}
                                className={`p-2 rounded-lg transition-colors ${
                                    property.isActive 
                                    ? "text-gray-400 hover:text-orange-600 hover:bg-orange-50" 
                                    : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                                }`}
                                title={property.isActive ? "Deactivate" : "Activate"}
                            >
                                <Power size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(property.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Property"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <PropertyModal
          title="Create New Property"
          companies={companies}
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (data) => {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
            await axios.post("/api/properties", data, { headers: { Authorization: `Bearer ${token}` } })
            loadProperties()
          }}
        />
      )}

      {showEditModal && selectedProperty && (
        <PropertyModal
          title="Edit Property"
          initialData={selectedProperty}
          companies={companies}
          onClose={() => {
            setShowEditModal(false)
            setSelectedProperty(null)
          }}
          onSubmit={async (data) => {
            const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
            await axios.patch(`/api/properties/${selectedProperty.id}`, data, { headers: { Authorization: `Bearer ${token}` } })
            loadProperties()
          }}
        />
      )}
    </AdminLayout>
  )
}

// --- Sub-components ---

function PropertyTypeBadge({ type }: { type: string }) {
    const t = type.toLowerCase()
    let Icon = Home
    let styles = "bg-gray-100 text-gray-700"
    let label = type

    if (t === 'block') {
        Icon = Building
        styles = "bg-blue-50 text-blue-700 border border-blue-100"
        label = "Block"
    } else if (t === 'apartment') {
        Icon = Building2
        styles = "bg-emerald-50 text-emerald-700 border border-emerald-100"
        label = "Apartment"
    } else if (t === 'hmo') {
        Icon = Home
        styles = "bg-purple-50 text-purple-700 border border-purple-100"
        label = "HMO"
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${styles}`}>
            <Icon size={12} />
            {label}
        </span>
    )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
    return isActive ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={12} />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <XCircle size={12} />
            Inactive
        </span>
    )
}

// Reusable Modal Form
interface PropertyModalProps {
    title: string
    initialData?: Property
    companies: Company[]
    onClose: () => void
    onSubmit: (data: any) => Promise<void>
}

function PropertyModal({ title, initialData, companies, onClose, onSubmit }: PropertyModalProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    
    // Get selected company from localStorage for default
    const getDefaultCompanyId = () => {
      if (initialData?.company?.id) {
        return initialData.company.id.toString()
      }
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      return selectedCompanyId || ""
    }
    
    const [formData, setFormData] = useState({
        address: initialData?.address || "",
        postcode: initialData?.postcode || "",
        propertyType: initialData?.propertyType || "apartment",
        notes: initialData?.notes || "",
        companyId: getDefaultCompanyId(),
        latitude: initialData?.latitude || "",
        longitude: initialData?.longitude || "",
        isActive: initialData?.isActive ?? true,
        googleSheetUrl: (initialData as any)?.googleSheetUrl || ""
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const payload: any = {
                ...formData,
                companyId: formData.companyId ? parseInt(formData.companyId) : undefined,
                latitude: formData.latitude ? parseFloat(formData.latitude.toString()) : undefined,
                longitude: formData.longitude ? parseFloat(formData.longitude.toString()) : undefined,
                googleSheetUrl: formData.googleSheetUrl || undefined,
            }
            await onSubmit(payload)
            onClose()
        } catch (err: any) {
            setError(err.response?.data?.message || "Operation failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6 overflow-y-auto space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
                            <XCircle size={16} /> {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Company Selection */}
                        {companies.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Company</label>
                                <select 
                                    value={formData.companyId}
                                    onChange={e => setFormData({...formData, companyId: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="">Select Company</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Address */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Address *</label>
                            <input 
                                type="text"
                                required
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="123 Main St, London"
                            />
                        </div>

                        {/* Split Fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                                <input 
                                    type="text"
                                    value={formData.postcode}
                                    onChange={e => setFormData({...formData, postcode: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="SW1A 1AA"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select 
                                    value={formData.propertyType}
                                    onChange={e => setFormData({...formData, propertyType: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="apartment">Apartment</option>
                                    <option value="block">Block</option>
                                    <option value="hmo">HMO</option>
                                </select>
                            </div>
                        </div>

                        {/* Coords */}
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Latitude</label>
                                <input 
                                    type="number" step="any"
                                    value={formData.latitude}
                                    onChange={e => setFormData({...formData, latitude: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Longitude</label>
                                <input 
                                    type="number" step="any"
                                    value={formData.longitude}
                                    onChange={e => setFormData({...formData, longitude: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Google Sheet URL */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Google Sheet URL (Optional)
                            </label>
                            <input 
                                type="url"
                                value={formData.googleSheetUrl}
                                onChange={e => setFormData({...formData, googleSheetUrl: e.target.value})}
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Add a Google Sheet URL to automatically import tasks. After saving, you'll be able to map columns.
                            </p>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                            <textarea 
                                rows={3}
                                value={formData.notes}
                                onChange={e => setFormData({...formData, notes: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            />
                        </div>
                        
                        {/* Active Toggle (Only for Edit) */}
                        {initialData && (
                            <div className="flex items-center gap-2 pt-2">
                                <input 
                                    type="checkbox"
                                    id="activeToggle"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({...formData, isActive: e.target.checked})}
                                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <label htmlFor="activeToggle" className="text-sm font-medium text-gray-700">Property is Active</label>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button 
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {initialData ? "Save Changes" : "Create Property"}
                    </button>
                </div>

            </div>
        </div>
    )
}