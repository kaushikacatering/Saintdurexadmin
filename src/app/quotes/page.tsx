"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Calendar, Filter, Printer, Plus, Eye, Edit, FileText, Mail, RotateCcw, Trash2, AlertCircle, CheckCircle2, ArrowRight, MapPin, GripVertical, MoreVertical } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { printTableData } from "@/lib/print-utils"

interface Quote {
  order_id: number
  customer_id: number
  firstname?: string
  lastname?: string
  email?: string
  telephone?: string
  company_name?: string
  department_name?: string
  location_name?: string
  customer_order_name?: string
  delivery_date_time?: string
  delivery_date?: string
  delivery_time?: string
  order_total: number
  delivery_fee: number
  order_status: number
  date_added: string
  date_modified: string
  gst?: number
}

interface Location {
  location_id: number
  location_name: string
}

const statusOptions = [
  { value: "", label: "All Status" },
  { value: "1", label: "New" },
  { value: "4", label: "Awaiting Approval" },
  { value: "7", label: "Approved" },
  { value: "8", label: "Rejected" },
  { value: "9", label: "Modify" },
  { value: "5", label: "Cancelled" },
]

const getStatusLabel = (status: number) => {
  switch (status) {
    case 0: return "Quote"
    case 1: return "New"
    case 4: return "Awaiting Approval"
    case 7: return "Approved"
    case 8: return "Rejected"
    case 9: return "Modify"
    case 5: return "Cancelled"
    default: return "Unknown"
  }
}

const getStatusColor = (status: number) => {
  switch (status) {
    case 0: return "bg-gray-50 text-gray-700"   // Quote
    case 1: return "bg-blue-50 text-blue-700"   // New
    case 4: return "bg-yellow-50 text-yellow-700"  // Awaiting Approval
    case 7: return "bg-emerald-50 text-emerald-700"  // Approved
    case 8: return "bg-red-50 text-red-700"    // Rejected
    case 9: return "bg-orange-50 text-orange-700"  // Modify
    case 5: return "bg-red-50 text-red-700"    // Cancelled
    default: return "bg-gray-50 text-gray-700"
  }
}

