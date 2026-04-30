"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Calendar, Filter, Printer, Plus, Eye, Edit, FileText, Mail, RotateCcw, Trash2, DollarSign, ArrowUpDown, MoreVertical, Image as ImageIcon, Upload, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { invoicesAPI, ordersAPI } from "@/lib/api"
import { OrderDetailModal } from "@/components/OrderDetailModal"
import { PaymentProcessingModal } from "@/components/PaymentProcessingModal"
import { printTableData } from "@/lib/print-utils"
import { Badge } from "@/components/ui/badge"


// Component to fetch and calculate accurate order amount client-side
// This is needed because the backend list endpoint doesn't calculate option prices correctly
const OrderAmountDisplay = ({ orderId, initialData }: { orderId: number, initialData?: any }) => {
  const { data: orderDetails } = useQuery({
    queryKey: ['order-amount', orderId],
    queryFn: async () => {
      const response = await api.get(`/admin/orders/${orderId}`)
      return response.data.order
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    initialData: initialData
  })

  // Use backend provided total directly to ensure consistency
  // If we have detailed data, use it. Otherwise use initial prop data.
  const order = orderDetails || initialData || {}

  const total = Number(order.calculated_total || order.order_total || 0)
  let gst = Number(order.gst || 0)

  // If GST is 0/missing but we have products (from detail fetch), calculate it
  if (gst === 0 && order.products && Array.isArray(order.products)) {
    const productsTotal = order.products.reduce((acc: number, product: any) => {
      const pPrice = Number(product.price || 0)
      const pQty = Number(product.quantity || 0)
      const pTotal = pPrice * pQty

      const optionsTotal = (product.options || []).reduce((oAcc: number, opt: any) => {
        const oPrice = Number(opt.option_price || opt.price || 0)
        const oQty = Number(opt.option_quantity || opt.quantity || 1)
        return oAcc + (oPrice * oQty)
      }, 0)

      return acc + pTotal + optionsTotal
    }, 0)

    // Check for discount
    const discount = Number(order.coupon_discount || 0)
    const taxable = Math.max(0, productsTotal - discount)
    gst = taxable * 0.1
  }

  // Return full total instead of EX GST
  return <span>${total.toFixed(2)}</span>
}

interface Order {
  order_id: number
  customer_name: string
  customer_firstname: string
  customer_lastname: string
  email: string
  telephone: string
  company: string
  department: string
  location_name: string
  location_id: number
  delivery_date: string | null
  delivery_time: string | null
  delivery_date_time?: string | null
  order_total: number
  gst?: number
  order_status: number
  payment_status?: number | string  // 0 = Unpaid, 1 = Paid
  standing_order: number
  customer_type?: string
  user_id?: number | null
  source?: string
  is_completed?: number | string
  order_made_from?: string | null
}

interface Location {
  location_id: number
  location_name: string
}

// Order status mapping
const orderStatusMap: Record<number, { label: string; color: string; bgColor: string; borderColor: string }> = {
  0: { label: "Cancelled", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
  1: { label: "Pending", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  2: { label: "Pending", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  3: { label: "Pending", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  4: { label: "Awaiting Approval", color: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  5: { label: "Completed", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200" },
  7: { label: "Approved", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  8: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
}

const orderTabs = [
  { key: "future", label: "Pending Orders" },
  { key: "past", label: "Completed Orders" },
  { key: "reminder", label: "Reminder Orders" },
  // { key: "late", label: "Late Orders" },
  { key: "wholesale", label: "Wholesale Orders" },
]

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTab, setSelectedTab] = useState(() => {
    const tab = searchParams?.get('tab')
    return tab || "future"
  })
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState<Date | null>(null)
  const [dateTo, setDateTo] = useState<Date | null>(null)
  const [amountFilter, setAmountFilter] = useState("")

  // UI state
  const [selectedOrders, setSelectedOrders] = useState<number[]>([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState<number | null>(null)
  const [showImageUploadModal, setShowImageUploadModal] = useState(false)
  const [imageUploadOrderId, setImageUploadOrderId] = useState<number | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await api.get('/admin/locations?limit=100')
      return response.data
    }
  })

  const locations: Location[] = locationsData?.locations || []

  // Handle URL params and refresh orders when coming from order creation/update
  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab && tab !== selectedTab) {
      setSelectedTab(tab)
    }

    // If coming from order creation/update, invalidate queries to refresh
    if (searchParams.get('success') === 'true' || searchParams.get('tab')) {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  }, [searchParams, queryClient, selectedTab])

  // Build query params
  const buildQueryParams = () => {
    const params: Record<string, any> = {
      limit: 1000,
      offset: 0,
    }

    // If wholesale tab is selected, use wholesale filter instead of order_type
    if (selectedTab === "wholesale") {
      params.wholesale = "true"
    } else if (selectedTab === "future") {
      // For Pending Orders tab, fetch all to find past-due incomplete ones
      params.order_type = "all"
    } else {
      params.order_type = selectedTab
    }

    if (selectedLocation) params.location_id = selectedLocation
    if (selectedStatus !== null) params.status = selectedStatus
    if (searchQuery) params.search = searchQuery
    if (dateFrom) params.from_date = format(dateFrom, 'yyyy-MM-dd')
    if (dateTo) params.to_date = format(dateTo, 'yyyy-MM-dd 23:59:59')
    if (amountFilter) {
      const parts = amountFilter.split('.')
      if (parts[0]) params.min_amount = parts[0]
      if (parts[1]) params.max_amount = parts[1]
    }

    return new URLSearchParams(params).toString()
  }

  // Fetch orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', selectedTab, selectedLocation, selectedStatus, searchQuery, dateFrom, dateTo, amountFilter],
    queryFn: async () => {
      const queryString = buildQueryParams()

      // Fetch orders and subscriptions in parallel
      const [ordersResponse, activeSubsResponse, inactiveSubsResponse] = await Promise.all([
        api.get(`/admin/orders?${queryString}`),
        api.get('/admin/subscriptions?limit=1000&status=active'),
        api.get('/admin/subscriptions?limit=1000&status=inactive')
      ])

      let ordersList = ordersResponse.data.orders || []
      const activeSubs = activeSubsResponse.data.subscriptions || []
      const inactiveSubs = inactiveSubsResponse.data.subscriptions || []
      const allSubs = [...activeSubs, ...inactiveSubs]

      // Map order_id -> standing_order frequency for existing orders
      const subMap = new Map(allSubs.map((s: any) => [s.order_id, s.standing_order]))

      // 1. Enrich existing orders with standing_order flag
      const enrichedOrders = ordersList.map((order: any) => ({
        ...order,
        standing_order: order.standing_order || subMap.get(order.order_id) || 0
      }))

      // 2. Identify missing subscriptions to append
      // Determine which subscriptions belong in this view
      let relevantSubs: any[] = []
      if (selectedTab === 'past') {
        relevantSubs = inactiveSubs
      } else {
        // Future, Reminder, Wholesale -> show Active subscriptions
        relevantSubs = activeSubs
      }

      // Filter relevant subscriptions if search is active (basic client-side search)
      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase()
        relevantSubs = relevantSubs.filter((s: any) =>
          s.customer_name?.toLowerCase().includes(lowerQ) ||
          s.order_id.toString().includes(lowerQ) ||
          s.company?.toLowerCase().includes(lowerQ)
        )
      }

      // Filter relevant subscriptions if Location is selected
      if (selectedLocation) {
        relevantSubs = relevantSubs.filter((s: any) => s.location_id === selectedLocation)
      }

      // Filter relevant subscriptions if Wholesale tab (check customer type if available, else loose)
      if (selectedTab === 'wholesale') {
        // Subscriptions API might not return customer_type, but let's try to filter if possible
        // Or just assume all active subscriptions show in wholesale tab for visibility? 
        // Better to rely on the parallel fetch logic. 
        // For now, allow them.
      }

      // Find subscriptions that are NOT in the current orders page
      const currentIds = new Set(enrichedOrders.map((o: any) => o.order_id))
      const missingSubs = relevantSubs.filter((s: any) => !currentIds.has(s.order_id))

      // 3. Combine and Sort
      // Note: This appends missing subscriptions to the CURRENT page of orders.
      // This is a client-side patch for visibility.
      let finalOrders = [...enrichedOrders, ...missingSubs]
        .sort((a: any, b: any) => b.order_id - a.order_id) // Default sort desc

      if (selectedTab === 'past') {
        finalOrders = finalOrders.filter((order: any) => 
          String(order.is_completed) === "1" || order.order_status === 5
        );
      }

      if (selectedTab === 'future') {
        finalOrders = finalOrders.filter((order: any) => 
          String(order.is_completed) !== "1" && order.order_status !== 5
        );
      }

      if (selectedTab === 'wholesale') {
        finalOrders = finalOrders.filter((order: any) => {
          if (!order.customer_type) return false;
          const type = order.customer_type.toLowerCase();
          return type.includes('wholesale') || type.includes('wholesaler');
        });
      }

      // Calculate count ensuring it reflects filtered items
      const finalCount = finalOrders.length;

      return {
        ...ordersResponse.data,
        orders: finalOrders,
        count: finalCount
      }
    },
    staleTime: 0, // Always consider data stale to ensure fresh data on refresh
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  })

  const orders: Order[] = ordersData?.orders || []

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/orders/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success("Order deleted successfully")
      setShowDeleteModal(false)
      setDeleteOrderId(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete order")
    }
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => api.delete(`/admin/orders/${id}`)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success("Orders deleted successfully")
      setShowBulkDeleteModal(false)
      setSelectedOrders([])
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete orders")
    }
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: number }) => {
      await api.put(`/admin/orders/${id}/status`, { order_status: status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order'] })
      toast.success("Order marked as paid successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update status")
    }
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(orders.map(order => order.order_id))
    } else {
      setSelectedOrders([])
    }
  }

  const handleSelectOrder = (orderId: number, checked: boolean) => {
    if (checked) {
      setSelectedOrders([...selectedOrders, orderId])
    } else {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId))
    }
  }

  const handleDeleteClick = (orderId: number) => {
    setDeleteOrderId(orderId)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = () => {
    if (deleteOrderId) {
      deleteMutation.mutate(deleteOrderId)
    }
  }

  const handleBulkDeleteClick = () => {
    if (selectedOrders.length > 0) {
      setShowBulkDeleteModal(true)
    }
  }

  const handleConfirmBulkDelete = () => {
    if (selectedOrders.length > 0) {
      bulkDeleteMutation.mutate(selectedOrders)
    }
  }

  const handleClearFilters = () => {
    setSearchQuery("")
    setSelectedStatus(null)
    setDateFrom(null)
    setDateTo(null)
    setAmountFilter("")
  }

  const handlePrint = () => {
    printTableData("Orders")
  }

  // Email mutation
  const emailMutation = useMutation({
    mutationFn: async ({ orderId, customMessage }: { orderId: number; customMessage?: string }) => {
      return await ordersAPI.sendEmail(orderId, { email_type: 'order_confirmation', custom_message: customMessage })
    },
    onSuccess: (data) => {
      if (data.data.email_sent || (data.data.message && data.data.message.toLowerCase().includes('success'))) {
        toast.success("Email sent successfully")
      } else {
        // Only show this warning if we are sure it failed or wasn't sent
        if (data.data.error) {
          toast.error(data.data.error);
        } else {
          toast.info("Email prepared (email service not configured)")
        }
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to send email")
    }
  })

  // Download invoice mutation - uses dynamic generation (no S3)
  const downloadInvoiceMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await invoicesAPI.download(orderId)

      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const blobUrl = window.URL.createObjectURL(blob)

      // Create download link
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `invoice-${orderId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl)

      return response.data
    },
    onSuccess: () => {
      toast.success("Invoice downloaded successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to download invoice")
    }
  })

  const handleViewOrder = (orderId: number) => {
    console.log("View order:", orderId)
    setSelectedOrderId(orderId)
    setShowOrderDetailModal(true)
  }

  const handleEditOrder = (orderId: number) => {
    console.log("Edit order:", orderId)
    // Redirect to order edit page
    router.push(`/orders/${orderId}/edit`)
  }

  const handlePayment = (orderId: number) => {
    console.log("Payment order:", orderId)
    // Open payment modal or redirect to payment page
    setPaymentOrderId(orderId)
    setShowPaymentModal(true)
  }


  const handleMarkAsPaid = async (orderId: number) => {
    try {
      // This endpoint will be created on the backend to update payment_status field
      await api.put(`/admin/orders/${orderId}/mark-paid`)
      toast.success("Order marked as paid!")
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    } catch (error: any) {
      console.error("Failed to mark order as paid:", error)
      toast.error(error.response?.data?.message || "Failed to mark order as paid")
    }
  }



  const handleMarkComplete = async (orderId: number) => {
    try {
      await api.put(`/admin/orders/${orderId}/complete`)
      toast.success("Order marked as complete!")
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    } catch (error: any) {
      console.error("Failed to mark order as complete:", error)
      toast.error(error.response?.data?.message || "Failed to mark order as complete")
    }
  }

  const handleEmailOrder = async (order: Order) => {
    console.log("Email order:", order.order_id)
    try {
      await emailMutation.mutateAsync({ orderId: order.order_id })
    } catch (error) {
      console.error("Email error:", error)
      // Error handled by mutation
    }
  }

  const handleDownloadOrder = async (orderId: number) => {
    console.log("Download order:", orderId)
    try {
      await downloadInvoiceMutation.mutateAsync(orderId)
    } catch (error) {
      console.error("Download error:", error)
      // Error handled by mutation
    }
  }

  const handleRefreshOrder = (orderId: number) => {
    console.log("Refresh order:", orderId)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['order', orderId] })
    toast.success("Order refreshed")
  }

  const handleAttachImage = (orderId: number) => {
    setImageUploadOrderId(orderId)
    setShowImageUploadModal(true)
  }

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error("Please select an image file")
        return
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image size must be less than 10MB")
        return
      }
      setSelectedImageFile(file)
    }
  }

  const handleImageUpload = async () => {
    if (!imageUploadOrderId || !selectedImageFile) {
      toast.error("Please select an image file")
      return
    }

    try {
      const formData = new FormData()
      formData.append("image", selectedImageFile)
      formData.append("order_id", imageUploadOrderId.toString())

      const response = await api.post("/admin/upload/order-image", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })

      if (response.data.success) {
        toast.success("Image attached successfully")
        setShowImageUploadModal(false)
        setSelectedImageFile(null)
        setImageUploadOrderId(null)
        queryClient.invalidateQueries({ queryKey: ['orders'] })
      } else {
        toast.error("Failed to attach image")
      }
    } catch (error: any) {
      console.error("Image upload error:", error)
      toast.error(error.response?.data?.message || "Failed to attach image")
    }
  }

  const getStatusBadge = (order: Order) => {
    if (String(order.is_completed) === "1") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <span className="w-2 h-2 bg-green-700 rounded-full"></span>
          Completed
        </span>
      )
    }

    const statusInfo = orderStatusMap[order.order_status] || orderStatusMap[1]
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color} border ${statusInfo.borderColor}`}>
        <span className={`w-2 h-2 ${statusInfo.color.replace('text-', 'bg-')} rounded-full`}></span>
        {statusInfo.label}
      </span>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen w-full max-w-full overflow-x-hidden" style={{ fontFamily: 'Albert Sans' }}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <h1 className="text-gray-900 text-2xl sm:text-3xl lg:text-4xl" style={{
          fontFamily: 'Albert Sans',
          fontWeight: 600,
          fontStyle: 'normal',
          lineHeight: '1.2',
          letterSpacing: '0%'
        }}>
          {selectedTab === 'past' ? 'Past Orders' : selectedTab === 'future' ? 'Future Orders' : selectedTab === 'reminder' ? 'Reminder Orders' : selectedTab === 'late' ? 'Late Orders' : 'Wholesale Orders'}
        </h1>
        <Link href="/orders/new" className="w-full sm:w-auto">
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white whitespace-nowrap w-full sm:w-auto"
            style={{
              fontWeight: 600,
              minWidth: '196px',
              height: '54px',
              paddingLeft: '24px',
              paddingRight: '24px',
              gap: '8px',
              borderRadius: '67px',
              opacity: 1
            }}
          >
            <Plus className="h-5 w-5" />
            Place New Order
          </Button>
        </Link>
      </div>

      {/* Order Type Tabs */}
      <div className="flex gap-2 sm:gap-3 mb-6 overflow-x-auto pb-2 scrollbar-none no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {orderTabs.map((tab: any) => (
          <button
            key={tab.key}
            onClick={() => setSelectedTab(tab.key)}
            className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${selectedTab === tab.key
              ? tab.key === 'wholesale'
                ? "bg-purple-100 text-purple-700 border-2 border-purple-500"
                : "bg-[#e7f1ff] text-[#0d6efd] border-2 border-[#0d6efd]"
              : "bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300"
              }`}
            style={{ fontFamily: 'Albert Sans', fontWeight: 500 }}
          >
            {tab.label}
            {tab.key === 'wholesale' && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-xs">
                W
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info banner for wholesale tab */}
      {selectedTab === 'wholesale' && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-800" style={{ fontFamily: 'Albert Sans' }}>
            <strong>Wholesale Orders Only:</strong> This view shows only orders from wholesale customers.
            Use Past/Future/Reminder tabs to see all orders regardless of customer type.
          </p>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col xl:flex-row gap-4 mb-6 items-stretch xl:items-center">
        <div className="flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-center flex-1">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search Order ID, Customer ID, Status etc."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-[300px] h-[54px] border border-gray-200 bg-white rounded-full focus:ring-2 focus:ring-[#0d6efd] focus:border-[#0d6efd] focus:outline-none"
              style={{ fontFamily: 'Albert Sans', paddingLeft: '44px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}
            />
          </div>

          <div className="relative flex-1 md:flex-initial">
            <Button
              variant="outline"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="gap-2 border border-gray-200 bg-white whitespace-nowrap rounded-full hover:bg-gray-50 hover:text-gray-900 w-full md:w-auto"
              style={{
                fontFamily: 'Albert Sans',
                fontWeight: 600,
                color: '#6b7280',
                minWidth: '155px',
                height: '54px',
                paddingTop: '8px',
                paddingRight: '24px',
                paddingBottom: '8px',
                paddingLeft: '24px',
                gap: '8px',
                borderRadius: '100px',
                borderWidth: '1px',
                opacity: 1
              }}
            >
              <Calendar className="h-5 w-5 text-gray-500" />
              Select Date
            </Button>
            {showDatePicker && (
              <div className="absolute top-full mt-2 z-50 bg-white p-4 rounded-lg shadow-lg border">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">From Date</label>
                    <DatePicker
                      selected={dateFrom}
                      onChange={(date) => {
                        setDateFrom(date)
                        if (date) {
                          queryClient.invalidateQueries({ queryKey: ['orders'] })
                        }
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="border rounded px-3 py-2 w-full"
                      placeholderText="DD/MM/YYYY"
                      showYearDropdown
                      showMonthDropdown
                      dropdownMode="select"
                      isClearable
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">To Date</label>
                    <DatePicker
                      selected={dateTo}
                      onChange={(date) => {
                        setDateTo(date)
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="border rounded px-3 py-2 w-full"
                      placeholderText="DD/MM/YYYY"
                      showYearDropdown
                      showMonthDropdown
                      dropdownMode="select"
                      isClearable
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setShowDatePicker(false)
                        queryClient.invalidateQueries({ queryKey: ['orders'] })
                      }}
                      className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white hover:text-white"
                      style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                    >
                      Apply
                    </Button>
                    <Button
                      onClick={() => {
                        setDateFrom(null)
                        setDateTo(null)
                        setShowDatePicker(false)
                        queryClient.invalidateQueries({ queryKey: ['orders'] })
                      }}
                      variant="outline"
                      className="flex-1"
                      style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => setSelectedStatus(selectedStatus === 3 ? null : 3)}
            className={`gap-2 border border-gray-200 bg-white whitespace-nowrap rounded-full hover:bg-gray-50 hover:text-gray-900 flex-1 md:flex-initial ${selectedStatus === 3 ? "bg-blue-50 text-blue-700 border-blue-300" : ""
              }`}
            style={{
              fontFamily: 'Albert Sans',
              fontWeight: 600,
              color: selectedStatus === 3 ? '#1e40af' : '#6b7280',
              height: '54px',
              paddingTop: '8px',
              paddingRight: '24px',
              paddingBottom: '8px',
              paddingLeft: '24px',
              gap: '8px',
              borderRadius: '100px',
              borderWidth: '1px',
              opacity: 1
            }}
          >
            <Filter className="h-5 w-5 text-gray-500" />
            Paid Orders
          </Button>

          {selectedOrders.length > 0 && (
            <Button
              variant="outline"
              onClick={handleBulkDeleteClick}
              className="gap-2 border border-red-200 bg-red-50 text-red-700 whitespace-nowrap rounded-full hover:bg-red-100 hover:text-red-800 flex-1 md:flex-initial"
              style={{
                fontFamily: 'Albert Sans',
                fontWeight: 600,
                height: '54px',
                paddingTop: '8px',
                paddingRight: '24px',
                paddingBottom: '8px',
                paddingLeft: '24px',
                gap: '8px',
                borderRadius: '100px',
                borderWidth: '1px',
                opacity: 1
              }}
            >
              <Trash2 className="h-5 w-5 text-red-700" />
              Delete Selected ({selectedOrders.length})
            </Button>
          )}

          <div className="flex items-center justify-center min-w-fit">
            <Button
              onClick={handleClearFilters}
              className="text-[#0d6efd] hover:text-[#0b5ed7] bg-transparent border-0 shadow-none p-0 h-auto whitespace-nowrap"
              style={{
                fontFamily: 'Albert Sans',
                fontWeight: 600,
                fontSize: '16px'
              }}
            >
              Clear Filters
            </Button>
          </div>

          <div
            className="flex items-center justify-between border border-gray-200 bg-white rounded-full w-full md:w-[312px]"
            style={{
              height: '54px',
              paddingTop: '8px',
              paddingRight: '12px',
              paddingBottom: '8px',
              paddingLeft: '12px',
              borderRadius: '100px',
              borderWidth: '1px',
              opacity: 1
            }}
          >
            <div className="flex items-center gap-2 flex-1">
              <DollarSign className="h-5 w-5 text-gray-500" />
              <input
                type="text"
                value={amountFilter}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '')
                  setAmountFilter(value)
                }}
                placeholder="56.00"
                className="outline-none text-sm flex-1 bg-transparent text-gray-700"
                style={{ fontFamily: 'Albert Sans' }}
              />
            </div>
            <Button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['orders'] })
              }}
              className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white whitespace-nowrap rounded-full hover:text-white"
              style={{
                fontFamily: 'Albert Sans',
                fontWeight: 600,
                height: 'auto',
                paddingTop: '6px',
                paddingRight: '16px',
                paddingBottom: '6px',
                paddingLeft: '16px',
                borderRadius: '100px',
                borderWidth: '0px'
              }}
            >
              Submit
            </Button>
          </div>
        </div>

        <Button
          onClick={handlePrint}
          className="gap-2 whitespace-nowrap border-0 shadow-none hover:bg-transparent justify-center"
          style={{
            fontFamily: 'Albert Sans',
            fontWeight: 600,
            fontStyle: 'normal',
            fontSize: '16px',
            lineHeight: '20px',
            letterSpacing: '0%',
            color: '#0d6efd',
            backgroundColor: 'transparent',
            padding: 0,
            gap: '8px',
            opacity: 1
          }}
        >
          <Printer className="h-5 w-5 text-[#0d6efd]" />
          Print
        </Button>
      </div>

      {/* Location Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto mb-6 no-scrollbar scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <button
          onClick={() => setSelectedLocation(null)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${selectedLocation === null
            ? "border-[#0d6efd] text-[#0d6efd]"
            : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
        >
          <span className="w-5 h-5 flex items-center justify-center">📍</span>
          All Locations
        </button>
        {locations.map((location: any) => (
          <button
            key={location.location_id}
            onClick={() => setSelectedLocation(location.location_id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${selectedLocation === location.location_id
              ? "border-[#0d6efd] text-[#0d6efd]"
              : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
          >
            <span className="w-5 h-5 flex items-center justify-center">📍</span>
            {location.location_name}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={orders.length > 0 && selectedOrders.length === orders.length}
                    onCheckedChange={handleSelectAll}
                    className="h-5 w-5"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortField === 'order_id') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('order_id')
                      setSortDirection('asc')
                    }
                  }}
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  <div className="flex items-center gap-2">
                    Order ID
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortField === 'customer_name') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('customer_name')
                      setSortDirection('asc')
                    }
                  }}
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  <div className="flex items-center gap-2">
                    Customer Name
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortField === 'company') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('company')
                      setSortDirection('asc')
                    }
                  }}
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  <div className="flex items-center gap-2">
                    Company
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortField === 'department') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('department')
                      setSortDirection('asc')
                    }
                  }}
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  <div className="flex items-center gap-2">
                    Department
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>

                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (sortField === 'order_total') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField('order_total')
                      setSortDirection('asc')
                    }
                  }}
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  <div className="flex items-center gap-2">
                    Amount
                    <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left"
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  Order Status
                </th>
                <th
                  className="px-4 py-3 text-left"
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  Payment Status
                </th>
                <th
                  className="px-4 py-3 text-left"
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  Type
                </th>
                <th
                  className="px-4 py-3 text-left"
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  Order Made From
                </th>
                <th
                  className="px-4 py-3 text-left"
                  style={{
                    fontFamily: 'Albert Sans',
                    fontWeight: 600,
                    fontStyle: 'normal',
                    fontSize: '14px',
                    lineHeight: '20px',
                    letterSpacing: '0%'
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    {Array.from({ length: 11 }).map((_, colIdx) => (
                      <td key={colIdx} className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => {
                  return (
                    <tr key={order.order_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedOrders.includes(order.order_id)}
                          onCheckedChange={(checked) => handleSelectOrder(order.order_id, checked as boolean)}
                          className="h-5 w-5"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/orders/${order.order_id}`} prefetch={true} onClick={(e) => e.stopPropagation()}>
                          <span className="text-blue-600 hover:underline cursor-pointer" style={{
                            fontFamily: 'Albert Sans',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '20px',
                            letterSpacing: '0%'
                          }}>
                            #{order.order_id}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900" style={{
                            fontFamily: 'Albert Sans',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '20px',
                            letterSpacing: '0%'
                          }}>
                            {order.customer_name || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-gray-700" style={{
                          fontFamily: 'Albert Sans',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '20px',
                          letterSpacing: '0%'
                        }}>
                          {order.company || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-gray-700" style={{
                          fontFamily: 'Albert Sans',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '20px',
                          letterSpacing: '0%'
                        }}>
                          {order.department || 'N/A'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="text-gray-900" style={{
                          fontFamily: 'Albert Sans',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '20px',
                          letterSpacing: '0%'
                        }}>
                          <OrderAmountDisplay
                            orderId={order.order_id}
                            initialData={order}
                          />
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(order)}
                      </td>
                      <td className="px-4 py-4">
                        {/* Check payment_status first, fallback to order_status for backward compatibility */}
                        {(order.payment_status !== undefined && order.payment_status !== null
                          ? (String(order.payment_status) === "1" || Number(order.payment_status) === 1 || String(order.payment_status).toLowerCase() === "paid" || String(order.payment_status).toLowerCase() === "true")
                          : (order.order_status === 2 || order.order_status === 3 || order.order_status === 5)) ? (
                          <Badge className="bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
                            Paid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 whitespace-nowrap">
                            Unpaid
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {/* Customer Type Badge */}
                          {order.customer_type && (order.customer_type.includes('Wholesale') || order.customer_type.includes('Wholesaler')) ? (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 whitespace-nowrap">
                              Wholesale
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 whitespace-nowrap">
                              Retail
                            </Badge>
                          )}



                          {/* Subscription Badge */}
                          {order.standing_order > 0 && (
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">
                              Subscription
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {order.order_made_from === 'admin' ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                            Admin Made Order
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                            User Order
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => handleViewOrder(order.order_id)}
                                className="cursor-pointer"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEditOrder(order.order_id)}
                                className="cursor-pointer"
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Order
                              </DropdownMenuItem>
                              {/* <DropdownMenuItem
                                onClick={() => handlePayment(order.order_id)}
                                className="cursor-pointer"
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                Process Payment
                              </DropdownMenuItem> */}
                              <DropdownMenuItem
                                onClick={() => handleMarkAsPaid(order.order_id)}
                                disabled={
                                  updateStatusMutation.isPending ||
                                  (order.payment_status !== undefined && order.payment_status !== null
                                    ? (String(order.payment_status) === "1" || Number(order.payment_status) === 1 || String(order.payment_status).toLowerCase() === "paid" || String(order.payment_status).toLowerCase() === "true")
                                    : (order.order_status === 2 || order.order_status === 3 || order.order_status === 5))
                                }
                                className="cursor-pointer"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Mark Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleMarkComplete(order.order_id)}
                                disabled={String(order.is_completed) === "1"}
                                className="cursor-pointer"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDownloadOrder(order.order_id)}
                                disabled={downloadInvoiceMutation.isPending}
                                className="cursor-pointer"
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Download Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEmailOrder(order)}
                                disabled={emailMutation.isPending}
                                className="cursor-pointer"
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                Send Email to Customer
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRefreshOrder(order.order_id)}
                                className="cursor-pointer"
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Refresh Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleAttachImage(order.order_id)}
                                className="cursor-pointer"
                              >
                                <ImageIcon className="h-4 w-4 mr-2" />
                                Attach Image
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(order.order_id)}
                                className="cursor-pointer text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete order #{deleteOrderId}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedOrders.length} selected orders? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteModal(false)}
              disabled={bulkDeleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        open={showOrderDetailModal}
        onOpenChange={setShowOrderDetailModal}
        onOrderUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['orders'] })
        }}
      />

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Process payment for order #{paymentOrderId}
            </DialogDescription>
          </DialogHeader>
          {paymentOrderId && (
            <PaymentProcessingModal
              orderId={paymentOrderId}
              onSuccess={() => {
                setShowPaymentModal(false)
                queryClient.invalidateQueries({ queryKey: ['orders'] })
                queryClient.invalidateQueries({ queryKey: ['order', paymentOrderId] })
                toast.success("Payment processed successfully")
              }}
              onClose={() => setShowPaymentModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Image Upload Modal */}
      <Dialog open={showImageUploadModal} onOpenChange={setShowImageUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
              Attach Image to Order #{imageUploadOrderId}
            </DialogTitle>
            <DialogDescription style={{ fontFamily: 'Albert Sans' }}>
              Select an image file to attach to this order
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ fontFamily: 'Albert Sans' }}>
                Select Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileSelect}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                style={{ fontFamily: 'Albert Sans' }}
              />
              {selectedImageFile && (
                <p className="mt-2 text-sm text-gray-600" style={{ fontFamily: 'Albert Sans' }}>
                  Selected: {selectedImageFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImageUploadModal(false)
                setSelectedImageFile(null)
                setImageUploadOrderId(null)
              }}
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImageUpload}
              disabled={!selectedImageFile}
              className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
