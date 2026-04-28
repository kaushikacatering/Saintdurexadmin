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
import { OrderData } from "../page"
import api from "@/lib/api"
import { locationsAPI, companiesAPI } from "@/lib/api"
import { toast } from "sonner"
import { formatAustralianPhone, cleanPhoneNumber, getPhonePlaceholder, getPhoneValidationError } from "@/lib/phone-mask"

interface DeliveryStepProps {
  data: OrderData
  onUpdate: (data: Partial<OrderData>) => void
  onSave: (data?: Partial<OrderData>, sendToEmail?: string) => void
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
  product: OrderData['products'][0]
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

  // Parse delivery_details
  const parseDeliveryDetails = (details: string | undefined) => {
    if (!details) return ""
    return details
  }

  // Parse delivery_date_time to extract date and time
  const parseDeliveryDateTime = (dateTime: string | undefined) => {
    if (!dateTime) return { date: "", time: "" }
    try {
      if (dateTime.includes('T')) {
        const dateObj = new Date(dateTime)
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear()
          const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
          const day = dateObj.getDate().toString().padStart(2, '0')
          const date = `${year}-${month}-${day}`
          const hours = dateObj.getHours().toString().padStart(2, '0')
          const minutes = dateObj.getMinutes().toString().padStart(2, '0')
          const time = `${hours}:${minutes}`
          return { date, time }
        }
      }
      const parts = dateTime.split(' ')
      if (parts.length >= 2) {
        const date = parts[0] || ""
        const time = parts[1] ? parts[1].substring(0, 5) : ""
        return { date, time }
      }
      if (dateTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { date: dateTime, time: "" }
      }
    } catch (error) {
      console.error('Error parsing delivery_date_time:', error, dateTime)
    }
    return { date: "", time: "" }
  }

  const initialDeliveryContact = parseDeliveryContact(data.delivery_contact)
  const initialDeliveryDateTime = parseDeliveryDateTime(data.delivery_date_time)
  
  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDateTime.date || "")
  const [deliveryTime, setDeliveryTime] = useState(data.delivery_time || initialDeliveryDateTime.time || "")
  const [accountEmail, setAccountEmail] = useState(data.account_email || "")
  const [costCenter, setCostCenter] = useState(data.cost_center || "")
  const [deliveryContactName, setDeliveryContactName] = useState(initialDeliveryContact.name)
  const [deliveryContactNumber, setDeliveryContactNumber] = useState(initialDeliveryContact.number)
  const [deliveryNotes, setDeliveryNotes] = useState(parseDeliveryDetails(data.delivery_details))
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(data.delivery_method || "delivery")
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<number>(data.location_id || 0)
  const [selectedLocation, setSelectedLocation] = useState<number>(data.location_id || 0)
  const [deliveryAddress, setDeliveryAddress] = useState(data.delivery_address || data.customer_address || "")
  const [deliveryFee, setDeliveryFee] = useState(data.delivery_fee || 0)
  const [couponCode, setCouponCode] = useState(data.coupon_code || "")
  const [orderComments, setOrderComments] = useState(data.order_comments || "")
  const [standingOrder, setStandingOrder] = useState<number>(data.standing_order || 0)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [sendEmail, setSendEmail] = useState(data.email || "")
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [showCouponList, setShowCouponList] = useState(false)

  // Fetch active coupons
  const { data: couponsData } = useQuery({
    queryKey: ['coupons-active'],
    queryFn: async () => {
      const response = await api.get('/admin/coupons?status=1&limit=100')
      return response.data
    }
  })

  // Fetch locations
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
      if (!data.company_id) return null
      try {
        const response = await companiesAPI.get(data.company_id)
        return response.data
      } catch {
        return null
      }
    },
    enabled: !!data.company_id
  })

  // Fetch department details
  const { data: departmentData } = useQuery({
    queryKey: ['department', data.company_id, data.department_id],
    queryFn: async () => {
      if (!data.company_id || !data.department_id) return null
      try {
        const response = await companiesAPI.getDepartments(data.company_id)
        const dept = response.data?.departments?.find((d: any) => d.department_id === data.department_id)
        return dept ? { department: dept } : null
      } catch {
        return null
      }
    },
    enabled: !!data.department_id && !!data.company_id
  })

  const activeCoupons = couponsData?.coupons || []
  const locations = locationsData?.locations || []
  const companyName = companyData?.company?.company_name || ''
  const departmentName = departmentData?.department?.department_name || ''

  // Sync state with data
  useEffect(() => {
    if (data.products) setProducts(data.products)
    if (data.delivery_date_time) {
      const parsed = parseDeliveryDateTime(data.delivery_date_time)
      setDeliveryDate(parsed.date || "")
      setDeliveryTime(parsed.time || "")
    }
    if (data.location_id !== undefined) {
      setSelectedPickupLocation(data.location_id || 0)
      setSelectedLocation(data.location_id || 0)
    }
  }, [data])

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
  let couponDiscount = 0
  if (appliedCoupon) {
    if (appliedCoupon.type === 'P') {
      couponDiscount = subtotal * (Number(appliedCoupon.coupon_discount) / 100)
    } else {
      couponDiscount = Number(appliedCoupon.coupon_discount)
    }
    couponDiscount = Math.min(couponDiscount, subtotal)
  }

  const afterDiscount = subtotal - couponDiscount
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

  const gst = taxableSubtotal * 0.1
  const total = afterDiscount + deliveryFee

  const handleApplyCoupon = () => {
    const coupon = activeCoupons.find((c: Coupon) => c.coupon_code.toLowerCase() === couponCode.toLowerCase())
    if (coupon) {
      setAppliedCoupon(coupon)
      toast.success(`Coupon applied!`)
    } else {
      toast.error("Invalid coupon")
    }
  }

  const handleSelectCoupon = (couponId: string) => {
    const coupon = activeCoupons.find((c: Coupon) => c.coupon_id === Number(couponId))
    if (coupon) {
      setCouponCode(coupon.coupon_code)
      setAppliedCoupon(coupon)
      setShowCouponList(false)
      toast.success(`Coupon applied!`)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode("")
  }

  const handleSaveOrder = async () => {
    if (deliveryMethod === 'pickup' && selectedPickupLocation === 0) {
      toast.error("Please select a pickup location")
      return
    }
    if (deliveryMethod === 'delivery' && !deliveryAddress?.trim()) {
      toast.error("Please enter a delivery address")
      return
    }

    setIsSaving(true)
    try {
      const deliveryContact = deliveryContactName 
        ? `${deliveryContactName}${deliveryContactNumber ? `|${deliveryContactNumber}` : ''}`
        : ''

      const dateTime = deliveryDate && deliveryTime ? `${deliveryDate} ${deliveryTime}:00` : undefined

      const updateData: Partial<OrderData> = {
        delivery_date: deliveryDate || undefined,
        delivery_time: deliveryTime || undefined,
        delivery_date_time: dateTime,
        account_email: accountEmail,
        cost_center: costCenter,
        delivery_contact: deliveryContact,
        delivery_details: deliveryNotes,
        delivery_method: deliveryMethod,
        delivery_address: deliveryMethod === 'pickup' 
          ? locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address 
          : deliveryAddress,
        delivery_fee: deliveryFee,
        coupon_code: appliedCoupon?.coupon_code,
        coupon_type: appliedCoupon?.type,
        coupon_discount: appliedCoupon?.coupon_discount,
        order_comments: orderComments,
        standing_order: standingOrder,
        location_id: selectedLocation || (deliveryMethod === 'pickup' ? selectedPickupLocation : undefined),
      }

      onUpdate(updateData)
      await onSave(updateData)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendToCustomer = () => {
    setShowSendModal(true)
  }

  const handleConfirmSend = async () => {
    if (!sendEmail.trim()) {
      toast.error("Please enter a valid email address")
      return
    }

    setIsSaving(true)
    try {
      const deliveryContact = deliveryContactName 
        ? `${deliveryContactName}${deliveryContactNumber ? `|${deliveryContactNumber}` : ''}`
        : ''

      const finalDeliveryAddress = deliveryMethod === 'pickup' && selectedPickupLocation > 0
        ? locations.find((l: Location) => l.location_id === selectedPickupLocation)?.pickup_address || ''
        : deliveryAddress

      const dateTime = deliveryDate && deliveryTime ? `${deliveryDate} ${deliveryTime}:00` : undefined
      
      const updateData: any = {
        delivery_date: deliveryDate || undefined,
        delivery_time: deliveryTime || undefined,
        delivery_date_time: dateTime,
        account_email: accountEmail,
        cost_center: costCenter,
        delivery_contact: deliveryContact,
        delivery_details: deliveryNotes,
        delivery_method: deliveryMethod,
        delivery_address: finalDeliveryAddress,
        delivery_fee: deliveryFee || 0,
        coupon_code: appliedCoupon?.coupon_code,
        coupon_type: appliedCoupon?.type,
        coupon_discount: appliedCoupon?.coupon_discount,
        order_comments: orderComments,
        standing_order: standingOrder,
        location_id: selectedLocation || (deliveryMethod === 'pickup' ? selectedPickupLocation : undefined),
      }

      // Hide send modal and show success modal
      setShowSendModal(false)
      setShowSuccessModal(true)

      // Short delay for the success modal before final save
      setTimeout(async () => {
        setShowSuccessModal(false)
        await onSave(updateData, sendEmail.trim())
      }, 1500)

    } catch (error) {
      console.error("Error in handleConfirmSend:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-8 bg-white border-gray-200">
            <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
              <ChevronLeft className="h-5 w-5" />
              <span className="font-semibold" style={{ fontFamily: 'Albert Sans' }}>Back</span>
            </button>

            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans' }}>
                Ordering for <span className="text-[#0d6efd]">{data.customer_name || "Guest"}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2"><span className="text-gray-600">📞 Phone:</span> <span className="text-gray-900">{data.phone || 'N/A'}</span></div>
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-600" /> <span className="text-gray-900">{data.email || 'N/A'}</span></div>
                <div className="flex items-center gap-2"><span className="text-gray-600">🏢 Company:</span> <span className="text-gray-900">{companyName || 'N/A'}</span></div>
                {departmentName && <div className="flex items-center gap-2"><span className="text-gray-600">🏛️ Dept:</span> <span className="text-gray-900">{departmentName}</span></div>}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-6" style={{ fontFamily: 'Albert Sans' }}>Enter Delivery Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Delivery Date</Label>
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-11 border-gray-300" />
              </div> */}
              {/* <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Delivery Time</Label>
                <Input type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className="h-11 border-gray-300" />
              </div> */}
              
              {/* <ValidatedInput label="Contact Name" value={deliveryContactName} onChange={(val) => setDeliveryContactName(val)} className="h-11 border-gray-300" />
              <ValidatedInput label="Contact Number" value={deliveryContactNumber} onChange={(val) => setDeliveryContactNumber(val)} className="h-11 border-gray-300" /> */}
              
              <ValidatedInput label="Email" value={accountEmail} onChange={(val) => setAccountEmail(val)} className="h-11 border-gray-300" />
              <ValidatedInput label="Cost Center" value={costCenter} onChange={(val) => setCostCenter(val)} className="h-11 border-gray-300" />
              
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium text-gray-700">Location *</Label>
                <select 
                  value={selectedLocation} 
                  onChange={(e) => setSelectedLocation(Number(e.target.value))}
                  className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value={0}>Select Location</option>
                  {locations.map((l: any) => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-medium text-gray-700">Delivery Method *</Label>
                <div className="flex gap-6 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={deliveryMethod === 'delivery'} onChange={() => setDeliveryMethod('delivery')} className="w-4 h-4 text-[#0d6efd]" />
                    <span className="text-sm">Delivery</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={deliveryMethod === 'pickup'} onChange={() => setDeliveryMethod('pickup')} className="w-4 h-4 text-[#0d6efd]" />
                    <span className="text-sm">Pickup</span>
                  </label>
                </div>
              </div>

              {deliveryMethod === 'pickup' ? (
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium text-gray-700">Pickup Location *</Label>
                  <select 
                    value={selectedPickupLocation} 
                    onChange={(e) => setSelectedPickupLocation(Number(e.target.value))}
                    className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value={0}>Select Pickup Location</option>
                    {locations.map((l: any) => <option key={l.location_id} value={l.location_id}>{l.location_name} - {l.pickup_address}</option>)}
                  </select>
                </div>
              ) : (
                <ValidatedTextarea label="Delivery Address *" value={deliveryAddress} onChange={(val) => setDeliveryAddress(val)} className="md:col-span-2" rows={3} />
              )}

              <ValidatedInput label="Delivery Fee" type="number" value={deliveryFee.toString()} onChange={(val) => setDeliveryFee(Number(val) || 0)} />
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Standing Order</Label>
                <select value={standingOrder} onChange={(e) => setStandingOrder(Number(e.target.value))} className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                  <option value={0}>One-time Order</option>
                  <option value={7}>Weekly</option>
                  <option value={14}>Bi-weekly</option>
                  <option value={30}>Monthly</option>
                </select>
              </div>

              <ValidatedTextarea label="Notes" value={deliveryNotes} onChange={(val) => setDeliveryNotes(val)} className="md:col-span-2" rows={3} />
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-6 bg-white border-gray-200 sticky top-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans' }}>Order Summary</h3>
            
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={products.map((_, i) => `product-${i}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4 mb-6">
                  {products.map((product, index) => (
                    <SortableProductItem key={`product-${index}`} product={product} index={index} onReorder={() => {}} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mb-6">
              <div className="flex gap-2 mb-2">
                <Input placeholder="Coupon Code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={!!appliedCoupon} />
                {!appliedCoupon ? <Button onClick={handleApplyCoupon} className="bg-[#0d6efd] text-white">Apply</Button> : <Button onClick={handleRemoveCoupon} variant="outline">X</Button>}
              </div>
              <button onClick={() => setShowCouponList(true)} className="text-sm text-[#0d6efd] hover:underline">Browse Coupons ({activeCoupons.length})</button>
            </div>

            <div className="space-y-2 mb-6 border-t pt-4">
              <div className="flex justify-between text-sm"><span>Subtotal</span> <span className="font-medium font-gray-900">${subtotal.toFixed(2)}</span></div>
              {couponDiscount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span> <span>-${couponDiscount.toFixed(2)}</span></div>}
              <div className="flex justify-between text-sm"><span>Delivery Fee</span> <span className="font-medium font-gray-900">${deliveryFee.toFixed(2)}</span></div>
              {gst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600" style={{ fontFamily: 'Albert Sans' }}>GST (10%)</span>
                  <span className="font-medium font-gray-900" style={{ fontFamily: 'Albert Sans' }}>${gst.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2 text-[#0d6efd]"><span>Total</span> <span>${total.toFixed(2)}</span></div>
            </div>

            <ValidatedTextarea label="Order Comments" value={orderComments} onChange={(val) => setOrderComments(val)} rows={3} className="mb-6" />

            <div className="space-y-3">
              <Button onClick={handleSaveOrder} disabled={isSaving} variant="outline" className="w-full border-[#0d6efd] text-[#0d6efd]">
                {isSaving ? "Saving..." : "💾 Save Order"}
              </Button>
              <Button onClick={handleSendToCustomer} disabled={isSaving} className="w-full bg-[#0d6efd] text-white">
                {isSaving ? "Processing..." : "Send to Customer"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Coupon List Modal */}
      {showCouponList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Available Coupons</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {activeCoupons.map((c: any) => (
                <div key={c.coupon_id} className="p-3 border rounded hover:border-[#0d6efd] cursor-pointer" onClick={() => handleSelectCoupon(c.coupon_id)}>
                  <div className="flex justify-between font-bold"><span>{c.coupon_code}</span> <span className="text-green-600">{c.type === 'P' ? `${c.coupon_discount}%` : `$${c.coupon_discount}`} OFF</span></div>
                </div>
              ))}
            </div>
            <Button onClick={() => setShowCouponList(false)} variant="outline" className="w-full">Close</Button>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Send to Customer</h3>
            <Input 
              type="email" 
              placeholder="Customer Email" 
              value={sendEmail} 
              onChange={(e) => setSendEmail(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmSend();
                }
              }}
              className="mb-6" 
            />
            <div className="flex gap-4">
              <Button onClick={() => setShowSendModal(false)} disabled={isSaving} variant="outline" className="flex-1">Cancel</Button>
              <Button onClick={handleConfirmSend} disabled={isSaving} className="flex-1 bg-[#0d6efd] text-white">
                {isSaving ? "Sending..." : "Send"}
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