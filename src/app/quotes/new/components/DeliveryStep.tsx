"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ValidatedInput } from "@/components/ui/validated-input"
import { ValidatedTextarea } from "@/components/ui/validated-textarea"
import { ValidationRules } from "@/lib/validation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, Mail, CheckCircle, Tag, Plus, X, HelpCircle, GripVertical } from "lucide-react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { QuoteData } from "../page"
import api from "@/lib/api"
import { locationsAPI } from "@/lib/api"
import { toast } from "sonner"
import { formatAustralianPhone, cleanPhoneNumber, getPhonePlaceholder, getPhoneValidationError } from "@/lib/phone-mask"

interface DeliveryStepProps {
  data: QuoteData
  onUpdate: (data: Partial<QuoteData>) => void
  onSave: (data?: Partial<QuoteData>, sendToEmail?: string) => void
  onBack: () => void
}

interface Coupon {
  coupon_id: number
  coupon_code: string
  type: 'P' | 'F' // P = percentage, F = fixed
  coupon_discount: number
  status: number
}

interface Location {
  location_id: number
  location_name: string
  pickup_address: string
}

// Sortable Product Item Component for Order Summary
function SortableProductItem({ product, index, onReorder }: {
  product: QuoteData['products'][0]
  index: number
  onReorder: (oldIndex: number, newIndex: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `product-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="border-b border-gray-100 pb-4 last:border-0">
      <div className="flex items-start gap-2 mb-2">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing mt-1"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                {product.name}
              </p>
              {product.comment && (
                <p className="text-xs text-gray-600 mt-1 italic" style={{ fontFamily: 'Albert Sans' }}>
                  Note: {product.comment}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600" style={{ fontFamily: 'Albert Sans' }}>Qty:</span>
              <span className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                {product.quantity}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
              ${(Number(product.price || 0) * Number(product.quantity || 0)).toFixed(2)}
            </span>
          </div>

          {product.add_ons && product.add_ons.length > 0 && (
            <div className="space-y-2 mt-2 ml-4">
              {product.add_ons.map((addon, addonIndex) => (
                <div key={addonIndex} className="flex items-center justify-between">
                  <p className="text-xs text-gray-600" style={{ fontFamily: 'Albert Sans' }}>
                    {addon.name} (x{addon.quantity})
                  </p>
                  <span className="text-xs text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    +${(Number(addon.price || 0) * Number(addon.quantity || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DeliveryStep({ data, onUpdate, onSave, onBack }: DeliveryStepProps) {
  const [products, setProducts] = useState(data.products || [])

  // Use a ref to prevent infinite loops when updating
  const isUpdatingRef = useRef(false)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id.toString().replace('product-', ''))
      const newIndex = parseInt(over.id.toString().replace('product-', ''))
      const reorderedProducts = arrayMove(products, oldIndex, newIndex)
      setProducts(reorderedProducts)
      onUpdate({ products: reorderedProducts })
    }
  }
  // Parse delivery_contact from "Name|Number" format
  const parseDeliveryContact = (contact: string | undefined) => {
    if (!contact) return { name: "", number: "" }
    const parts = contact.split("|")
    return { name: parts[0] || "", number: parts[1] || "" }
  }

  // Parse delivery_details - now just returns notes as-is (backward compatible with old format)
  const parseDeliveryDetails = (details: string | undefined) => {
    if (!details) return ""
    // If it's the old structured format, extract the values and combine them
    const timeMatch = details.match(/Time:\s*(.+)/i)
    const locationMatch = details.match(/Location:\s*(.+)/i)
    const nameMatch = details.match(/Name:\s*(.+)/i)

    // If it matches old format, combine into notes
    if (timeMatch || locationMatch || nameMatch) {
      const parts = []
      if (timeMatch) parts.push(`Time: ${timeMatch[1].trim()}`)
      if (locationMatch) parts.push(`Location: ${locationMatch[1].trim()}`)
      if (nameMatch) parts.push(`Name: ${nameMatch[1].trim()}`)
      return parts.join('\n')
    }

    // Otherwise return as-is (new format)
    return details
  }

  // Parse delivery_date_time to extract date and time
  const parseDeliveryDateTime = (dateTime: string | undefined) => {
    if (!dateTime) {
      // Return empty - no default date/time for future orders/quotes
      return { date: "", time: "" }
    }

    try {
      // Handle ISO format (e.g., "2026-01-03T18:30:00.000Z")
      if (dateTime.includes('T')) {
        const dateObj = new Date(dateTime)
        if (!isNaN(dateObj.getTime())) {
          // Extract date in YYYY-MM-DD format (use local date, not UTC)
          const year = dateObj.getFullYear()
          const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
          const day = dateObj.getDate().toString().padStart(2, '0')
          const date = `${year}-${month}-${day}`
          // Extract time in HH:MM format (use local time, not UTC)
          const hours = dateObj.getHours().toString().padStart(2, '0')
          const minutes = dateObj.getMinutes().toString().padStart(2, '0')
          const time = `${hours}:${minutes}`
          console.log('Parsed ISO dateTime:', dateTime, 'to date:', date, 'time:', time)
          return { date, time }
        }
      }

      // Handle "YYYY-MM-DD HH:MM:SS" format
      const parts = dateTime.split(' ')
      if (parts.length >= 2) {
        const date = parts[0] || ""
        const time = parts[1] ? parts[1].substring(0, 5) : "" // Extract HH:MM from HH:MM:SS
        return { date, time }
      }

      // Handle "YYYY-MM-DD" format (date only)
      if (dateTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { date: dateTime, time: "" }
      }
    } catch (error) {
      console.error('Error parsing delivery_date_time:', error, dateTime)
    }

    return { date: "", time: "" }
  }

  const initialDeliveryContact = parseDeliveryContact(data.delivery_contact)
  const initialDeliveryDetails = parseDeliveryDetails(data.delivery_details)
  const initialDeliveryDateTime = parseDeliveryDateTime(data.delivery_date_time)

  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDateTime.date || "")
  const [deliveryTime, setDeliveryTime] = useState(data.delivery_time || initialDeliveryDateTime.time || "")
  const [accountEmail, setAccountEmail] = useState(data.account_email || "")
  const [costCenter, setCostCenter] = useState(data.cost_center || "")
  const [deliveryContactName, setDeliveryContactName] = useState(initialDeliveryContact.name)
  const [deliveryContactNumber, setDeliveryContactNumber] = useState(initialDeliveryContact.number)
  const [deliveryNotes, setDeliveryNotes] = useState(initialDeliveryDetails)
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(data.delivery_method || "delivery")
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<number>(data.location_id || 0)
  const [deliveryAddress, setDeliveryAddress] = useState(data.delivery_address || "")
  const [deliveryFee, setDeliveryFee] = useState(data.delivery_fee || 0)
  const [couponCode, setCouponCode] = useState(data.coupon_code || "")
  const [orderComments, setOrderComments] = useState(data.order_comments || "")
  const [showSendModal, setShowSendModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [sendEmail, setSendEmail] = useState(data.email || "")
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [showCouponList, setShowCouponList] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [locationName, setLocationName] = useState("")
  const [departmentName, setDepartmentName] = useState("")

  // Fetch active coupons (status=1 means active)
  const { data: couponsData } = useQuery({
    queryKey: ['coupons-active'],
    queryFn: async () => {
      const response = await api.get('/admin/coupons?status=1&limit=100')
      console.log("Coupons response:", response.data)
      return response.data
    }
  })

  // Fetch locations for pickup addresses
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await locationsAPI.list()
      return response.data
    }
  })

  // Fetch company details
  const { data: companyData } = useQuery({
    queryKey: ['company', data.company_id],
    queryFn: async () => {
      if (data.company_id) {
        const response = await api.get(`/admin/companies/${data.company_id}`)
        return response.data
      }
      return null
    },
    enabled: !!data.company_id
  })

  // Fetch location details
  const { data: locationData } = useQuery({
    queryKey: ['location', data.location_id],
    queryFn: async () => {
      if (data.location_id) {
        const response = await api.get(`/admin/locations/${data.location_id}`)
        return response.data
      }
      return null
    },
    enabled: !!data.location_id
  })

  // Fetch department details
  const { data: departmentData } = useQuery({
    queryKey: ['department', data.department_id],
    queryFn: async () => {
      if (data.department_id && data.company_id) {
        try {
          const response = await api.get(`/admin/companies/${data.company_id}/departments`)
          const dept = response.data?.departments?.find((d: any) => d.department_id === data.department_id)
          return dept ? { department: dept } : undefined
        } catch {
          return null
        }
      }
      return null
    },
    enabled: !!data.department_id && !!data.company_id
  })

  const activeCoupons = couponsData?.coupons || []
  const locations = locationsData?.locations || []

  // Update company/location/department names
  useEffect(() => {
    if (companyData?.company?.company_name) {
      setCompanyName(companyData.company.company_name)
    }
    if (locationData?.location?.location_name) {
      setLocationName(locationData.location.location_name)
    }
    if (departmentData?.department?.department_name) {
      setDepartmentName(departmentData.department.department_name)
    }
  }, [companyData, locationData, departmentData])

  // Auto-apply coupon when editing if coupon_code exists in data
  useEffect(() => {
    if (data.coupon_code) {
      // First try to find in active coupons
      const coupon = activeCoupons.find((c: Coupon) =>
        c.coupon_code.toLowerCase() === data.coupon_code?.toLowerCase()
      )

      if (coupon) {
        // Only update if the coupon code changed or coupon is not applied
        if (!appliedCoupon || appliedCoupon.coupon_code.toLowerCase() !== coupon.coupon_code.toLowerCase()) {
          setAppliedCoupon(coupon)
          setCouponCode(coupon.coupon_code)
        }
      } else if (data.coupon_type && data.coupon_discount) {
        // If coupon not found in active list but we have coupon data from order/quote, create a temporary coupon object
        const tempCoupon: Coupon = {
          coupon_id: 0, // Temporary ID
          coupon_code: data.coupon_code,
          type: data.coupon_type,
          coupon_discount: data.coupon_discount,
          status: 0 // Mark as inactive since it's not in active list
        }
        if (!appliedCoupon || appliedCoupon.coupon_code.toLowerCase() !== tempCoupon.coupon_code.toLowerCase()) {
          setAppliedCoupon(tempCoupon)
          setCouponCode(tempCoupon.coupon_code)
        }
      } else if (!appliedCoupon) {
        // If coupon code exists but no coupon data, just set the code
        setCouponCode(data.coupon_code)
      }
    } else if (!data.coupon_code && appliedCoupon) {
      // Clear coupon if it was removed from data
      setAppliedCoupon(null)
      setCouponCode("")
    }
  }, [data.coupon_code, data.coupon_type, data.coupon_discount, activeCoupons])

  // Parse delivery_contact and delivery_details from existing data
  useEffect(() => {
    // Parse delivery_contact (format: "Name|Number" or just name)
    if (data.delivery_contact) {
      const parts = data.delivery_contact.split('|')
      if (parts.length === 2) {
        setDeliveryContactName(parts[0].trim())
        setDeliveryContactNumber(parts[1].trim())
      } else {
        setDeliveryContactName(data.delivery_contact)
      }
    }

    // Parse delivery_details (now just notes)
    if (data.delivery_details !== undefined) {
      setDeliveryNotes(parseDeliveryDetails(data.delivery_details))
    }
  }, [data.delivery_contact, data.delivery_details])

  // Sync all fields when data prop changes (for edit mode)
  // Skip if we're in the middle of an update to prevent resetting user changes
  useEffect(() => {
    // Skip if we're in the middle of an update
    if (isUpdatingRef.current) return

    console.log('DeliveryStep useEffect triggered - data:', {
      delivery_date_time: data.delivery_date_time,
      delivery_date: data.delivery_date,
      delivery_time: data.delivery_time,
    })

    if (data.products) setProducts(data.products)

    // Always prioritize delivery_date_time if available
    if (data.delivery_date_time) {
      const parsed = parseDeliveryDateTime(data.delivery_date_time)
      console.log('Parsed delivery_date_time:', parsed, 'from:', data.delivery_date_time)
      // Always set date and time from parsed result (even if empty strings)
      console.log('Setting deliveryDate to:', parsed.date)
      setDeliveryDate(parsed.date || "")
      if (parsed.time) {
        console.log('Setting deliveryTime to:', parsed.time)
        setDeliveryTime(parsed.time)
      } else {
        // If no time in delivery_date_time, clear time field
        setDeliveryTime("")
      }
    } else {
      // Fallback to separate date/time fields if delivery_date_time is not available
      if (data.delivery_date !== undefined) {
        console.log('Setting deliveryDate from delivery_date:', data.delivery_date)
        setDeliveryDate(data.delivery_date || "")
      }
      if (data.delivery_time !== undefined) {
        console.log('Setting deliveryTime from delivery_time:', data.delivery_time)
        setDeliveryTime(data.delivery_time || "")
      }
    }

    if (data.account_email !== undefined) setAccountEmail(data.account_email || "")
    if (data.cost_center !== undefined) setCostCenter(data.cost_center || "")
    if (data.delivery_address !== undefined) setDeliveryAddress(data.delivery_address || "")
    if (data.delivery_method !== undefined) setDeliveryMethod(data.delivery_method || "delivery")
    if (data.location_id !== undefined) {
      setSelectedPickupLocation(data.location_id)
    }
    if (data.delivery_fee !== undefined) setDeliveryFee(data.delivery_fee || 0)
    if (data.order_comments !== undefined) setOrderComments(data.order_comments || "")
    if (data.delivery_contact !== undefined) {
      const parsed = parseDeliveryContact(data.delivery_contact)
      setDeliveryContactName(parsed.name)
      setDeliveryContactNumber(parsed.number)
    }
    if (data.delivery_details !== undefined) {
      setDeliveryNotes(parseDeliveryDetails(data.delivery_details || ""))
    }

    // Log current deliveryDate state for debugging
    console.log('Current deliveryDate state after useEffect:', deliveryDate)
  }, [data, data.delivery_date_time, data.delivery_date, data.delivery_time])

  // Log deliveryDate whenever it changes
  useEffect(() => {
    console.log('deliveryDate state changed to:', deliveryDate)
  }, [deliveryDate])

  const calculateSubtotal = () => {
    return products.reduce((sum, item) => {
      const itemPrice = Number(item.price || 0)
      const itemQty = Number(item.quantity || 0)
      const itemTotal = itemPrice * itemQty
      const addOnsTotal = (item.add_ons || []).reduce((addOnSum, addOn) => {
        const addonPrice = Number(addOn.price || 0)
        const addonQty = Number(addOn.quantity || 0)
        return addOnSum + (addonPrice * addonQty)
      }, 0)
      return sum + itemTotal + addOnsTotal
    }, 0)
  }

  const subtotal = calculateSubtotal()

  // Calculate wholesale discount if applicable
  let wholesaleDiscount = 0
  const customerType = data.customer_type || ''
  
  // Hardcoded wholesale discount logic removed as per request
  // Backend handles customer pricing via base prices
  const afterWholesaleDiscount = subtotal - wholesaleDiscount

  // Calculate coupon discount (applied after wholesale discount)
  let couponDiscount = 0
  if (appliedCoupon) {
    if (appliedCoupon.type === 'P') { // P for percentage
      couponDiscount = afterWholesaleDiscount * (Number(appliedCoupon.coupon_discount) / 100)
    } else if (appliedCoupon.type === 'F') { // F for fixed
      couponDiscount = Number(appliedCoupon.coupon_discount)
    }
    // Ensure discount doesn't exceed afterWholesaleDiscount
    couponDiscount = Math.min(couponDiscount, afterWholesaleDiscount)
  }

  const afterDiscount = afterWholesaleDiscount - couponDiscount
  const taxableSubtotal = (data.products || []).reduce((sum, item) => {
    const cat = (item.category || '').toUpperCase()
    if (cat === 'ANCILLARIES' || cat === 'PACKAGING') {
      const itemPrice = Number(item.price || 0)
      const itemQty = Number(item.quantity || 0)
      const itemTotal = itemPrice * itemQty
      const addOnsTotal = (item.add_ons || []).reduce((addOnSum, addOn) => {
        const addonPrice = Number(addOn.price || 0)
        const addonQty = Number(addOn.quantity || 0)
        return addOnSum + (addonPrice * addonQty)
      }, 0)
      return sum + itemTotal + addOnsTotal
    }
    return sum
  }, 0)

  const gst = taxableSubtotal * 0.1 // 10% GST on filtered subtotal
  const total = afterDiscount + deliveryFee // Display only, GST not added to total

  const handleApplyCoupon = () => {
    if (couponCode.trim()) {
      // Find coupon from list
      const coupon = activeCoupons.find((c: Coupon) =>
        c.coupon_code.toLowerCase() === couponCode.toLowerCase()
      )

      if (coupon) {
        setAppliedCoupon(coupon)
        toast.success(`Coupon "${coupon.coupon_code}" applied successfully!`)
      } else {
        toast.error("Invalid or expired coupon code")
      }
    }
  }

  const handleSelectCoupon = (couponId: string) => {
    const coupon = activeCoupons.find((c: Coupon) => c.coupon_id === Number(couponId))
    if (coupon) {
      setCouponCode(coupon.coupon_code)
      setAppliedCoupon(coupon)
      setShowCouponList(false)
      toast.success(`Coupon "${coupon.coupon_code}" applied successfully!`)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode("")
    toast.info("Coupon removed")
  }

  const handleSaveQuote = () => {
    // Validate delivery fee
    if (isNaN(deliveryFee) || deliveryFee < 0) {
      toast.error("Delivery fee must be a valid number greater than or equal to 0")
      return
    }

    // Validate delivery method
    if (deliveryMethod === 'pickup' && selectedPickupLocation === 0) {
      toast.error("Please select a pickup location")
      return
    }

    if (deliveryMethod === 'delivery' && !deliveryAddress?.trim()) {
      toast.error("Please enter a delivery address")
      return
    }

    // Build delivery_contact as "Name|Number"
    const deliveryContact = deliveryContactName
      ? `${deliveryContactName}${deliveryContactNumber ? `|${deliveryContactNumber}` : ''}`
      : ''

    // Build delivery_details from notes
    const deliveryDetails = deliveryNotes?.trim() || ''

    // Set delivery address based on method
    const finalDeliveryAddress = deliveryMethod === 'pickup' && selectedPickupLocation > 0
      ? locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address || ''
      : deliveryAddress

    const updateData: any = {
      delivery_date: deliveryDate || undefined,
      delivery_time: deliveryTime || undefined,
      delivery_date_time: deliveryDate && deliveryTime ? `${deliveryDate} ${deliveryTime}:00` : undefined,
      account_email: accountEmail,
      cost_center: costCenter,
      delivery_contact: deliveryContact,
      delivery_details: deliveryDetails,
      delivery_method: deliveryMethod,
      delivery_address: finalDeliveryAddress,
      delivery_fee: deliveryFee || 0,
      order_comments: orderComments,
      location_id: deliveryMethod === 'pickup' ? selectedPickupLocation : undefined,
    }

    // Always explicitly set coupon fields (even if null/undefined to clear them)
    if (appliedCoupon) {
      updateData.coupon_code = appliedCoupon.coupon_code
      updateData.coupon_type = appliedCoupon.type
      updateData.coupon_discount = appliedCoupon.coupon_discount
    } else {
      updateData.coupon_code = undefined
      updateData.coupon_type = undefined
      updateData.coupon_discount = undefined
    }

    console.log("DeliveryStep - Saving quote with coupon data:", {
      appliedCoupon,
      coupon_code: updateData.coupon_code,
      coupon_type: updateData.coupon_type,
      coupon_discount: updateData.coupon_discount,
    })

    // Update state first
    onUpdate(updateData)

    // Reset updating flag after a short delay
    setTimeout(() => {
      isUpdatingRef.current = false
    }, 100)

    // Save with the latest data including coupon info
    // Pass updateData to ensure coupon is included even if state hasn't updated yet
    onSave(updateData)
  }

  const handleSendToCustomer = () => {
    // Build delivery_contact as "Name|Number"
    const deliveryContact = deliveryContactName
      ? `${deliveryContactName}${deliveryContactNumber ? `|${deliveryContactNumber}` : ''}`
      : ''

    // Build delivery_details from notes
    const deliveryDetails = deliveryNotes?.trim() || ''

    // Set delivery address based on method
    const finalDeliveryAddress = deliveryMethod === 'pickup' && selectedPickupLocation > 0
      ? locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address || ''
      : deliveryAddress

    onUpdate({
      delivery_date: deliveryDate || undefined,
      delivery_time: deliveryTime || undefined,
      delivery_date_time: deliveryDate && deliveryTime ? `${deliveryDate} ${deliveryTime}:00` : undefined,
      account_email: accountEmail,
      cost_center: costCenter,
      delivery_contact: deliveryContact,
      delivery_details: deliveryDetails,
      delivery_method: deliveryMethod,
      delivery_address: finalDeliveryAddress,
      delivery_fee: deliveryFee,
      coupon_code: appliedCoupon?.coupon_code || undefined,
      coupon_type: appliedCoupon?.type || undefined,
      coupon_discount: appliedCoupon?.coupon_discount || undefined,
      order_comments: orderComments,
      location_id: deliveryMethod === 'pickup' ? selectedPickupLocation : undefined,
    })

    setShowSendModal(true)
  }

  const handleConfirmSend = () => {
    if (!sendEmail.trim()) {
      toast.error("Please enter a valid email address")
      return
    }

    setShowSendModal(false)
    setShowSuccessModal(true)

    // Build updateData with latest coupon info
    const deliveryContact = deliveryContactName
      ? `${deliveryContactName}${deliveryContactNumber ? `|${deliveryContactNumber}` : ''}`
      : ''
    const deliveryDetails = deliveryNotes?.trim() || ''
    const finalDeliveryAddress = deliveryMethod === 'pickup' && selectedPickupLocation > 0
      ? locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address || ''
      : deliveryAddress

    const updateData: any = {
      delivery_date: deliveryDate || undefined,
      delivery_time: deliveryTime || undefined,
      delivery_date_time: deliveryDate && deliveryTime ? `${deliveryDate} ${deliveryTime}:00` : undefined,
      account_email: accountEmail,
      cost_center: costCenter,
      delivery_contact: deliveryContact,
      delivery_details: deliveryDetails,
      delivery_method: deliveryMethod,
      delivery_address: finalDeliveryAddress,
      delivery_fee: deliveryFee || 0,
      coupon_code: appliedCoupon?.coupon_code || undefined,
      coupon_type: appliedCoupon?.type || undefined,
      coupon_discount: appliedCoupon?.coupon_discount || undefined,
      order_comments: orderComments,
      location_id: deliveryMethod === 'pickup' ? selectedPickupLocation : undefined,
    }

    setTimeout(() => {
      setShowSuccessModal(false)
      // Pass sendEmail as second arg so page.tsx uses it for the send-email API call
      onSave(updateData, sendEmail.trim())
    }, 2000)
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Delivery Details */}
        <div className="lg:col-span-2">
          <Card className="p-8 bg-white border-gray-200">
            {/* Back Button */}
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              <ChevronLeft className="h-5 w-5" />
              <span style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Back</span>
            </button>

            {/* Customer Info */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
                Ordering for <span className="text-[#0d6efd]">{data.customer_name || "John Doe"}</span>
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">📞 Phone Number</span>
                  <span className="text-gray-900">{data.phone || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-600" />
                  <span className="text-gray-600">Email</span>
                  <span className="text-gray-900">{data.email || "N/A"}</span>
                </div>
                {locationName && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">📍 Location</span>
                    <span className="text-gray-900">{locationName}</span>
                  </div>
                )}
                {companyName && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">🏢 Company</span>
                    <span className="text-gray-900">{companyName}</span>
                  </div>
                )}
                {departmentName && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-gray-600">🏛️ Department</span>
                    <span className="text-gray-900">{departmentName}</span>
                  </div>
                )}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-6" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
              Enter Delivery Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cost Center */}
              <ValidatedInput
                label="Cost Center"
                placeholder="Enter"
                value={costCenter}
                validationRule={ValidationRules.order.cost_center}
                fieldName="Cost Center"
                onChange={(value) => {
                  setCostCenter(value)
                  onUpdate({ cost_center: value, delivery_method: deliveryMethod })
                }}
                className="h-11 border-gray-300"
              />

              {/* Delivery Notes */}
              {/* <ValidatedTextarea
                label="Notes"
                placeholder="Enter time, location, and name"
                value={deliveryNotes}
                fieldName="Notes"
                onChange={(value) => {
                  setDeliveryNotes(value)
                  onUpdate({ delivery_details: value || '', delivery_method: deliveryMethod })
                }}
                rows={3}
                className="border-gray-300 resize-none md:col-span-2"
              /> */}

              {/* Delivery Method */}
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium text-gray-700">
                  Delivery Method: <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="delivery"
                      checked={deliveryMethod === "delivery"}
                      onChange={(e) => {
                        const newMethod = e.target.value as "delivery"
                        setDeliveryMethod(newMethod)
                        setSelectedPickupLocation(0)
                        onUpdate({ delivery_method: newMethod, location_id: undefined })
                      }}
                      className="w-4 h-4 text-[#0d6efd]"
                    />
                    <span className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                      Delivery
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="pickup"
                      checked={deliveryMethod === "pickup"}
                      onChange={(e) => {
                        const newMethod = e.target.value as "pickup"
                        setDeliveryMethod(newMethod)
                        onUpdate({ delivery_method: newMethod })
                      }}
                      className="w-4 h-4 text-[#0d6efd]"
                    />
                    <span className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                      Pickup
                    </span>
                  </label>
                </div>
              </div>

              {/* Pickup Location Selection */}
              {deliveryMethod === "pickup" && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pickupLocation" className="text-sm font-medium text-gray-700">
                    Pickup Location <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="pickupLocation"
                    value={selectedPickupLocation}
                    onChange={(e) => {
                      const locId = Number(e.target.value)
                      setSelectedPickupLocation(locId)
                      const location = locations.find((l: Location) => l.location_id === locId)
                      if (location) {
                        setDeliveryAddress(location.pickup_address || '')
                      }
                    }}
                    className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent"
                    style={{ fontFamily: 'Albert Sans' }}
                  >
                    <option value={0}>Select Pickup Location</option>
                    {locations.map((location: Location) => (
                      <option key={location.location_id} value={location.location_id}>
                        {location.location_name} - {location.pickup_address || 'No address'}
                      </option>
                    ))}
                  </select>
                  {selectedPickupLocation > 0 && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Pickup Address:</span>{' '}
                        {locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address || 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Address - Only show for delivery method */}
              {deliveryMethod === "delivery" && (
                <ValidatedTextarea
                  label="Delivery Address *"
                  placeholder="Enter Address"
                  value={deliveryAddress}
                  validationRule={ValidationRules.order.delivery_address}
                  fieldName="Delivery Address"
                  onChange={(value) => {
                    setDeliveryAddress(value)
                    // Always include delivery_method to prevent it from being reset
                    onUpdate({ delivery_address: value, delivery_method: deliveryMethod })
                  }}
                  rows={3}
                  className="border-gray-300 resize-none md:col-span-2"
                />
              )}

              {/* Delivery Fee */}
              <ValidatedInput
                label="Delivery Fee"
                type="number"
                step="0.01"
                placeholder="Enter Delivery Fee"
                value={deliveryFee.toString()}
                validationRule={ValidationRules.order.delivery_fee}
                fieldName="Delivery Fee"
                onChange={(value, isValid) => {
                  const numValue = parseFloat(value) || 0
                  setDeliveryFee(numValue)
                  onUpdate({ delivery_fee: numValue, delivery_method: deliveryMethod })
                }}
                className="h-11 border-gray-300 md:col-span-2"
              />
            </div>
          </Card>
        </div>

        {/* Right: Order Summary */}
        <div className="lg:col-span-1">
          <Card className="p-6 bg-white border-gray-200 sticky top-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
              Order Summary
            </h3>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={products.map((_, index) => `product-${index}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4 mb-6">
                  {products.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8" style={{ fontFamily: 'Albert Sans' }}>
                      No products added yet
                    </p>
                  ) : (
                    products.map((product, index) => (
                      <SortableProductItem
                        key={`product-${index}`}
                        product={product}
                        index={index}
                        onReorder={(oldIndex, newIndex) => {
                          const reordered = arrayMove(products, oldIndex, newIndex)
                          setProducts(reordered)
                          onUpdate({ products: reordered })
                        }}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {/* Coupon */}
            <div className="mb-6">
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="🎟️ Add Coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={!!appliedCoupon}
                  className="h-10 border-gray-300"
                  style={{ fontFamily: 'Albert Sans' }}
                />
                {!appliedCoupon ? (
                  <Button
                    onClick={handleApplyCoupon}
                    className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white px-6"
                    style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                  >
                    Apply
                  </Button>
                ) : (
                  <Button
                    onClick={handleRemoveCoupon}
                    variant="outline"
                    className="text-[#0d6efd] border-[#0d6efd] px-6"
                    style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {appliedCoupon && (
                <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
                  <CheckCircle className="h-4 w-4" />
                  <span style={{ fontFamily: 'Albert Sans' }}>
                    {appliedCoupon.coupon_code} applied! (-${couponDiscount.toFixed(2)})
                  </span>
                </div>
              )}
              <button
                onClick={() => setShowCouponList(true)}
                className="text-sm text-[#0d6efd] hover:underline flex items-center gap-1"
                style={{ fontFamily: 'Albert Sans' }}
              >
                <Tag className="h-3 w-3" />
                Browse Available Coupons ({activeCoupons.length})
              </button>
            </div>

            {/* Totals */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600" style={{ fontFamily: 'Albert Sans' }}>Subtotal</span>
                <span className="font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              {wholesaleDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600" style={{ fontFamily: 'Albert Sans' }}>
                    Wholesale Discount ({customerType.includes('Full Service') ? '15%' : '10%'})
                  </span>
                  <span className="font-medium text-green-600" style={{ fontFamily: 'Albert Sans' }}>-${wholesaleDiscount.toFixed(2)}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600" style={{ fontFamily: 'Albert Sans' }}>
                    Coupon Discount {appliedCoupon && (
                      <span className="text-xs text-gray-500">
                        ({appliedCoupon.type === 'P' ? `${appliedCoupon.coupon_discount}%` : `$${appliedCoupon.coupon_discount}`})
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-green-600" style={{ fontFamily: 'Albert Sans' }}>-${couponDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600" style={{ fontFamily: 'Albert Sans' }}>Delivery Fee</span>
                <span className="font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                  ${deliveryFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600" style={{ fontFamily: 'Albert Sans' }}>GST (10%)</span>
                <span className="font-medium text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                  ${gst.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span className="text-gray-900" style={{ fontFamily: 'Albert Sans' }}>Total</span>
                <span className="text-[#0d6efd]" style={{ fontFamily: 'Albert Sans' }}>${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Order Comments */}
            <div className="mb-6">
              <ValidatedTextarea
                label="✏️ Order Comments"
                placeholder="Any special notes"
                value={orderComments}
                validationRule={ValidationRules.order.order_comments}
                fieldName="Order Comments"
                onChange={(value) => {
                  setOrderComments(value)
                  onUpdate({ order_comments: value, delivery_method: deliveryMethod })
                }}
                rows={3}
                className="border-gray-300 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleSaveQuote}
                variant="outline"
                className="w-full border-[#0d6efd] text-[#0d6efd] hover:bg-[#0d6efd] hover:text-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600, height: '50px' }}
              >
                💾 Save Quote
              </Button>
              <Button
                onClick={handleSendToCustomer}
                className="w-full bg-[#0d6efd] hover:bg-[#0b5ed7] text-white rounded-full"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600, height: '50px' }}
              >
                Send to Customer
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Coupons List Modal */}
      {showCouponList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                Available Coupons
              </h3>
              <button
                onClick={() => setShowCouponList(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {activeCoupons.length === 0 ? (
                <p className="text-center text-gray-500 py-8" style={{ fontFamily: 'Albert Sans' }}>
                  No active coupons available
                </p>
              ) : (
                <div className="space-y-3">
                  {activeCoupons.map((coupon: Coupon) => (
                    <div
                      key={coupon.coupon_id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-[#0d6efd] transition-colors cursor-pointer"
                      onClick={() => handleSelectCoupon(coupon.coupon_id.toString())}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Tag className="h-4 w-4 text-[#0d6efd]" />
                            <span className="font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                              {coupon.coupon_code}
                            </span>
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                              {coupon.type === 'P'
                                ? `${coupon.coupon_discount}% OFF`
                                : `$${coupon.coupon_discount} OFF`}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectCoupon(coupon.coupon_id.toString())
                          }}
                          className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white text-xs px-3 py-1"
                          style={{ fontFamily: 'Albert Sans' }}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t">
              <Button
                onClick={() => setShowCouponList(false)}
                variant="outline"
                className="w-full border-gray-300"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Customer Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-[#0d6efd]" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Albert Sans' }}>
                Send to Customer
              </h3>
              <p className="text-sm text-gray-600" style={{ fontFamily: 'Albert Sans' }}>
                Enter Email ID to send to customer
              </p>
            </div>

            <div className="mb-6">
              <Label htmlFor="sendEmail" className="text-sm font-medium text-gray-700 mb-2">
                Email
              </Label>
              <Input
                id="sendEmail"
                type="email"
                placeholder="Johndoe@gmail.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmSend();
                  }
                }}
                className="h-11 border-gray-300"
                style={{ fontFamily: 'Albert Sans' }}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowSendModal(false)}
                variant="outline"
                className="flex-1 border-gray-300"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSend}
                className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Yes, Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Albert Sans' }}>
                Email Sent to Customer
              </h3>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

