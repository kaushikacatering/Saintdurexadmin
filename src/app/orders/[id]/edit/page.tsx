"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { CustomerStep } from "../../../quotes/new/components/CustomerStep"
import { ProductsStep } from "../../../quotes/new/components/ProductsStep"
import { DeliveryStep } from "../../new/components/DeliveryStepOrder"
import { Check, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { ordersAPI } from "@/lib/api"

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

export default function EditOrderPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const orderId = params?.id as string | undefined

  const [currentStep, setCurrentStep] = useState(1)
  const [orderData, setOrderData] = useState<OrderData>({
    products: [],
  })
  const [isDataLoaded, setIsDataLoaded] = useState(false)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)

  const steps = [
    { number: 1, label: "Select Customer" },
    { number: 2, label: "Select Products" },
    { number: 3, label: "Add Delivery Details" },
  ]

  // Validate orderId
  const isValidOrderId = orderId && !isNaN(Number(orderId)) && Number(orderId) > 0

  // Fetch existing order data
  const { data: existingOrder, isLoading, error, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId || !isValidOrderId) {
        throw new Error('Invalid order ID')
      }
      console.log('Fetching order:', orderId)
      const response = await ordersAPI.get(Number(orderId))
      console.log('Order fetched:', response.data.order)
      return response.data.order
    },
    enabled: !!isValidOrderId, // Only fetch if orderId exists and is valid
    retry: 2, // Retry twice on failure
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: true, // Always refetch on mount
  })

  // Reset data loaded state when orderId changes
  useEffect(() => {
    console.log('OrderId changed:', orderId)
    setIsDataLoaded(false)
    setOrderData({ products: [] })
    setCurrentStep(1)
  }, [orderId])

  // Handle order data loading with improved error handling
  useEffect(() => {
    if (existingOrder && !isDataLoaded) {
      console.log('Processing order data:', existingOrder)
      // Use a longer delay to ensure all data is ready and avoid race conditions
      const timer = setTimeout(() => {
        try {
          const order = existingOrder

          // Validate that we have essential data
          if (!order || !order.order_id) {
            console.error('Invalid order data:', order)
            toast.error('Invalid order data received')
            return
          }

          // Map order data to OrderData structure
          const mappedProducts = order.order_products?.map((product: any) => {
            const productQty = parseFloat(product.quantity || '0') || 1
            const basePrice = parseFloat(product.price || '0')

            // Calculate total option price for one unit of product
            // In the DB, option_quantity is typically the total quantity for the line item
            const optionsUnitTotal = product.options?.reduce((sum: number, option: any) => {
              const optPrice = parseFloat(option.option_price || '0')
              const optTotalQty = parseFloat(option.option_quantity || '0')
              // Calculate per-unit quantity: total option qty / product qty
              const optUnitQty = productQty > 0 ? optTotalQty / productQty : 0
              return sum + (optPrice * optUnitQty)
            }, 0) || 0

            const bundledUnitPrice = basePrice + optionsUnitTotal

            return {
              product_id: product.product_id,
              name: product.product_name,
              category: 'N/A',
              price: bundledUnitPrice, // Use bundled price as expected by ProductsStep
              quantity: productQty,
              comment: product.product_comment || product.comment || '',
              add_ons: product.options?.map((option: any) => {
                const optTotalQty = parseFloat(option.option_quantity || '0')
                const optUnitQty = productQty > 0 ? optTotalQty / productQty : 1
                return {
                  name: `${option.option_name}: ${option.option_value}`,
                  price: parseFloat(option.option_price || '0'),
                  quantity: optUnitQty, // Per-unit quantity
                  option_value_id: option.option_value_id,
                }
              }) || []
            }
          }) || []

          // Parse delivery_date_time string directly (format: "YYYY-MM-DD HH:MM:SS")
          // The DeliveryStep component will parse this correctly
          const deliveryDateTimeStr = order.delivery_date_time || null

          const mappedOrderData: OrderData = {
            company_id: order.company_id,
            department_id: order.department_id,
            customer_id: order.customer_id,
            customer_name: order.customer_order_name || `${order.firstname || ''} ${order.lastname || ''}`.trim(),
            customer_type: order.customer_type || undefined,
            phone: order.customer_order_telephone || order.telephone,
            email: order.customer_order_email || order.email,
            location: order.location_name,
            location_id: order.location_id,
            products: mappedProducts,
            delivery_date_time: deliveryDateTimeStr, // Pass raw string to DeliveryStep component
            delivery_address: order.delivery_address || '',
            delivery_fee: parseFloat(order.delivery_fee || 0),
            coupon_code: order.coupon_code || '',
            coupon_type: order.coupon_type || undefined,
            coupon_discount: order.coupon_discount ? parseFloat(order.coupon_discount.toString()) : (order.coupon_id ? 0 : undefined),
            order_comments: order.order_comments || '',
            account_email: order.account_email || '',
            cost_center: order.cost_center || '',
            delivery_contact: order.delivery_contact || '',
            delivery_details: order.delivery_details || '',
            delivery_method: order.delivery_method || 'pickup',
          }

          console.log('Setting order data:', mappedOrderData)
          console.log('Delivery fields being set:', {
            delivery_date_time: mappedOrderData.delivery_date_time,
            delivery_address: mappedOrderData.delivery_address,
            delivery_method: mappedOrderData.delivery_method,
            delivery_contact: mappedOrderData.delivery_contact,
            delivery_details: mappedOrderData.delivery_details,
            account_email: mappedOrderData.account_email,
            cost_center: mappedOrderData.cost_center,
          })
          setOrderData(mappedOrderData)
          setIsDataLoaded(true)
          console.log('Order data loaded successfully')
        } catch (err) {
          console.error('Error processing order data:', err)
          toast.error('Failed to process order data')
        }
      }, 200) // Increased delay to ensure data is fully ready

      return () => clearTimeout(timer)
    }
  }, [existingOrder, isDataLoaded])

  // Handle error with retry option
  useEffect(() => {
    if (error) {
      console.error("Error fetching order:", error)
      // Don't redirect immediately, allow user to retry
      toast.error("Failed to load order details. Please try again.", {
        action: {
          label: "Retry",
          onClick: () => {
            if (orderId && isValidOrderId) {
              refetch()
            }
          }
        }
      })
    }
  }, [error, router, orderId, isValidOrderId, refetch])

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

  const handleUpdateOrder = async (latestData?: Partial<OrderData>) => {
    try {
      // Use latestData if provided (from DeliveryStep), otherwise use orderData state
      // This ensures we have the latest delivery data even if state hasn't updated yet
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

      // Build delivery_date_time: allow date-only (with default time) or date+time
      let deliveryDateTime: string | null = null;
      if (dataToUse.delivery_date_time) {
        // Use delivery_date_time if already provided
        deliveryDateTime = dataToUse.delivery_date_time;
      } else if (dataToUse.delivery_date) {
        if (dataToUse.delivery_time) {
          // Both date and time provided
          deliveryDateTime = `${dataToUse.delivery_date} ${dataToUse.delivery_time}:00`;
        } else {
          // Only date provided, use default time (start of day)
          deliveryDateTime = `${dataToUse.delivery_date} 00:00:00`;
        }
      }

      // Transform data to match backend API format
      const orderPayload: any = {
        customer_id: dataToUse.customer_id,
        location_id: dataToUse.location_id,
        delivery_date: dataToUse.delivery_date || null,
        delivery_time: dataToUse.delivery_time || null,
        delivery_date_time: deliveryDateTime,
        delivery_fee: parseFloat((dataToUse.delivery_fee || 0).toString()),
        order_comments: dataToUse.order_comments || null,
        coupon_code: dataToUse.coupon_code || null,
        delivery_address: dataToUse.delivery_address || null,
        delivery_method: dataToUse.delivery_method || null,
        account_email: dataToUse.account_email || null,
        cost_center: dataToUse.cost_center || null,
        delivery_contact: dataToUse.delivery_contact || null,
        delivery_details: dataToUse.delivery_details || null,
        products: dataToUse.products.map(product => ({
          product_id: product.product_id,
          quantity: product.quantity,
          price: product.price,
          comment: product.comment || null,
          add_ons: (product.add_ons || []).map(addon => ({
            ...addon,
            option_quantity: addon.quantity || (addon as any).option_quantity || 1,
          }))
        }))
      }

      console.log("Updating order:", orderPayload)
      console.log("Coupon data in update:", {
        coupon_code: orderPayload.coupon_code,
        coupon_type: orderData.coupon_type,
        coupon_discount: orderData.coupon_discount
      })

      const response = await ordersAPI.update(Number(orderId), orderPayload)

      if (response.data) {
        // Invalidate orders queries to refresh the list
        queryClient.invalidateQueries({ queryKey: ['orders'] })
        queryClient.invalidateQueries({ queryKey: ['order', orderId] })
        toast.success("Order updated successfully!")
        router.push("/orders?tab=future")
      }
    } catch (error: any) {
      console.error("Error updating order:", error)
      toast.error(error.response?.data?.message || "Failed to update order")
    }
  }

  // Show error if orderId is invalid
  if (!isValidOrderId) {
    return (
      <div className="flex items-center justify-center bg-gray-50 min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-2" style={{ fontFamily: 'Albert Sans' }}>
            Invalid Order ID
          </p>
          {orderId && (
            <p className="text-sm text-gray-500 mb-4" style={{ fontFamily: 'Albert Sans' }}>
              Order ID: {orderId}
            </p>
          )}
          <button
            onClick={() => router.push('/orders')}
            className="mt-4 px-4 py-2 bg-[#0d6efd] text-white rounded-lg hover:bg-[#0b5ed7] transition-colors"
            style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
          >
            Go Back to Orders
          </button>
        </div>
      </div>
    )
  }

  // Show loading state with spinner
  if (isLoading || !isDataLoaded) {
    return (
      <div className="flex items-center justify-center bg-gray-50 min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0d6efd] mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2" style={{ fontFamily: 'Albert Sans' }}>
            Loading order data...
          </p>
          {orderId && (
            <p className="text-sm text-gray-500" style={{ fontFamily: 'Albert Sans' }}>
              Order ID: {orderId}
            </p>
          )}
          {error && (
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 bg-[#0d6efd] text-white rounded-lg hover:bg-[#0b5ed7] transition-colors"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 " style={{ fontFamily: 'Albert Sans' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/orders')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900" style={{ fontWeight: 700 }}>
              Edit Order #{orderId}
            </h1>
            <p className="text-gray-600 mt-1">
              {currentStep === 1 && "Update Customer Details"}
              {currentStep === 2 && `Update products for ${orderData.customer_name || "customer"}`}
              {currentStep === 3 && `Update Delivery details for ${orderData.customer_name || "customer"}`}
            </p>
          </div>
        </div>
        {currentStep === 1 && (
          <Button
            onClick={() => setShowAddCustomerModal(true)}
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2 rounded-lg"
            style={{ fontWeight: 600 }}
          >
            <span className="text-lg">+</span>
            Add Customer
          </Button>
        )}
        {currentStep === 2 && (
          <Button
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2 rounded-lg"
            style={{ fontWeight: 600 }}
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
      {currentStep === 1 && isDataLoaded && (
        <CustomerStep
          data={orderData}
          onUpdate={updateOrderData}
          onNext={handleNext}
          showAddCustomerModal={showAddCustomerModal}
          onCloseAddCustomerModal={() => setShowAddCustomerModal(false)}
        />
      )}
      {currentStep === 1 && !isDataLoaded && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600" style={{ fontFamily: 'Albert Sans' }}>Loading customer data...</p>
        </div>
      )}
      {currentStep === 2 && (
        <ProductsStep
          data={orderData}
          onUpdate={updateOrderData}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}
      {currentStep === 3 && isDataLoaded && (
        <DeliveryStep
          key={`delivery-step-${orderId}-${isDataLoaded}`}
          data={orderData}
          onUpdate={updateOrderData}
          onSave={handleUpdateOrder}
          onBack={handleBack}
        />
      )}
    </div>
  )
}

