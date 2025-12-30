"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import axios from "axios"
import { 
  LayoutDashboard, 
  Building2, 
  ClipboardList, 
  CalendarDays, 
  RefreshCcw, 
  AlertCircle, 
  Database, 
  Users, 
  BarChart3, 
  Settings, 
  Command,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Bell
} from "lucide-react"
import CompanySelector from "./CompanySelector"

// --- Types ---
interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: string
  companyId?: number
}

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false) // Default closed on mobile
  const [loading, setLoading] = useState(true)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedCompanyId')
      return stored ? parseInt(stored) : null
    }
    return null
  })

  const handleCompanyChange = (companyId: number | null) => {
    setSelectedCompanyId(companyId)
    if (companyId) {
      localStorage.setItem('selectedCompanyId', companyId.toString())
    } else {
      localStorage.removeItem('selectedCompanyId')
    }
  }

  // --- Auth Logic ---
  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) {
        router.push("/login")
        return
      }

      const response = await axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setUser(response.data.data.user)
      } else {
        router.push("/login")
      }
    } catch (error) {
      console.error("Error loading user:", error)
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("authToken")
    localStorage.removeItem("userData")
    sessionStorage.removeItem("authToken")
    sessionStorage.removeItem("userData")
    router.push("/login")
  }

  // --- Navigation Config ---
  const baseNavigation = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Properties", href: "/admin/properties", icon: Building2 },
    { name: "Tasks", href: "/admin/tasks", icon: ClipboardList },
    { name: "Rota Builder", href: "/admin/rota", icon: CalendarDays },
    { name: "Recurring Jobs", href: "/admin/recurring-jobs", icon: RefreshCcw },
    { name: "Issues", href: "/admin/issues", icon: AlertCircle },
    { name: "Sheets Sync", href: "/admin/sheets-sync", icon: Database },
    { name: "User Management", href: "/admin/users", icon: Users },
    { name: "Notifications", href: "/admin/notifications", icon: Bell },
    { name: "Reporting", href: "/admin/reporting", icon: BarChart3 },
    { name: "Settings", href: "/admin/settings", icon: Settings },
  ]

  // Filter navigation based on user role
  let navigation = [...baseNavigation]
  
  // Add control center for super admins, owners, developers
  if (user?.role === "SUPER_ADMIN" || user?.role === "OWNER" || user?.role === "DEVELOPER") {
    navigation.unshift({
      name: "Control Center",
      href: "/admin/control-center",
      icon: Command,
    })
  }

  // Only show Notifications for COMPANY_ADMIN, OWNER, DEVELOPER, SUPER_ADMIN
  if (user?.role !== "COMPANY_ADMIN" && user?.role !== "OWNER" && user?.role !== "DEVELOPER" && user?.role !== "SUPER_ADMIN") {
    navigation = navigation.filter(item => item.name !== "Notifications")
  }

  // Filter navigation based on search
  const filteredNavigation = searchTerm
    ? navigation.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : navigation

  // Handle search navigation
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm) {
      const matched = navigation.find((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      if (matched) {
        router.push(matched.href)
        setSearchTerm("")
        setSidebarOpen(false)
      }
    }
  }

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <p className="text-sm text-gray-500 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* --- Sidebar --- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 shadow-sm transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen lg:flex lg:flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo Section */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-md">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">MayaOps</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
          <p className="px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Menu
          </p>
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon
                  size={18}
                  className={`transition-colors ${
                    isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm text-indigo-600 font-bold">
              {user?.firstName?.[0] || user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.email}
              </p>
              <p className="text-xs text-gray-500 truncate capitalize">
                {user?.role?.replace("_", " ").toLowerCase()}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- Main Content Area --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 h-16 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            >
              <Menu size={24} />
            </button>
            
            {/* Search Bar */}
            <div className="hidden md:flex items-center relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search pages..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="pl-10 pr-4 py-1.5 w-64 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              {searchTerm && filteredNavigation.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {filteredNavigation.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setSearchTerm("")
                        setSidebarOpen(false)
                      }}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <item.icon size={16} className="text-gray-400" />
                      <span className="text-sm text-gray-700">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            {/* Company Selector for SUPER_ADMIN */}
            {(user?.role === "SUPER_ADMIN" || user?.role === "OWNER" || user?.role === "DEVELOPER") && (
              <>
                <CompanySelector
                  selectedCompanyId={selectedCompanyId}
                  onCompanyChange={handleCompanyChange}
                  userRole={user?.role || ""}
                />
                <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
              </>
            )}

            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 font-semibold text-sm">
                  {user?.firstName?.[0] || user?.email?.[0].toUpperCase()}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">
                  {user?.firstName || user?.email?.split("@")[0] || "User"}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${userDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <div className="p-2">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">
                          {user?.firstName && user?.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user?.email}
                        </p>
                        <p className="text-xs text-gray-500 capitalize mt-1">
                          {user?.role?.replace("_", " ").toLowerCase()}
                        </p>
                      </div>
                      <Link
                        href="/admin/settings"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </Link>
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false)
                          handleLogout()
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {children}
            </div>
        </main>
      </div>
    </div>
  )
}