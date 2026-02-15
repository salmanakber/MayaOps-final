'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Loader2, AlertCircle } from 'lucide-react'

interface RequirePermissionProps {
  children: React.ReactNode
  permission?: string
  permissions?: string[]
  requireAll?: boolean
  fallback?: React.ReactNode
}

export default function RequirePermission({
  children,
  permission,
  permissions,
  requireAll = false,
  fallback
}: RequirePermissionProps) {
  const router = useRouter()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkPermission()
  }, [permission, permissions])

  const checkPermission = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) {
        setHasAccess(false)
        setLoading(false)
        return
      }

      const [permissionsRes, userRes] = await Promise.all([
        axios.get("/api/auth/permissions", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: { success: false } })),
        axios.get("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: { success: false } }))
      ])

      const userPermissions = permissionsRes.data.success 
        ? (permissionsRes.data.data?.permissions || [])
        : []
      
      const user = userRes.data.success 
        ? userRes.data.data?.user
        : null

      const isHeadSuperAdmin = user?.isHeadSuperAdmin || false
      const isDeveloper = user?.role === "DEVELOPER"
      const isOwner = user?.role === "OWNER"

      // Head super admin, DEVELOPER, and OWNER have all permissions
      if (isHeadSuperAdmin || isDeveloper || isOwner) {
        setHasAccess(true)
        setLoading(false)
        return
      }

      // Check single permission
      if (permission) {
        setHasAccess(userPermissions.includes(permission))
        setLoading(false)
        return
      }

      // Check multiple permissions
      if (permissions && permissions.length > 0) {
        if (requireAll) {
          setHasAccess(permissions.every(p => userPermissions.includes(p)))
        } else {
          setHasAccess(permissions.some(p => userPermissions.includes(p)))
        }
        setLoading(false)
        return
      }

      // No permission specified, allow access
      setHasAccess(true)
      setLoading(false)
    } catch (error) {
      console.error("Error checking permission:", error)
      setHasAccess(false)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          <p className="text-sm text-gray-500">Checking permissions...</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-red-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          </div>
          <p className="text-gray-600 mb-6">
            You do not have permission to access this page.
            {permission && (
              <span className="block mt-2 text-sm text-gray-500">
                Required permission: <code className="bg-gray-100 px-2 py-1 rounded">{permission}</code>
              </span>
            )}
            {permissions && permissions.length > 0 && (
              <span className="block mt-2 text-sm text-gray-500">
                Required permissions: {permissions.join(', ')}
              </span>
            )}
          </p>
          <button
            onClick={() => router.back()}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
