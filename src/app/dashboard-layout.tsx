"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { canAccessRoute } from "@/lib/permissions"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { NavigationProgress } from "@/components/navigation-progress"

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, checkAuth } = useAuthStore()

  // Check if current route is a dashboard route (not login)
  // "/" is the dashboard home page, so it should have navbar/footer
  const isDashboardRoute = pathname !== "/login"

  useEffect(() => {
    if (!isDashboardRoute) {
      return // Don't check auth for login page
    }

    // Check auth in background without blocking the UI
    const verifyAuth = async () => {
      const storedAuth = localStorage.getItem('caterly-auth')
      
      if (!storedAuth) {
        // No auth data - redirect but don't block UI
        const redirectPath = pathname !== "/dashboard" && pathname !== "/" && pathname !== "/login" ? pathname : ""
        router.push(`/login${redirectPath ? `?redirect=${redirectPath}` : ""}`)
        return
      }

      // Verify with backend in background
      try {
        await checkAuth()
        // After checkAuth, verify isAuthenticated state
        const currentAuth = useAuthStore.getState()
        if (!currentAuth.isAuthenticated) {
          router.push('/login')
          return
        }

        // Check if user has permission to access this route
        if (currentAuth.user) {
          const hasAccess = canAccessRoute(currentAuth.user.auth_level, pathname)
          if (!hasAccess) {
            // Redirect to dashboard if no permission
            router.push('/dashboard')
          }
        }
      } catch (error: any) {
        // Only redirect if it's a 401 (not network error)
        if (error?.code !== 'ERR_NETWORK' && error?.message !== 'Network Error') {
          const currentAuth = useAuthStore.getState()
          if (!currentAuth.isAuthenticated) {
            router.push('/login')
          }
        }
        // If network error, backend is down - don't redirect
      }
    }
    
    // Run auth check but don't wait for it
    verifyAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, isDashboardRoute]) // Removed isAuthenticated and checkAuth from deps to prevent loops

  // For login/home pages, just render children without navbar/footer
  if (!isDashboardRoute) {
    return <>{children}</>
  }

  // For dashboard routes, render with navbar and footer
  return (
    <div className="flex flex-col min-h-screen bg-neutral-50 overflow-x-hidden w-full max-w-full">
      <NavigationProgress />
      <Navbar />
      <main className="flex-1 px-4 sm:px-6 lg:px-12 xl:px-[108px] py-4 sm:py-6 lg:py-8 w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}


