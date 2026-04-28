"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { CustomerStep } from "../../quotes/new/components/CustomerStep"
import { ProductsStep } from "../../quotes/new/components/ProductsStep"
import { DeliveryStep } from "./components/DeliveryStepOrder"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { ordersAPI } from "@/lib/api"

const SESSION_KEY = "new_order_draft"

export interface OrderData {
  // Customer Details
  company_id?: number
  department_id?: number
  customer_id?: number
  customer_name?: string
  customer_type?: string
  phone?: string
  email?: string
  location?: string
  location_id?: number
  customer_address?: string

  // Products
  products: Array<{
    product_id: number
    name: string
    category: string
    price: number
    quantity: number
    comment?: string
    add_ons?: Array<{
      name: string
      price: number
      quantity: number
      product_option_id?: number
      option_value_id?: number
      option_name?: string
      option_value?: string
      option_price?: number
    }>
  }>

  // Delivery Details
  delivery_date?: string
  delivery_time?: string
  delivery_date_time?: string
  account_email?: string
  cost_center?: string
  delivery_contact?: string
  delivery_details?: string
  delivery_method?: "delivery" | "pickup"
  delivery_address?: string
  delivery_fee?: number
  coupon_code?: string
  coupon_type?: 'P' | 'F'
  coupon_discount?: number
  order_comments?: string
  standing_order?: number // 0 = one-time order, 7 = weekly, 14 = bi-weekly, 30 = monthly
}

