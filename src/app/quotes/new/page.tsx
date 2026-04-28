"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { CustomerStep } from "./components/CustomerStep"
import { ProductsStep } from "./components/ProductsStep"
import { DeliveryStep } from "./components/DeliveryStep"
import { Check } from "lucide-react"
import { toast } from "sonner"
import api from "@/lib/api"

const SESSION_KEY = "new_quote_draft"

export interface QuoteData {
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
}

export default function NewQuotePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState(1)
  const [quoteData, setQuoteData] = useState<QuoteData>({
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
        if (data) setQuoteData(data)
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

  const updateQuoteData = (data: Partial<QuoteData>) => {
    setQuoteData((prev) => ({ ...prev, ...data }))
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

  const handleSaveQuote = async (latestData?: Partial<QuoteData>, sendToEmail?: string) => {
    try {
      // Use latestData if provided (from DeliveryStep), otherwise use quoteData state
      // This ensures we have the latest coupon data even if state hasn't updated yet
      const dataToUse = latestData ? { ...quoteData, ...latestData } : quoteData

      // Transform products to use base_price for backend calculation
      // Backend will apply additional customer-specific discounts
      const transformedProducts = dataToUse.products?.map(product => ({
        ...product,
        price: (product as any).base_price || product.price, // Use base_price if available, otherwise use price
        add_ons: product.add_ons?.map(addon => ({
          ...addon,
          price: (addon as any).base_price || addon.price, // Use base_price if available
          option_quantity: addon.quantity || 1, // Map frontend 'quantity' to backend 'option_quantity'
        })) || []
      })) || []

      // Calculate totals for payload
      const productsList = dataToUse.products || [];
      const subtotal = productsList.reduce((sum, item) => {
        const itemTotal = item.price * item.quantity;
        const addOnsTotal = item.add_ons?.reduce((addOnSum, addOn) => addOnSum + (addOn.price * addOn.quantity), 0) || 0;
        return sum + itemTotal + addOnsTotal;
      }, 0);

      const deliveryFee = Number(dataToUse.delivery_fee || 0);

      // Calculate coupon discount
      let couponDiscount = 0;
      if (dataToUse.coupon_code && dataToUse.coupon_discount) {
        if (dataToUse.coupon_type === 'P') {
          couponDiscount = subtotal * (dataToUse.coupon_discount / 100);
        } else {
          couponDiscount = dataToUse.coupon_discount;
        }
        couponDiscount = Math.min(couponDiscount, subtotal);
      }

      const taxableSubtotal = (dataToUse.products || []).reduce((sum, item) => {
        const cat = (item.category || '').toUpperCase();
        if (cat === 'ANCILLARIES' || cat === 'PACKAGING') {
          const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
          const addOnsTotal = (item.add_ons || []).reduce((addOnSum, addOn) => 
            addOnSum + (Number(addOn.price || 0) * Number(addOn.quantity || 0)), 0);
          return sum + itemTotal + addOnsTotal;
        }
        return sum;
      }, 0);

      const gst = taxableSubtotal * 0.1;
      const taxableAmount = Math.max(subtotal - couponDiscount, 0);
      const orderTotal = taxableAmount + deliveryFee;

      const quotePayload = {
        ...dataToUse,
        products: transformedProducts,
        order_total: orderTotal,
        subtotal: subtotal,
        gst: gst,
        total_discount: couponDiscount
      }

      // API call to save quote
      console.log("Saving quote:", quotePayload)
      console.log("Coupon data:", {
        coupon_code: quotePayload.coupon_code,
        coupon_type: quotePayload.coupon_type,
        coupon_discount: quotePayload.coupon_discount
      })

      const response = await api.post("/admin/quotes", quotePayload)

      if (response.data) {
        // Send email via the working /send-email API endpoint
        try {
          console.log("Quote creation response:", JSON.stringify(response.data))
          // Backend returns order_id (same field used everywhere else in the app)
          const quoteId = response.data.order_id
            || response.data.quote_id
            || response.data.id
            || response.data.quote?.order_id
            || response.data.quote?.id
            || (response.data.quote_url ? response.data.quote_url.split('/').pop() : null)

          // Use sendToEmail override (from Send to Customer modal) first, then fall back to quote data
          const recipientEmail = sendToEmail || quotePayload.account_email || quotePayload.email || quoteData.email || quoteData.account_email;

          console.log("Quote ID:", quoteId, "| Recipient:", recipientEmail)

          if (quoteId && recipientEmail) {
            const emailResponse = await api.post(`/admin/quotes/${quoteId}/send-email`, {
              recipient_email: recipientEmail,
              custom_message: ""
            })

            if (emailResponse.data.success && emailResponse.data.email_sent !== false) {
              toast.success("Confirmation email sent", {
                description: `Sent to: ${emailResponse.data.sent_to || recipientEmail}`
              })
            } else if (emailResponse.data.success && emailResponse.data.email_sent === false) {
              toast.warning("Quote saved, but email could not be sent. Please check SMTP configuration.", {
                description: emailResponse.data.email_error || emailResponse.data.message,
                duration: 8000,
              })
            } else {
              toast.warning("Quote saved. Email delivery status unknown.")
            }
          }
        } catch (emailError) {
          console.error("Failed to send quote email:", emailError)
          // Don't block success flow
        }

        // Clear any saved draft on successful quote save
        try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
        // Invalidate quotes query cache to refresh the list
        queryClient.invalidateQueries({ queryKey: ["quotes"] })
        toast.success("Quote saved successfully!")
        router.push("/quotes")
      }
    } catch (error: any) {
      console.error("Error saving quote:", error)
      toast.error(error.response?.data?.message || "Failed to save quote")
    }
  }

  return (
    <div className="bg-gray-50 " style={{ fontFamily: 'Albert Sans' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontWeight: 700 }}>
            Place Quote
          </h1>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 && "Select Customer"}
            {currentStep === 2 && `Select products for ${quoteData.customer_name || "John Doe"}`}
            {currentStep === 3 && `Add Delivery details & send to ${quoteData.customer_name || "customer"}`}
          </p>
        </div>
        {currentStep === 2 && (
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2 rounded-lg"
            style={{ fontWeight: 600 }}
            onClick={() => {
              // Save current step + quote data so we can restore after returning
              try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step: currentStep, data: quoteData }))
              } catch { /* ignore */ }
              router.push('/admin/products?returnUrl=/quotes/new&addProduct=true')
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
          data={quoteData}
          onUpdate={updateQuoteData}
          onNext={handleNext}
          showAddCustomerModal={showAddCustomerModal}
          onCloseAddCustomerModal={() => setShowAddCustomerModal(false)}
          onOpenAddCustomerModal={() => setShowAddCustomerModal(true)}
        />
      )}
      {currentStep === 2 && (
        <ProductsStep
          data={quoteData}
          onUpdate={updateQuoteData}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}
      {currentStep === 3 && (
        <DeliveryStep
          data={quoteData}
          onUpdate={updateQuoteData}
          onSave={handleSaveQuote}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

