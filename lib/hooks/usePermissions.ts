'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'

interface UsePermissionsReturn {
  permissions: string[]
  hasPermission: (permissionKey: string) => boolean
  hasAnyPermission: (permissionKeys: string[]) => boolean
  hasAllPermissions: (permissionKeys: string[]) => boolean
  loading: boolean
  isHeadSuperAdmin: boolean
  userRole: string | null
}

export function usePermissions(): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [isHeadSuperAdmin, setIsHeadSuperAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) {
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

      if (permissionsRes.data.success) {
        setPermissions(permissionsRes.data.data.permissions || [])
      }

      if (userRes.data.success) {
        const user = userRes.data.data.user
        setIsHeadSuperAdmin(user.isHeadSuperAdmin || false)
        setUserRole(user.role || null)
      }
    } catch (error) {
      console.error("Error loading permissions:", error)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }

  const hasPermission = (permissionKey: string): boolean => {
    // Head super admin and DEVELOPER have all permissions
    if (isHeadSuperAdmin || userRole === "DEVELOPER") {
      return true
    }
    return permissions.includes(permissionKey)
  }

  const hasAnyPermission = (permissionKeys: string[]): boolean => {
    if (isHeadSuperAdmin || userRole === "DEVELOPER") {
      return true
    }
    return permissionKeys.some(key => permissions.includes(key))
  }

  const hasAllPermissions = (permissionKeys: string[]): boolean => {
    if (isHeadSuperAdmin || userRole === "DEVELOPER") {
      return true
    }
    return permissionKeys.every(key => permissions.includes(key))
  }

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading,
    isHeadSuperAdmin,
    userRole,
  }
}
