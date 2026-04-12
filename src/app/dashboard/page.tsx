
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api, { invoicesAPI, paymentsAPI } from "@/lib/api"
import { useQueryClient } from "@tanstack/react-query"
import {
  ShoppingBag,
  Users,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  MessageSquare,
  DollarSign,
  UserCheck,
  Calendar,
  Eye,
  ClipboardList,
  Plus,
  Printer,
  CheckCircle,
  XCircle,
  Loader2,
  UserPlus,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/store/auth"
import { toast } from "sonner"
import { OrderDetailModal } from "@/components/OrderDetailModal"

interface DashboardStats {
  totalOrders: number
  newOrders: number
  pendingApproval: number
  approved: number
  completed: number
  todayOrders: number
  totalRevenue: number
  deliveriesToday: number
  deliveriesNext7Days: number
  unapprovedQuotes: number
  unapprovedCustomers: number
  futureOrders: number
  productionOrders: number
  feedbackPending: number
}

interface Order {
  order_id: number
  customer_order_name: string
  order_total: string
  order_status: number
  date_added: string
  delivery_date_time: string
  is_catering_checklist_added: number
  shipping_address_1?: string
  is_completed: number | string
  standing_order?: number
  order_made_from?: string
  customer: {
    firstname: string
    lastname: string
    email?: string
    telephone?: string
  }
}

interface RecentOrder extends Order { }

interface PendingApproval {
  customer_id: number
  firstname: string
  lastname: string
  email: string
  telephone: string
  customer_address: string
  customer_type: string
  customer_cost_centre?: string
  customer_notes?: string
  status: number
  created_from?: string
  company?: {
    company_name: string
  }
}

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [todayOrders, setTodayOrders] = useState<Order[]>([])

  const [next7DaysOrders, setNext7DaysOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [previousStats, setPreviousStats] = useState<DashboardStats | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const { user } = useAuthStore()

  // Pending approvals state
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [loadingApprovals, setLoadingApprovals] = useState(false)
  const [printingOrderId, setPrintingOrderId] = useState<number | null>(null)

  useEffect(() => {
    // Check if we're on login page - don't fetch
    if (typeof window !== "undefined" && window.location.pathname === "/login") {
      setLoading(false)
      return
    }

    // Check for auth token before fetching
    const storedAuth = localStorage.getItem('caterly-auth')
    if (!storedAuth) {
      setLoading(false)
      return
    }

    fetchDashboardData()
    fetchPendingApprovals()

    // Refresh data every 30 seconds (only if we have auth)
    const interval = setInterval(() => {
      const hasAuth = localStorage.getItem('caterly-auth')
      if (hasAuth) {
        fetchDashboardData()
        fetchPendingApprovals()
      } else {
        clearInterval(interval)
      }
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDashboardData = async () => {
    // Check auth before fetching
    const storedAuth = localStorage.getItem('caterly-auth')
    if (!storedAuth) {
      setLoading(false)
      return
    }

    try {
      // Fetch both orders stats, payment statistics, and total today's count
      const todayDate = format(new Date(), 'yyyy-MM-dd')
      const [response, paymentsStatsResponse, totalTodayResponse] = await Promise.all([
        api.get("/admin/orders/stats"),
        paymentsAPI.getStatistics(), // Fetch correct revenue including manual ones
        api.get(`/admin/orders?limit=1&from_date=${todayDate}&to_date=${todayDate}&order_type=all`) // Fetch total orders for today (all statuses)
      ])

      const newStats = response.data.stats
      
      // Override Today's Deliveries with the total count for the day
      // for "Total Performance" flow where counts don't reduce upon completion
      if (totalTodayResponse.data?.count !== undefined) {
        newStats.deliveriesToday = totalTodayResponse.data.count
        // NOTE: We don't override todayOrders here because totalTodayResponse 
        // usually filters by delivery date, while Today's Orders should be orders placed today.
      }

      // Override revenue from the payments statistics module to include manual payments
      if (paymentsStatsResponse.data?.statistics) {
        newStats.totalRevenue = Number(paymentsStatsResponse.data.statistics.total_revenue || 0)
      }

      // Store previous stats for comparison (only on first load)
      if (!previousStats && stats) {
        setPreviousStats(stats)
      }

      setStats(newStats)
      setRecentOrders(response.data.recentOrders || [])
      setTodayOrders(response.data.todayOrders || [])

      setNext7DaysOrders(response.data.next7DaysOrders || [])
    } catch (error: any) {
      // Handle network errors (backend down) silently
      if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
        // Backend is down - show empty state but don't spam console
        setStats({
          totalOrders: 0,
          newOrders: 0,
          pendingApproval: 0,
          approved: 0,
          completed: 0,
          todayOrders: 0,
          totalRevenue: 0,
          deliveriesToday: 0,
          deliveriesNext7Days: 0,
          unapprovedQuotes: 0,
          unapprovedCustomers: 0,
          futureOrders: 0,
          productionOrders: 0,
          feedbackPending: 0,
        })
        setRecentOrders([])
        setTodayOrders([])

        setNext7DaysOrders([])
        return
      }

      // Handle 401 auth errors gracefully
      if (error?.response?.status === 401) {
        // Clear auth and redirect to login
        localStorage.removeItem("caterly-auth")
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.replace("/login")
        }
        return
      }

      // Log other errors
      console.error("Failed to fetch dashboard data:", error)

      // Set default empty data for other errors so page still renders
      setStats({
        totalOrders: 0,
        newOrders: 0,
        pendingApproval: 0,
        approved: 0,
        completed: 0,
        todayOrders: 0,
        totalRevenue: 0,
        deliveriesToday: 0,
        deliveriesNext7Days: 0,
        unapprovedQuotes: 0,
        unapprovedCustomers: 0,
        futureOrders: 0,
        productionOrders: 0,
        feedbackPending: 0,
      })
      setRecentOrders([])
      setTodayOrders([])

      setNext7DaysOrders([])
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingApprovals = async () => {
    try {
      setLoadingApprovals(true)
      const response = await api.get("/admin/customers/pending-approval")
      setPendingApprovals(response.data.customers || [])
    } catch (error: any) {
      console.error("Failed to fetch pending approvals:", error)
      toast.error("Failed to load pending approvals")
      setPendingApprovals([])
    } finally {
      setLoadingApprovals(false)
    }
  }

  const calculateChange = (current: number, previous: number | null): { value: number; isPositive: boolean } => {
    if (!previous || previous === 0) return { value: 0, isPositive: true }
    const change = current - previous
    return {
      value: Math.abs(change),
      isPositive: change >= 0
    }
  }

  const handlePrint = (orders: Order[], title: string) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const today = format(new Date(), 'dd MMM, yyyy')
    const tomorrow = format(new Date(Date.now() + 86400000), 'dd MMM, yyyy')

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #212529; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: 600; }
            tr:nth-child(even) { background-color: #f8f9fa; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>Date: ${title.includes('Today') ? today : tomorrow}</p>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Customer Phone</th>
                <th>Customer Email</th>
                <th>Delivery Time</th>
                <th>Order Status</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(order => `
                <tr>
                  <td>#${order.order_id}</td>
                  <td>${order.customer_order_name || `${order.customer?.firstname || ''} ${order.customer?.lastname || ''}`.trim() || 'N/A'}</td>
                  <td>${order.customer?.telephone || 'N/A'}</td>
                  <td>${order.customer?.email || 'N/A'}</td>
                  <td>${order.delivery_date_time ? format(new Date(order.delivery_date_time), 'hh:mm a') : 'N/A'}</td>
                  <td>${getStatusText(order.order_status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.print()
  }

  const handleMarkComplete = async (orderId: number) => {
    try {
      await api.put(`/admin/orders/${orderId}/complete`)
      toast.success("Order marked as complete!")
      // Refresh dashboard data
      fetchDashboardData()
      // Invalidate orders query cache to refresh the orders page
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    } catch (error: any) {
      console.error("Failed to mark order as complete:", error)
      toast.error(error.response?.data?.message || "Failed to mark order as complete")
    }
  }

  const handleViewOrder = (orderId: number) => {
    setSelectedOrderId(orderId)
    setIsOrderModalOpen(true)
  }

  const handleOrderModalClose = () => {
    setIsOrderModalOpen(false)
    setSelectedOrderId(null)
  }

  const handleOrderUpdated = () => {
    fetchDashboardData()
  }

  const handlePrintOrder = async (orderId: number) => {
    setPrintingOrderId(orderId)
    try {
      const response = await invoicesAPI.download(orderId)

      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const blobUrl = window.URL.createObjectURL(blob)

      // Open in new window for printing
      const printWindow = window.open(blobUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }

      // Clean up blob URL after a delay
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl)
      }, 1000)

      toast.success("Dispatch form opened for printing")
    } catch (error: any) {
      console.error("Failed to print order:", error)
      toast.error(error.response?.data?.message || "Failed to print dispatch form")
    } finally {
      setPrintingOrderId(null)
    }
  }

  const getCateringChecklistColor = (status: number) => {
    switch (status) {
      case 1: return "bg-red-500 hover:bg-red-600"
      case 2: return "bg-orange-500 hover:bg-orange-600"
      case 3: return "bg-pink-500 hover:bg-pink-600"
      case 4: return "bg-green-500 hover:bg-green-600"
      default: return "bg-yellow-500 hover:bg-yellow-600"
    }
  }

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1: return "text-blue-600"
      case 2: return "text-green-600"
      case 4: return "text-yellow-600"
      case 7: return "text-green-700"
      case 0: return "text-red-600"
      default: return "text-gray-600"
    }
  }

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return "Cancelled"
      case 1: return "Pending"
      case 2: return "Pending"
      case 3: return "Pending"
      case 4: return "Awaiting Approval"
      case 5: return "Completed"
      case 7: return "Approved"
      case 8: return "Rejected"
      case 9: return "Modified"
      default: return "Unknown"
    }
  }

  const getStatusBadge = (order: Order) => {
    const baseStyle = {
      fontFamily: 'Albert Sans',
      fontWeight: 600,
      fontStyle: 'normal',
      fontSize: '14px',
      lineHeight: '20px',
      letterSpacing: '0%',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      paddingTop: '2px',
      paddingBottom: '2px',
      paddingLeft: '8px',
      paddingRight: '8px',
      borderRadius: '50px',
      height: '24px',
      whiteSpace: 'nowrap' as const,
    }

    if (Number(order.is_completed) === 1) {
      return (
        <span
          style={{
            ...baseStyle,
            backgroundColor: '#f0fdf4',
            color: '#15803d',
          }}
        >
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          Completed
        </span>
      )
    }

    switch (order.order_status) {
      case 0:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#fef2f2',
              color: '#dc2626',
            }}
          >
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            {getStatusText(order.order_status)}
          </span>
        )
      case 1:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#fff7ed',
              color: '#ea580c',
            }}
          >
            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
            Pending
          </span>
        )
      case 2:
      case 3:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#fff7ed',
              color: '#ea580c',
            }}
          >
            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
            Pending
          </span>
        )
      case 4:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#fefce8',
              color: '#ca8a04',
            }}
          >
            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
            {getStatusText(order.order_status)}
          </span>
        )
      case 5:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#f0fdf4',
              color: '#15803d',
            }}
          >
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
            Completed
          </span>
        )
      case 7:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#eff6ff',
              color: '#2563eb',
            }}
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            {getStatusText(order.order_status)}
          </span>
        )
      case 8:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#fef2f2',
              color: '#dc2626',
            }}
          >
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            {getStatusText(order.order_status)}
          </span>
        )
      case 9:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#eff6ff',
              color: '#2563eb',
            }}
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            Modified
          </span>
        )
      default:
        return (
          <span
            style={{
              ...baseStyle,
              backgroundColor: '#f9fafb',
              color: '#374151',
            }}
          >
            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full"></div>
            {getStatusText(order.order_status)}
          </span>
        )
    }
  }

  // Pending approvals functions
  const handleApproveCustomer = async (customerId: number) => {
    try {
      await api.post(`/admin/customers/${customerId}/approve`)
      toast.success("Customer approved successfully!")

      // Remove the approved customer from the list instantly
      setPendingApprovals(prev => prev.filter(customer => customer.customer_id !== customerId))

      // Refresh dashboard stats to update counts
      fetchDashboardData()

    } catch (error: any) {
      console.error("Failed to approve customer:", error)
      toast.error(error.response?.data?.message || "Failed to approve customer")
    }
  }

  const handleRejectCustomer = async (customerId: number) => {
    try {
      await api.post(`/admin/customers/${customerId}/reject`)
      toast.success("Customer rejected successfully!")

      // Remove the rejected customer from the list instantly
      setPendingApprovals(prev => prev.filter(customer => customer.customer_id !== customerId))

      // Refresh dashboard stats to update counts
      fetchDashboardData()

    } catch (error: any) {
      console.error("Failed to reject customer:", error)
      toast.error(error.response?.data?.message || "Failed to reject customer")
    }
  }

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good Morning"
    if (hour < 18) return "Good Afternoon"
    return "Good Evening"
  }

  const todaysPendingOrders = todayOrders.filter(order => {
    if (!order.delivery_date_time) return false;
    const orderDate = new Date(order.delivery_date_time);
    const today = new Date();
    return orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();
  });

  return (
    <div className="space-y-4 md:space-y-8 bg-gray-50 w-full max-w-full overflow-x-hidden">
      {/* Header with Greeting and New Order Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl"
          style={{
            fontFamily: 'Albert Sans',
            fontWeight: 600,
            lineHeight: '1.2',
            letterSpacing: '0%'
          }}
        >
          {getGreeting()}, <span className="text-[#0d6efd]">{user?.username || 'User'}!</span>
        </h1>
        <Link href="/orders/new" className="w-full sm:w-auto">
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2 sm:gap-3 w-full sm:w-auto"
            style={{
              minWidth: '140px',
              maxWidth: '100%',
              height: '45px',
              paddingTop: '8px',
              paddingRight: '16px',
              paddingBottom: '8px',
              paddingLeft: '16px',
              borderRadius: '67px',
              fontFamily: 'Albert Sans',
              fontWeight: 600
            }}
          >
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-sm sm:text-base">Place New Order</span>
          </Button>
        </Link>
      </div>

      {/* Stats Grid - Modern Clean Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Today's Orders */}
        <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
            <div className="flex items-start justify-between mb-3 md:mb-4">
              <p style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs sm:text-sm text-gray-600">
                Today's Orders
              </p>
              {(() => {
                // Calculate orders placed today from recent orders list if stats are 0
                // This ensures newly placed orders show up instantly
                const placedToday = recentOrders.filter(order => {
                  if (!order.date_added) return false;
                  const orderDate = new Date(order.date_added);
                  const today = new Date();
                  return !order.standing_order && // Filter out standing orders
                    orderDate.getDate() === today.getDate() &&
                    orderDate.getMonth() === today.getMonth() &&
                    orderDate.getFullYear() === today.getFullYear();
                }).length;

                const displayCount = placedToday; // Show only manual orders count

                return (
                  <span style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className={`text-xs px-2 py-1 rounded-full ${displayCount > 0 ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'}`}>
                    {displayCount > 0 ? `+${displayCount}` : '0'}
                  </span>
                )
              })()}
            </div>
            <h2 style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-3xl sm:text-4xl text-gray-900">
              {(() => {
                const placedToday = recentOrders.filter(order => {
                  if (!order.date_added) return false;
                  const orderDate = new Date(order.date_added);
                  const today = new Date();
                  return !order.standing_order && // Filter out standing orders
                    orderDate.getDate() === today.getDate() &&
                    orderDate.getMonth() === today.getMonth() &&
                    orderDate.getFullYear() === today.getFullYear();
                }).length;
                return placedToday; // Show only manual orders count
              })()}
            </h2>
          </CardContent>
        </Card>

        {/* Today's Deliveries */}
        <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
            <div className="flex items-start justify-between mb-3 md:mb-4">
              <p style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs sm:text-sm text-gray-600">
                Today's Deliveries
              </p>
              {(() => {
                // Calculate deliveries from pending orders list if stats are missing or 0
                // reliable way to sync with the table below
                const pendingDeliveriesToday = todayOrders.filter(order => {
                  if (!order.delivery_date_time) return false;
                  const orderDate = new Date(order.delivery_date_time);
                  const today = new Date();
                  return orderDate.getDate() === today.getDate() &&
                    orderDate.getMonth() === today.getMonth() &&
                    orderDate.getFullYear() === today.getFullYear();
                }).length;

                const displayCount = Math.max(stats?.deliveriesToday || 0, pendingDeliveriesToday);

                return (
                  <>
                    <span style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className={`text-xs px-2 py-1 rounded-full ${displayCount > 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                      {displayCount > 0 ? `${displayCount}` : '0'}
                    </span>
                  </>
                );
              })()}
            </div>
            <h2 style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-3xl sm:text-4xl text-gray-900">
              {(() => {
                const pendingDeliveriesToday = todayOrders.filter(order => {
                  if (!order.delivery_date_time) return false;
                  const orderDate = new Date(order.delivery_date_time);
                  const today = new Date();
                  return orderDate.getDate() === today.getDate() &&
                    orderDate.getMonth() === today.getMonth() &&
                    orderDate.getFullYear() === today.getFullYear();
                }).length;
                return Math.max(stats?.deliveriesToday || 0, pendingDeliveriesToday);
              })()}
            </h2>
          </CardContent>
        </Card>



        {/* Pending Approvals */}
        <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
            <div className="flex items-start justify-between mb-3 md:mb-4">
              <p style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs sm:text-sm text-gray-600">
                Pending Approvals
              </p>
              {pendingApprovals.length > 0 && (
                <span style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-600 rounded-full">
                  {pendingApprovals.length} pending
                </span>
              )}
            </div>
            <h2 style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-3xl sm:text-4xl text-gray-900">
              {pendingApprovals.length || 0}
            </h2>
          </CardContent>
        </Card>

        {/* Total Revenue */}
        <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
            <div className="flex items-start justify-between mb-3 md:mb-4">
              <p style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs sm:text-sm text-gray-600">
                Total Revenue
              </p>
              {stats && stats.totalRevenue > 0 && (
                <span style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">
                  Active
                </span>
              )}
            </div>
            <h2 style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-3xl sm:text-4xl text-gray-900">
              ${stats?.totalRevenue ? Number(stats.totalRevenue).toFixed(2) : '0.00'}
            </h2>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Table */}
      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-200 bg-white p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3">
              <CardTitle style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-lg sm:text-xl text-gray-900">
                Pending Approvals
              </CardTitle>
              <p style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-500">
                New companies/users awaiting approval
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 text-xs sm:text-sm"
              size="sm"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              onClick={fetchPendingApprovals}
              disabled={loadingApprovals}
            >
              {loadingApprovals ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-12 xl:-mx-[108px] px-4 sm:px-6 lg:px-12 xl:px-[108px]">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Customer Name</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Contact</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Email</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Address</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Customer Type</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Company</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingApprovals ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      {Array.from({ length: 7 }).map((_, colIdx) => (
                        <td key={colIdx} className="px-3 sm:px-6 py-3 sm:py-4">
                          <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pendingApprovals && pendingApprovals.length > 0 ? (
                  pendingApprovals.map((customer, index) => (
                    <tr key={customer.customer_id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <Link 
                          href={`/customers?type=${encodeURIComponent(customer.customer_type)}&tab=Pending Approval`}
                          className="hover:underline"
                        >
                          <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm font-medium text-blue-600">
                            {customer.firstname} {customer.lastname}
                          </span>
                        </Link>
                        {customer.created_from === "storefront" && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" style={{ fontFamily: 'Albert Sans' }}>
                            Frontend
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600">
                          {customer.telephone || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600">
                          {customer.email || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600 line-clamp-2">
                          {customer.customer_address || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600">
                          {customer.customer_type || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600">
                          {customer.company?.company_name || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            onClick={() => handleApproveCustomer(customer.customer_id)}
                            style={{
                              fontFamily: 'Albert Sans',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '20px',
                            }}
                            className="h-9 px-4 text-sm bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                          >
                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectCustomer(customer.customer_id)}
                            style={{
                              fontFamily: 'Albert Sans',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '20px',
                            }}
                            className="h-9 px-4 text-sm border-red-300 text-red-700 hover:bg-red-50 whitespace-nowrap"
                          >
                            <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 sm:px-6 py-12 text-center text-gray-500">
                      <span style={{ fontFamily: 'Albert Sans' }}>No pending approvals</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Orders Table */}
      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-200 bg-white p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3">
              <CardTitle style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-lg sm:text-xl text-gray-900">
                Today's Pending Orders
              </CardTitle>
              <p style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-500">
                All pending orders for today including subscriptions
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 text-xs sm:text-sm"
              size="sm"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              onClick={() => handlePrint(todaysPendingOrders, "Today's Pending Orders")}
              disabled={todaysPendingOrders.length === 0}
            >
              <Printer className="h-3 w-3 sm:h-4 sm:w-4" />
              Print
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-12 xl:-mx-[108px] px-4 sm:px-6 lg:px-12 xl:px-[108px]">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Order ID</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Customer Name</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Customer Phone</th>
                  {/* 
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Delivery Date/Time</th> */}
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Order Status</th>
                  <th style={{ fontFamily: 'Albert Sans', fontWeight: 600 }} className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-700 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      {Array.from({ length: 7 }).map((_, colIdx) => (
                        <td key={colIdx} className="px-3 sm:px-6 py-3 sm:py-4">
                          <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : todaysPendingOrders && todaysPendingOrders.length > 0 ? (
                  todaysPendingOrders.map((order, index) => (
                    <tr key={order.order_id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm font-medium text-blue-600">#{order.order_id}</span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-900">
                            {order.customer_order_name || `${order.customer?.firstname || ''} ${order.customer?.lastname || ''}`.trim() || 'N/A'}
                          </span>
                          {order.standing_order ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200" style={{ fontFamily: 'Albert Sans' }}>
                              Subscription
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-600">
                          {order.customer?.telephone || 'N/A'}
                        </span>
                      </td>

                      {/* <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span style={{ fontFamily: 'Albert Sans' }} className="text-xs sm:text-sm text-gray-900">
                          {order.delivery_date_time
                            ? format(new Date(order.delivery_date_time), 'dd MMM, yyyy hh:mm a')
                            : order.date_added
                              ? format(new Date(order.date_added), 'dd MMM, yyyy')
                              : 'N/A'}
                        </span>
                      </td> */}
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        {getStatusBadge(order)}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewOrder(order.order_id)}
                            style={{
                              fontFamily: 'Albert Sans',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '20px',
                            }}
                            className="h-9 px-4 text-sm border border-gray-300 text-gray-700 hover:bg-black hover:text-white whitespace-nowrap"
                          >
                            View Order
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintOrder(order.order_id)}
                            disabled={printingOrderId === order.order_id}
                            style={{
                              fontFamily: 'Albert Sans',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '20px',
                            }}
                            className="h-9 px-4 text-sm border border-gray-300 text-gray-700 hover:bg-black hover:text-white whitespace-nowrap"
                          >
                            {printingOrderId === order.order_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4 mr-2" />
                            )}
                            {printingOrderId === order.order_id ? "Printing..." : "Print"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleMarkComplete(order.order_id)}
                            style={{
                              fontFamily: 'Albert Sans',
                              fontWeight: 600,
                              fontSize: '14px',
                              lineHeight: '20px',
                            }}
                            className="h-9 px-4 text-sm bg-[#0d6efd] hover:bg-[#0b5ed7] text-white whitespace-nowrap"
                          >
                            Complete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 sm:px-6 py-12 text-center text-gray-500">
                      <span style={{ fontFamily: 'Albert Sans' }}>No pending orders</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        open={isOrderModalOpen}
        onOpenChange={handleOrderModalClose}
        onOrderUpdated={handleOrderUpdated}
      />

    </div>
  )
}