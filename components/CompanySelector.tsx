"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import { ChevronDown, Building2 } from "lucide-react"

interface Company {
  id: number
  name: string
  subscriptionStatus: string
}

interface CompanySelectorProps {
  selectedCompanyId: number | null
  onCompanyChange: (companyId: number | null) => void
  userRole: string
}

export default function CompanySelector({ selectedCompanyId, onCompanyChange, userRole }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (userRole === "SUPER_ADMIN" || userRole === "OWNER" || userRole === "DEVELOPER") {
      loadCompanies()
    }
  }, [userRole])

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/companies", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setCompanies(response.data.data)
        // Auto-select first company if none selected
        if (!selectedCompanyId && response.data.data.length > 0) {
          onCompanyChange(response.data.data[0].id)
        }
      }
    } catch (error) {
      console.error("Error loading companies:", error)
    } finally {
      setLoading(false)
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)

  // Don't show selector for non-global roles
  if (userRole !== "SUPER_ADMIN" && userRole !== "OWNER" && userRole !== "DEVELOPER") {
    return null
  }

  if (loading) {
    return (
      <div className="px-4 py-2 bg-gray-100 rounded-lg animate-pulse">
        <div className="h-4 w-32 bg-gray-300 rounded"></div>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Building2 className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-700">
          {selectedCompany ? selectedCompany.name : "Select Company"}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            <div className="p-2">
              <button
                onClick={() => {
                  onCompanyChange(null)
                  setIsOpen(false)
                  // Reload the page to show data for all companies
                  window.location.reload()
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCompanyId === null
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                All Companies
              </button>
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    onCompanyChange(company.id)
                    setIsOpen(false)
                    // Reload the page to show data for the selected company
                    window.location.reload()
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCompanyId === company.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{company.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        company.subscriptionStatus === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {company.subscriptionStatus}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