export default function NewOrderPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState(1)
  const [orderData, setOrderData] = useState<OrderData>({
    products: [],
  })
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)

  // Restore draft state if returning from /admin/products
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const { step, data } = JSON.parse(saved)
        if (step) setCurrentStep(step)
        if (data) setOrderData(data)
        sessionStorage.removeItem(SESSION_KEY)
        // Invalidate product cache so newly added product appears immediately
        queryClient.invalidateQueries({ queryKey: ['products-for-quote'] })
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const steps = [
    { number: 1, label: "Select Customer" },
    { number: 2, label: "Select Products" },
    { number: 3, label: "Add Delivery Details" },
  ]

  const updateOrderData = (data: Partial<OrderData>) => {
    setOrderData((prev) => ({ ...prev, ...data }))
  }

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSaveOrder = async (latestData?: Partial<OrderData>, sendToEmail?: string) => {
    try {
      // Use latestData if provided (from DeliveryStep), otherwise use orderData state
      // This ensures we have the latest coupon data even if state hasn't updated yet
      const dataToUse = latestData ? { ...orderData, ...latestData } : orderData

      // Validate required fields
      if (!dataToUse.customer_id) {
        toast.error("Please select a customer")
        return
      }

      if (!dataToUse.location_id) {
        toast.error("Please select a location")
        return
      }

      if (!dataToUse.products || dataToUse.products.length === 0) {
        toast.error("Please add at least one product")
        return
      }

      // Validate delivery address is required when delivery method is 'delivery'
      if (dataToUse.delivery_method === 'delivery' && (!dataToUse.delivery_address || dataToUse.delivery_address.trim() === '')) {
        toast.error("Delivery address is required when delivery method is 'Delivery'")
        return
      }

      // Validate pickup location is required when delivery method is 'pickup'
      if (dataToUse.delivery_method === 'pickup' && !dataToUse.location_id) {
        toast.error("Please select a pickup location")
        return
      }

      // Build delivery_date_time from delivery_date and delivery_time
      // Only set if both date and time are provided (for future orders, leave as null)
      const deliveryDateTime = dataToUse.delivery_date && dataToUse.delivery_time
        ? `${dataToUse.delivery_date} ${dataToUse.delivery_time}:00`
        : null

      // Calculate Totals for Payload & GST
      const subtotal = dataToUse.products.reduce((sum, item) => {
        const itemTotal = Number(item.price || 0) * Number(item.quantity || 0)
        const addOnsTotal = (item.add_ons || []).reduce((addOnSum, addOn) => {
          return addOnSum + (Number(addOn.price || 0) * Number(addOn.quantity || 0))
        }, 0)
        return sum + itemTotal + addOnsTotal
      }, 0)

      let wholesaleDiscount = 0
      const customerType = dataToUse.customer_type || ''
      const isWholesale = customerType && (customerType.includes('Wholesale') || customerType.includes('Wholesaler'))

      if (isWholesale) {
        const discountPercentage = customerType.includes('Full Service') ? 15 : 10
        wholesaleDiscount = subtotal * (discountPercentage / 100)
      }

      const afterWholesaleDiscount = subtotal - wholesaleDiscount

      let couponDiscount = 0
      if (dataToUse.coupon_code) {
        if (dataToUse.coupon_type === 'P' && dataToUse.coupon_discount) {
          couponDiscount = afterWholesaleDiscount * (dataToUse.coupon_discount / 100)
        } else if (dataToUse.coupon_type === 'F' && dataToUse.coupon_discount) {
          couponDiscount = dataToUse.coupon_discount
        }
        // Ensure discount doesn't exceed afterWholesaleDiscount
        couponDiscount = Math.min(couponDiscount, afterWholesaleDiscount)
      }

      const afterDiscount = afterWholesaleDiscount - couponDiscount
      const taxableSubtotal = (dataToUse.products || []).reduce((sum, item) => {
        const cat = (item.category || '').toUpperCase()
        if (cat === 'ANCILLARIES' || cat === 'PACKAGING') {
          const itemTotal = Number(item.price || 0) * Number(item.quantity || 0)
          const addOnsTotal = (item.add_ons || []).reduce((addOnSum, addOn) => 
            addOnSum + (Number(addOn.price || 0) * Number(addOn.quantity || 0)), 0)
          return sum + itemTotal + addOnsTotal
        }
        return sum
      }, 0)

      const gst = taxableSubtotal * 0.1
      const deliveryFee = parseFloat((dataToUse.delivery_fee || 0).toString())
      const total = (afterWholesaleDiscount - couponDiscount) + deliveryFee

      // Transform data to match backend API format (matching quotes structure)
      const orderPayload: any = {
        customer_id: dataToUse.customer_id,
        location_id: dataToUse.location_id,
        delivery_date: dataToUse.delivery_date || null,
        delivery_time: dataToUse.delivery_time || null, // Send time separately
        delivery_date_time: deliveryDateTime, // Combined date and time
        delivery_fee: deliveryFee,
        gst: parseFloat(gst.toFixed(2)),
        subtotal: parseFloat(subtotal.toFixed(2)),
        order_comments: dataToUse.order_comments || null,
        coupon_code: dataToUse.coupon_code || null,
        delivery_address: dataToUse.delivery_address || null,
        delivery_method: dataToUse.delivery_method || 'pickup',
        delivery_contact: dataToUse.delivery_contact || null,
        delivery_details: dataToUse.delivery_details || null,
        account_email: dataToUse.account_email || null,
        cost_center: dataToUse.cost_center || null,
        standing_order: dataToUse.standing_order || 0, // 0 = one-time order, >0 = subscription frequency in days
        products: dataToUse.products.map(product => ({
          product_id: product.product_id,
          quantity: product.quantity,
          price: (product as any).base_price || product.price, // Use base_price if available for backend discount calculation
          comment: product.comment || null,
          add_ons: (product.add_ons || []).map(addon => ({
            ...addon,
            price: (addon as any).base_price || addon.price, // Use base_price if available
            // Explicitly map option fields to ensure they are sent to backend
            option_name: addon.option_name,
            option_value: addon.option_value,
            option_price: addon.option_price,
            option_quantity: addon.quantity, // Map frontend 'quantity' to backend 'option_quantity'
            product_option_id: addon.product_option_id,
            option_value_id: addon.option_value_id
          }))
        }))
      }

      console.log("Saving order:", orderPayload)
      console.log("Coupon data:", {
        coupon_code: orderPayload.coupon_code,
        coupon_type: dataToUse.coupon_type,
        coupon_discount: dataToUse.coupon_discount
      })

      const response = await ordersAPI.create(orderPayload)

      if (response.data) {
        // Send email notification via backend API (same pattern as quotes)
        if (sendToEmail) {
          try {
            const orderId = response.data.id || response.data.order_id || response.data.order?.order_id;
            console.log("Order creation response:", JSON.stringify(response.data));
            console.log("Order ID:", orderId, "| Recipient:", sendToEmail);

            if (orderId) {
              const emailResponse = await ordersAPI.sendEmail(orderId, {
                recipient_email: sendToEmail.trim(),
                custom_message: "",
              } as any);

              if (emailResponse.data?.success !== false) {
                toast.success("Confirmation email sent", {
                  description: `Sent to: ${emailResponse.data?.sentTo || sendToEmail}`,
                });
              } else {
                toast.warning("Order saved, but email could not be sent. Please check SMTP configuration.", {
                  description: emailResponse.data?.error || emailResponse.data?.message,
                  duration: 8000,
                });
              }
            }
          } catch (emailError: any) {
            console.error("Failed to send order email:", emailError);
            // Don't block success flow
          }
        }

        // Clear any saved draft on successful order creation
        try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
        // Invalidate orders queries to refresh the list
        queryClient.invalidateQueries({ queryKey: ['orders'] })
        toast.success("Order created successfully!")
        router.push("/orders?tab=future")
      }
    } catch (error: any) {
      console.error("Error saving order:", error)
      toast.error(error.response?.data?.message || "Failed to create order")
    }
  }

  return (
    <div className="bg-gray-50 " style={{ fontFamily: 'Albert Sans' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontWeight: 700 }}>
            Place New Order
          </h1>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 && "Select Customer"}
            {currentStep === 2 && `Select products for ${orderData.customer_name || "John Doe"}`}
            {currentStep === 3 && `Add Delivery details & send`}
          </p>
        </div>
        {currentStep === 2 && (
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2 rounded-lg"
            style={{ fontWeight: 600 }}
            onClick={() => {
              // Save current step + order data so we can restore after returning
              try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step: currentStep, data: orderData }))
              } catch { /* ignore */ }
              router.push('/admin/products?returnUrl=/orders/new&addProduct=true')
            }}
          >
            <span className="text-lg">+</span>
            Add New Product
          </Button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-end gap-4 mb-8">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${currentStep === step.number
                  ? "bg-[#0d6efd] text-white"
                  : currentStep > step.number
                    ? "bg-[#0d6efd] text-white"
                    : "bg-gray-300 text-gray-600"
                  }`}
              >
                {currentStep > step.number ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span style={{ fontWeight: 600 }}>{step.number}</span>
                )}
              </div>
              <span
                className={`text-xs mt-2 whitespace-nowrap ${currentStep === step.number ? "text-[#0d6efd] font-semibold" : "text-gray-600"
                  }`}
                style={{ fontFamily: 'Albert Sans' }}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-24 h-0.5 mx-2 mt-[-20px] ${currentStep > step.number ? "bg-[#0d6efd]" : "bg-gray-300"
                  }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {currentStep === 1 && (
        <CustomerStep
          data={orderData}
          onUpdate={updateOrderData}
          onNext={handleNext}
          showAddCustomerModal={showAddCustomerModal}
          onCloseAddCustomerModal={() => setShowAddCustomerModal(false)}
          onOpenAddCustomerModal={() => setShowAddCustomerModal(true)}
        />
      )}
      {currentStep === 2 && (
        <ProductsStep
          data={orderData}
          onUpdate={updateOrderData}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}
      {currentStep === 3 && (
        <DeliveryStep
          data={orderData}
          onUpdate={updateOrderData}
          onSave={handleSaveOrder}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