export default function QuotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLocation, setSelectedLocation] = useState<number>(0)
  const [selectedStatus, setSelectedStatus] = useState("")
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showStatusFilter, setShowStatusFilter] = useState(false)
  const [selectedQuotes, setSelectedQuotes] = useState<number[]>([])
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteQuoteId, setDeleteQuoteId] = useState<number | null>(null)
  const [deleteQuoteName, setDeleteQuoteName] = useState("")
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)

  // Convert to order modal state
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [convertQuoteId, setConvertQuoteId] = useState<number | null>(null)
  const [convertQuoteName, setConvertQuoteName] = useState("")

  // Fetch locations
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      try {
        const response = await api.get('/admin/locations?limit=100')
        return response.data
      } catch (error: any) {
        console.error("Error fetching locations:", error)
        toast.error("Failed to load locations")
        throw error
      }
    }
  })

  const locations = locationsData?.locations || []

  // Fetch quotes
  const { data: quotesData, isLoading, refetch } = useQuery({
    queryKey: ['quotes', searchQuery, selectedLocation, selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      // Fetch more items to allow for client-side filtering
      params.append('limit', '1000')
      params.append('offset', '0')

      if (searchQuery) params.append('search', searchQuery)
      if (selectedLocation) params.append('location_id', selectedLocation.toString())
      if (selectedStatus) params.append('status', selectedStatus)

      const response = await api.get(`/admin/quotes?${params.toString()}`)
      return response.data
    }
  })

  // Client-side filtering by delivery date
  const allQuotes = quotesData?.quotes || []
  const filteredQuotes = useMemo(() => {
    return allQuotes.filter((quote: Quote) => {
      // Filter by delivery date range
      if (startDate || endDate) {
        if (!quote.delivery_date_time) return false

        // Extract date portion directly from string to avoid timezone shifts
        const dateStr = quote.delivery_date_time.split('T')[0].split(' ')[0]
        const [y, m, d] = dateStr.includes('-') ? dateStr.split('-') : dateStr.split('/');
        
        // Year could be at at end or start depending on format
        let year, month, day;
        if (y.length === 4) {
          year = parseInt(y);
          month = parseInt(m) - 1;
          day = parseInt(d);
        } else {
          year = parseInt(d);
          month = parseInt(m) - 1;
          day = parseInt(y);
        }
        
        const deliveryDateOnly = new Date(Date.UTC(year, month, day))

        if (startDate) {
          const start = new Date(startDate)
          const startDateOnly = new Date(Date.UTC(
            start.getFullYear(),
            start.getMonth(),
            start.getDate()
          ))
          if (deliveryDateOnly < startDateOnly) return false
        }

        if (endDate) {
          const end = new Date(endDate)
          const endDateOnly = new Date(Date.UTC(
            end.getFullYear(),
            end.getMonth(),
            end.getDate()
          ))
          if (deliveryDateOnly > endDateOnly) return false
        }
      }

      return true
    })
  }, [allQuotes, startDate, endDate])

  // Use filtered quotes directly without pagination
  const quotes = filteredQuotes

  // Check for success message from URL params and refetch quotes
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessMessage(true)
      // Invalidate quotes query cache - this will automatically trigger a refetch
      queryClient.invalidateQueries({ queryKey: ["quotes"] })
      setTimeout(() => {
        setShowSuccessMessage(false)
        router.replace('/quotes', { scroll: false })
      }, 5000)
    }
  }, [searchParams, router, queryClient])

  // Delete quote mutation
  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/admin/quotes/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] })
      toast.success("Quote deleted successfully!")
      setShowDeleteModal(false)
      setDeleteQuoteId(null)
      setDeleteQuoteName("")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete quote")
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => api.delete(`/admin/quotes/${id}`)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] })
      toast.success("Quotes deleted successfully!")
      setShowBulkDeleteModal(false)
      setSelectedQuotes([])
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete quotes")
    },
  })

  // Convert to order mutation
  const convertToOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.post(`/admin/quotes/${id}/convert`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] })
      toast.success("Quote converted to order successfully!")
      setShowConvertModal(false)
      setConvertQuoteId(null)
      setConvertQuoteName("")
      // router.push('/orders') // Stay on quotes page as requested
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to convert quote")
    },
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuotes(quotes.map((q: Quote) => q.order_id))
    } else {
      setSelectedQuotes([])
    }
  }

  const handleSelectQuote = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedQuotes([...selectedQuotes, id])
    } else {
      setSelectedQuotes(selectedQuotes.filter(qId => qId !== id))
    }
  }

  const handleDeleteQuote = (quote: Quote) => {
    setDeleteQuoteId(quote.order_id)
    setDeleteQuoteName(`Quote #${quote.order_id} for ${quote.firstname} ${quote.lastname}`)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = () => {
    if (deleteQuoteId) {
      deleteQuoteMutation.mutate(deleteQuoteId)
    }
  }

  const handleBulkDeleteClick = () => {
    if (selectedQuotes.length > 0) {
      setShowBulkDeleteModal(true)
    }
  }

  const handleConfirmBulkDelete = () => {
    if (selectedQuotes.length > 0) {
      bulkDeleteMutation.mutate(selectedQuotes)
    }
  }

  const handleConvertToOrder = (quote: Quote) => {
    setConvertQuoteId(quote.order_id)
    setConvertQuoteName(`Quote #${quote.order_id} for ${quote.firstname} ${quote.lastname}`)
    setShowConvertModal(true)
  }

  const handleConfirmConvert = () => {
    if (convertQuoteId) {
      convertToOrderMutation.mutate(convertQuoteId)
    }
  }

  const handlePrint = () => {
    printTableData("Quotes")
  }

  const handleRefresh = () => {
    refetch()
    toast.success("Quotes refreshed!")
  }

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen w-full max-w-full overflow-x-hidden" style={{ fontFamily: 'Albert Sans' }}>
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 font-medium" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
            Added new quote successfully
          </p>
        </div>
      )}

      {/* Header - Title and Add Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-gray-900 text-2xl sm:text-3xl lg:text-4xl" style={{
          fontFamily: 'Albert Sans',
          fontWeight: 600,
          fontStyle: 'normal',
          lineHeight: '1.2',
          letterSpacing: '0%'
        }}>
          Quotes
        </h1>
        <Link href="/quotes/new" className="w-full sm:w-auto">
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white whitespace-nowrap w-full sm:w-auto"
            style={{
              fontWeight: 600,
              minWidth: '196px',
              height: '54px',
              paddingTop: '8px',
              paddingRight: '16px',
              paddingBottom: '8px',
              paddingLeft: '16px',
              gap: '4px',
              borderRadius: '67px',
              opacity: 1
            }}
          >
            <Plus className="h-5 w-5" />
            Add New Quote
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 flex-wrap items-stretch sm:items-center">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Search Order ID, Customer ID, Status etc."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:max-w-md h-[54px] border border-gray-200 bg-white rounded-full focus:ring-2 focus:ring-[#0d6efd] focus:border-[#0d6efd] focus:outline-none"
            style={{ fontFamily: 'Albert Sans', paddingLeft: '44px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}
          />
        </div>

        <div className="relative flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="gap-2 border border-gray-200 bg-white whitespace-nowrap rounded-full hover:bg-gray-50 hover:text-gray-900 w-full sm:w-auto"
            style={{
              fontFamily: 'Albert Sans',
              fontWeight: 600,
              color: '#1f2937',
              minWidth: '155px',
              height: '54px',
              paddingTop: '8px',
              paddingRight: '24px',
              paddingBottom: '8px',
              paddingLeft: '24px',
              gap: '8px',
              borderRadius: '100px',
              opacity: 1
            }}
          >
            <Calendar className="h-5 w-5 text-gray-700" />
            Select Date
          </Button>
          {showDatePicker && (
            <div className="absolute top-full mt-2 z-50 bg-white p-4 rounded-lg shadow-lg border" style={{ minWidth: '300px', right: 0 }}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">From Date</label>
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => setStartDate(date)}
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
                    selected={endDate}
                    onChange={(date) => setEndDate(date)}
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
                      queryClient.invalidateQueries({ queryKey: ['quotes'] })
                    }}
                    className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white hover:text-white"
                    style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                  >
                    Apply
                  </Button>
                  <Button
                    onClick={() => {
                      setStartDate(null)
                      setEndDate(null)
                      setShowDatePicker(false)
                      queryClient.invalidateQueries({ queryKey: ['quotes'] })
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

        <div className="relative flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => setShowStatusFilter(!showStatusFilter)}
            className="gap-2 border border-gray-200 bg-white whitespace-nowrap rounded-full hover:bg-gray-50 hover:text-gray-900 w-full sm:w-auto"
            style={{
              fontFamily: 'Albert Sans',
              fontWeight: 600,
              color: '#1f2937',
              minWidth: '157px',
              height: '54px',
              paddingTop: '8px',
              paddingRight: '24px',
              paddingBottom: '8px',
              paddingLeft: '24px'
            }}
          >
            <Filter className="h-5 w-5 text-gray-700" />
            Filter Status
          </Button>
          {showStatusFilter && (
            <div className="absolute top-12 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[200px]">
              {statusOptions.map((option: any) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedStatus(option.value)
                    setShowStatusFilter(false)
                  }}
                  className={`w-full text-left px-4 py-2 rounded hover:bg-gray-100 ${selectedStatus === option.value ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  style={{ fontFamily: 'Albert Sans' }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {selectedQuotes.length > 0 && (
            <Button
              variant="outline"
              onClick={handleBulkDeleteClick}
              className="gap-2 border border-red-200 bg-red-50 text-red-700 whitespace-nowrap rounded-full hover:bg-red-100 hover:text-red-800"
              style={{
                fontFamily: 'Albert Sans',
                fontWeight: 600,
                color: '#b91c1c',
                height: '54px',
                paddingTop: '8px',
                paddingRight: '24px',
                paddingBottom: '8px',
                paddingLeft: '24px'
              }}
            >
              <Trash2 className="h-5 w-5 text-red-700" />
              Delete Selected ({selectedQuotes.length})
            </Button>
          )}
          <Button
            onClick={handlePrint}
            className="gap-2 whitespace-nowrap border-0 shadow-none"
            style={{
              fontFamily: 'Albert Sans',
              fontWeight: 600,
              fontStyle: 'normal',
              fontSize: '16px',
              lineHeight: '20px',
              letterSpacing: '0%',
              textAlign: 'center',
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
      </div>

      {/* Location Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
        <button
          onClick={() => setSelectedLocation(0)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${selectedLocation === 0
            ? "border-[#0d6efd] text-[#0d6efd]"
            : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
        >
          <span className="w-5 h-5 flex items-center justify-center">📍</span>
          All Locations
        </button>
        {locations.map((location: Location) => (
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
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[600px] sm:min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={selectedQuotes.length === quotes.length && quotes.length > 0}
                    onCheckedChange={handleSelectAll}
                    className="h-5 w-5"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Order ID
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Customer Name
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Company
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Department
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Amount
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  <div className="flex items-center gap-2">
                    Status
                    <GripVertical className="h-4 w-4 text-gray-400 rotate-90" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    Loading quotes...
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No quotes found. Try adjusting your filters or create a new quote.
                  </td>
                </tr>
              ) : (
                quotes.map((quote: Quote) => (
                  <tr key={quote.order_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <Checkbox
                        checked={selectedQuotes.includes(quote.order_id)}
                        onCheckedChange={(checked) => handleSelectQuote(quote.order_id, checked as boolean)}
                        className="h-5 w-5"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/quotes/${quote.order_id}`}
                        prefetch={false}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        style={{
                          fontFamily: 'Albert Sans',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '20px',
                          letterSpacing: '0%',
                          display: 'inline-block'
                        }}
                      >
                        #{quote.order_id}
                      </Link>
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
                        {quote.firstname} {quote.lastname}
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
                        {quote.company_name || 'N/A'}
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
                        {quote.department_name || 'N/A'}
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
                        ${Number(quote.order_total || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(quote.order_status)}`}>
                        {quote.order_status === 2 || quote.order_status === 7 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <div className={`w-1.5 h-1.5 rounded-full ${quote.order_status === 5 || quote.order_status === 8 ? 'bg-red-500' :  // Cancelled/Rejected - red
                            quote.order_status === 4 ? 'bg-yellow-500' : // Awaiting Approval - yellow
                              quote.order_status === 9 ? 'bg-orange-500' : // Modify - orange
                                'bg-blue-500'  // New (status 1) - blue
                            }`}></div>
                        )}
                        {getStatusLabel(quote.order_status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => router.push(`/quotes/${quote.order_id}`)}
                              className="cursor-pointer"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => router.push(`/quotes/${quote.order_id}/edit?step=2`)}
                              className="cursor-pointer"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Quote
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleConvertToOrder(quote)}
                              disabled={convertToOrderMutation.isPending}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center">
                                <FileText className="h-4 w-4 mr-2" />
                                <ArrowRight className="h-3 w-3 mr-1" />
                                <span>Convert to Order</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={handleRefresh}
                              className="cursor-pointer"
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Refresh
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteQuote(quote)}
                              className="cursor-pointer text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Quote
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 700 }}>
              Delete Quote
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: 'Albert Sans' }}>
                  Are you sure you want to permanently delete this quote? This action cannot be undone.
                </p>
                <p className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  {deleteQuoteName}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              className="border-gray-300"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              disabled={deleteQuoteMutation.isPending}
            >
              {deleteQuoteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 700 }}>
              Confirm Bulk Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: 'Albert Sans' }}>
                  Are you sure you want to delete {selectedQuotes.length} selected quotes? This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteModal(false)}
              className="border-gray-300"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              disabled={bulkDeleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Order Confirmation Modal */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 700 }}>
              Convert to Order
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-green-100">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: 'Albert Sans' }}>
                  Are you sure you want to convert this quote to an order? This will change the status and move it to the orders section.
                </p>
                <p className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                  {convertQuoteName}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowConvertModal(false)}
              className="border-gray-300"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              disabled={convertToOrderMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConvert}
              className="bg-green-600 hover:bg-green-700 text-white"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              disabled={convertToOrderMutation.isPending}
            >
              {convertToOrderMutation.isPending ? "Converting..." : "Convert to Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
