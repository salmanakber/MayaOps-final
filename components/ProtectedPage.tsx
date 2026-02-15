'use client'

import { usePathname } from 'next/navigation'
import RequirePermission from './RequirePermission'
import { getPagePermission } from '@/lib/page-permissions'

interface ProtectedPageProps {
  children: React.ReactNode
}

/**
 * Automatically protects pages based on the page-permissions mapping
 * Wraps the page content with RequirePermission based on the current pathname
 */
export default function ProtectedPage({ children }: ProtectedPageProps) {
  const pathname = usePathname()
  const requiredPermission = getPagePermission(pathname)

  // If no permission required, render directly
  if (!requiredPermission) {
    return <>{children}</>
  }

  // Handle array of permissions (require any)
  if (Array.isArray(requiredPermission)) {
    return (
      <RequirePermission permissions={requiredPermission} requireAll={false}>
        {children}
      </RequirePermission>
    )
  }

  // Single permission
  return (
    <RequirePermission permission={requiredPermission}>
      {children}
    </RequirePermission>
  )
}
