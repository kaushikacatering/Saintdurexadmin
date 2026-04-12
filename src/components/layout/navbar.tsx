"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/auth"
import { filterNavigationByPermissions } from "@/lib/permissions"
import { notificationsAPI } from "@/lib/api"
import { Bell, ChevronDown, User, LogOut, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { toast } from "sonner"

// Navigation structure matching PHP header
const allNavigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Quotes", href: "/quotes" },
  { name: "Orders", href: "/orders" },
  {
    name: "Customer",
    href: "/customers",
    hasDropdown: true,
    items: [
      { name: "Customers", href: "/customers" },
      { name: "Company", href: "/companies" },
      { name: "Department", href: "/departments" },
      { name: "Customer's Feedbacks", href: "/feedbacks" },
      { name: "Coupons", href: "/coupons" },
    ]
  },
  { name: "Subscriptions", href: "/subscriptions" },
  {
    name: "Admin",
    href: "/admin/settings",
    hasDropdown: true,
    items: [
      { name: "Settings", href: "/admin/settings" },
      { name: "User Management", href: "/admin/users" },
      { name: "Roles & Permissions", href: "/admin/roles" },
      { name: "Locations", href: "/admin/locations" },
      // { name: "Manage Categories", href: "/admin/categories" },
      { name: "Product Management", href: "/admin/products" },
      // { name: "Manage Options", href: "/admin/options" },
      { name: "Manage Blogs", href: "/admin/blogs" },
      { name: "Reviews", href: "/admin/reviews" },
      { name: "Payments", href: "/admin/payments" },
      { name: "Reports", href: "/admin/reports" },
      { name: "Contact Enquiries", href: "/contact-inquiries" },
      { name: "Newsletter Subscriptions", href: "/admin/newsletter" },
      // { name: "Wholesale Enquiries", href: "/wholesale-enquiries" },
      // { name: "API History", href: "/history" },
    ]
  },
]

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const queryClient = useQueryClient()

  // Fetch notifications
  const { data: notificationsData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await notificationsAPI.list({ limit: 10, read_status: 'false' })
      return response.data
    },
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  // Fetch unread count
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await notificationsAPI.getUnreadCount()
      return response.data
    },
    enabled: !!user,
    refetchInterval: 30000,
  })

  const unreadCount = unreadCountData?.count || 0
  const notifications = notificationsData?.notifications || []

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      toast.success('All notifications marked as read')
    },
    onError: () => {
      toast.error('Failed to mark notifications as read')
    },
  })

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => notificationsAPI.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.read_status) {
      markAsReadMutation.mutate(notification.id)
    }

    // Navigate based on notification type
    if ((notification.notification_type === 'order' || (!notification.notification_type && notification.order_id)) && notification.order_id) {
      router.push(`/orders/${notification.order_id}`)
    } else if (notification.notification_type === 'contact_inquiry' && notification.contact_inquiry_id) {
      router.push(`/contact-inquiries/${notification.contact_inquiry_id}`)
    } else if (notification.notification_type === 'wholesale_enquiry' && notification.wholesale_enquiry_id) {
      router.push(`/wholesale-enquiries/${notification.wholesale_enquiry_id}`)
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return `${Math.floor(diffInSeconds / 86400)}d ago`
  }

  // Filter navigation based on user permissions
  const navigation = useMemo(() => {
    return filterNavigationByPermissions(allNavigation, user?.auth_level)
  }, [user?.auth_level])

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const getRoleName = (authLevel: number) => {
    switch (authLevel) {
      case 1:
        return "Super Admin"
      case 2:
        return "Admin"
      case 3:
        return "Manager"
      default:
        return "User"
    }
  }

  return (
    <nav className="flex flex-row justify-center items-center px-4 sm:px-6 lg:px-12 xl:px-[108px] gap-4 sm:gap-8 w-full h-auto sm:h-[80px] py-4 sm:py-0 bg-white shadow-[0px_4px_15px_rgba(0,0,0,0.05)]">
      <div className="flex flex-row justify-between items-center gap-4 sm:gap-8 w-full max-w-[1296px] min-h-[40px]">
        {/* Logo and Navigation */}
        <div className="flex flex-row items-center gap-3 sm:gap-[18px] flex-1">
          {/* Mobile Menu Button - Only visible on mobile/tablet */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden flex-shrink-0"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6 text-[#212529]" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px] overflow-y-auto" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
              <SheetHeader className="pb-4 border-b border-gray-200">
                <SheetTitle style={{ fontFamily: "'Albert Sans', sans-serif", fontSize: '20px', fontWeight: 600 }}>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-3 pb-6 overflow-y-auto max-h-[calc(100vh-120px)]">
                {navigation.map((item) => {
                  // Check if parent route is active
                  const isParentActive = pathname === item.href || pathname.startsWith(item.href + "/")

                  // For dropdown menus, also check if any sub-item is active
                  let isActive = isParentActive
                  if (item.hasDropdown && item.items) {
                    const hasActiveChild = item.items.some(subItem =>
                      pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                    )
                    isActive = isParentActive || hasActiveChild
                  }

                  if (item.hasDropdown && item.items) {
                    return (
                      <div key={item.name} className="flex flex-col gap-1">
                        <Link
                          href={item.href}
                          prefetch={true}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "px-4 py-2.5 rounded-md text-base font-semibold transition-colors",
                            isActive ? "bg-blue-50 text-[#0d6efd]" : "text-[#212529] hover:bg-gray-50"
                          )}
                          style={{ fontFamily: "'Albert Sans', sans-serif" }}
                        >
                          {item.name}
                        </Link>
                        <div className="ml-3 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-3">
                          {item.items.map((subItem) => {
                            const isSubItemActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                            return (
                              <Link
                                key={subItem.name}
                                href={subItem.href}
                                prefetch={true}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                  "px-3 py-2 text-sm rounded-md transition-colors",
                                  isSubItemActive
                                    ? "bg-blue-50 text-[#0d6efd] font-medium"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-[#0d6efd]"
                                )}
                                style={{ fontFamily: "'Albert Sans', sans-serif" }}
                              >
                                {subItem.name}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      prefetch={true}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "px-4 py-2.5 rounded-md text-base font-semibold transition-colors",
                        isActive ? "bg-blue-50 text-[#0d6efd]" : "text-[#212529] hover:bg-gray-50"
                      )}
                      style={{ fontFamily: "'Albert Sans', sans-serif" }}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/dashboard" prefetch={true} className="flex items-center justify-center flex-shrink-0">
            <Image
              src="/assets/group171.svg"
              alt="St. Dreux Coffee"
              width={88}
              height={24}
              className="object-contain w-16 sm:w-[88px] h-auto"
            />
          </Link>

          {/* Navigation Items - Hidden on mobile, shown on lg+ */}
          <div className="hidden lg:flex flex-row items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {navigation.map((item) => {
              // Check if parent route is active
              const isParentActive = pathname === item.href || pathname.startsWith(item.href + "/")

              // For dropdown menus, also check if any sub-item is active
              let isActive = isParentActive
              if (item.hasDropdown && item.items) {
                const hasActiveChild = item.items.some(subItem =>
                  pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                )
                isActive = isParentActive || hasActiveChild
              }

              if (item.hasDropdown && item.items) {
                return (
                  <DropdownMenu key={item.name}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex flex-row items-center px-3 py-[6px] gap-2 h-[40px] hover:bg-gray-50 rounded-md transition-colors">
                        <span
                          className={cn(
                            "font-medium text-base leading-[28px] whitespace-nowrap",
                            isActive ? "text-[#0d6efd] font-bold" : "text-[#212529]"
                          )}
                          style={{ fontFamily: "'Albert Sans', sans-serif" }}
                        >
                          {item.name}
                        </span>
                        <ChevronDown className={cn("w-4 h-4", isActive ? "text-[#0d6efd]" : "text-[#212529]")} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-56"
                      style={{ fontFamily: "'Albert Sans', sans-serif" }}
                    >
                      {item.items.map((subItem) => {
                        const isSubItemActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
                        return (
                          <DropdownMenuItem key={subItem.name} asChild>
                            <Link
                              href={subItem.href}
                              prefetch={true}
                              className={cn(
                                "cursor-pointer",
                                isSubItemActive && "bg-blue-50 text-[#0d6efd] font-medium"
                              )}
                            >
                              {subItem.name}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  prefetch={true}
                  className="flex flex-row items-center px-3 py-[6px] gap-2 h-[40px] hover:bg-gray-50 rounded-md transition-colors"
                >
                  <span
                    className={cn(
                      "font-medium text-base leading-[28px] whitespace-nowrap",
                      isActive ? "text-[#0d6efd] font-bold" : "text-[#212529]"
                    )}
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  >
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Right Side - Notifications and User */}
        <div className="flex flex-row justify-end items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="relative w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 group"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-[#212529] transition-colors duration-200 group-hover:text-[#0d6efd]" />
                {/* Notification Badge */}
                {unreadCount > 0 && (
                  <>
                    <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-white"></span>
                    </span>
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 border-2 border-white shadow-sm">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-80 sm:w-96 mt-2"
              style={{ fontFamily: "'Albert Sans', sans-serif" }}
            >
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base text-[#212529]">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsReadMutation.mutate()}
                      disabled={markAllAsReadMutation.isPending}
                      className="text-xs text-[#0d6efd] hover:underline font-medium disabled:opacity-50"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notification: any) => (
                    <DropdownMenuItem
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "flex flex-col items-start p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100",
                        !notification.read_status && "bg-blue-50/50"
                      )}
                    >
                      <div className="flex items-start justify-between w-full mb-1">
                        <span className="font-medium text-sm text-[#212529]">
                          {notification.notification_type === 'order' && 'New Order'}
                          {notification.notification_type === 'contact_inquiry' && 'Contact Inquiry'}
                          {notification.notification_type === 'wholesale_enquiry' && 'Wholesale Enquiry'}
                          {notification.notification_type === 'newsletter_subscription' && 'Newsletter Subscription'}
                          {!notification.notification_type && (notification.order_id ? 'New Order' : 'Notification')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {notification.description}
                      </p>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-200">
                <Link
                  href="/notifications"
                  className="text-sm text-[#0d6efd] hover:underline font-medium text-center block"
                >
                  View all notifications
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Info - Hidden on mobile */}
          {user && (
            <div className="hidden sm:flex flex-row items-center gap-2">
              <div className="w-[24px] h-[24px] flex items-center justify-center border border-[#212529] rounded-full">
                <User className="w-4 h-4 text-[#212529]" />
              </div>
              <div className="hidden md:flex flex-col justify-center">
                <span
                  className="font-medium text-sm sm:text-base leading-[20px] text-[#424242] truncate max-w-[100px]"
                  style={{ fontFamily: "'Albert Sans', sans-serif" }}
                >
                  {user.username || "Full Name"}
                </span>
              </div>
            </div>
          )}

          {/* Logout Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-gray-50"
              >
                <ChevronDown className="h-4 w-4 text-[#212529]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}

