"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ChevronLeft, Download, Send, Edit, Save, X } from "lucide-react"
import { toast } from "sonner"
import api from "@/lib/api"
import { invoicesAPI } from "@/lib/api"
import Link from "next/link"

export default function SubscriptionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()
  const subscriptionId = params.id as string
  const [isEditing, setIsEditing] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)
  const [sendingInvoice, setSendingInvoice] = useState(false)

  // Fetch subscription data
  const { data: subscriptionData, isLoading, isError, error } = useQuery({
    queryKey: ["subscription", subscriptionId],
    queryFn: async () => {
      const response = await api.get(`/admin/subscriptions/${subscriptionId}`)
      return response.data.subscription
    },
    enabled: !!subscriptionId,
    retry: 1,
  })

  // Fetch all products to match categories for GST
  const { data: allProductsData } = useQuery({
    queryKey: ['all-products-for-gst'],
    queryFn: async () => {
      const response = await api.get('/admin/products-new?limit=1000&status=1')
      return response.data
    },
    staleTime: 300000, // 5 minutes
  })

  const allProducts = allProductsData?.products || []

  // Form state
  const [standingOrder, setStandingOrder] = useState(0)
  const [deliveryDateTime, setDeliveryDateTime] = useState("")
  const [orderComments, setOrderComments] = useState("")
  const [customerOrderName, setCustomerOrderName] = useState("")

  // Initialize form when data loads
  useEffect(() => {
    if (subscriptionData && !isEditing) {
      setStandingOrder(subscriptionData.standing_order || 0)
      setDeliveryDateTime(subscriptionData.delivery_date_time || "")
      setOrderComments(subscriptionData.order_comments || "")
      setCustomerOrderName(subscriptionData.customer_order_name || "")
    }
  }, [subscriptionData, isEditing])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.put(`/admin/subscriptions/${subscriptionId}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", subscriptionId] })
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      toast.success("Subscription updated successfully")
      setIsEditing(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update subscription")
    },
  })

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/admin/subscriptions/${subscriptionId}/cancel`, {
        cancel_comment: "Subscription cancelled by admin"
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", subscriptionId] })
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      toast.success("Subscription cancelled successfully")
      setShowCancelModal(false)
      router.push("/subscriptions")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to cancel subscription")
    },
  })

  // Send to customer mutation
  const sendToCustomerMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/admin/subscriptions/${subscriptionId}/send-to-customer`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", subscriptionId] })
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      toast.success("Subscription marked as sent to customer")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to mark as sent")
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      standing_order: standingOrder,
      delivery_date_time: deliveryDateTime,
      order_comments: orderComments,
      customer_order_name: customerOrderName,
    })
  }

  const handleDownloadInvoice = async () => {
    if (!subscriptionId) return

    setDownloadingInvoice(true)
    try {
      const response = await invoicesAPI.download(Number(subscriptionId))

      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const blobUrl = window.URL.createObjectURL(blob)

      // Create download link
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `invoice-${subscriptionId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl)

      toast.success("Invoice downloaded successfully")
    } catch (error: any) {
      console.error("Failed to download invoice:", error)
      toast.error("Failed to download invoice")
    } finally {
      setDownloadingInvoice(false)
    }
  }

  const handleSendInvoice = async () => {
    if (!subscriptionId) return

    setSendingInvoice(true)
    try {
      const response = await invoicesAPI.send(Number(subscriptionId))
      toast.success(response.data.email_sent ? "Invoice sent successfully" : "Invoice email prepared", {
        description: response.data.email_sent
          ? `Sent to: ${response.data.recipient}`
          : response.data.note || "Email service not configured",
      })
      // Also mark as sent to customer
      sendToCustomerMutation.mutate()
    } catch (error: any) {
      console.error("Failed to send invoice:", error)
      const errorMessage = error.response?.data?.message || error.message || "Failed to send invoice"
      toast.error(errorMessage)
    } finally {
      setSendingInvoice(false)
    }
  }

  const getFrequencyText = (days: number) => {
    if (days === 14) return "Every 2 Weeks"
    if (days === 28) return "Every 4 Weeks"
    if (days === 56) return "Every 8 Weeks"
    return `Every ${days} days`
  }


  // Format order dates in local time (when order was created)
  const formatOrderDate = (dateString: string) => {
    if (!dateString) return ""
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Format delivery dates in UTC (scheduled delivery time)
  const formatDeliveryDate = (dateString: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)

    // Format using UTC to avoid timezone conversion
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const month = months[date.getUTCMonth()]
    const day = date.getUTCDate()
    const year = date.getUTCFullYear()

    return `${month} ${day}, ${year}`
  }


  if (isLoading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center" style={{ fontFamily: 'Albert Sans' }}>
        <div className="text-center">
          <p className="text-gray-600">Loading subscription details...</p>
        </div>
      </div>
    )
  }

  if (!subscriptionData) {
    const errorMessage = isError
      ? (error as any)?.response?.data?.message || (error as any)?.message || "Failed to load subscription"
      : "Subscription not found"
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center" style={{ fontFamily: 'Albert Sans' }}>
        <div className="text-center">
          <p className="text-red-600 mb-4">{errorMessage}</p>
          <Button onClick={() => router.push("/subscriptions")}>Back to Subscriptions</Button>
        </div>
      </div>
    )
  }

  const subscription = subscriptionData
  const products = subscription.products || []

  // Helper to calculate totals client-side including options
  const calculateProductTotal = (product: any) => {
    const productTotal = Number(product.price || 0) * Number(product.quantity || 0)
    const optionsTotal = (product.options || []).reduce((sum: number, opt: any) => {
      // Backend might return option_price or price
      const price = Number(opt.option_price || opt.price || 0)
      const qty = Number(opt.option_quantity || opt.quantity || 1)
      return sum + (price * qty)
    }, 0)
    return productTotal + optionsTotal
  }

  const calculatedSubtotal = products.reduce((sum: number, p: any) => sum + calculateProductTotal(p), 0)
  const deliveryFee = parseFloat(subscription.delivery_fee || 0)
  const couponDiscount = parseFloat(subscription.coupon_discount || 0)

  // Calculate taxable amount (Subtotal - Discount)
  // Ensure we don't calculate tax on negative amount if discount > subtotal
  const taxableAmount = Math.max(0, calculatedSubtotal - couponDiscount)

  // Calculate GST only for ANCILLARIES and packages (10%)
  const ancillaryGst = products.reduce((sum: number, p: any) => {
    // Find the original product to get categories
    const originalProduct = allProducts.find((ap: any) => Number(ap.product_id) === Number(p.product_id));

    // Check categories from the original product or the order product itself
    const categories = originalProduct?.categories || p.categories || [];
    const categoryName = p.category || (p.categories && p.categories[0]?.category_name) || p.category_name || "";

    const isAncillaryOrPackage = categories.some((c: any) => {
      const name = (c.category_name || "").toUpperCase();
      return name === "ANCILLARIES" || name === "PACKAGES" || name === "PACKAGING";
    }) || categoryName.toUpperCase() === "ANCILLARIES" || categoryName.toUpperCase() === "PACKAGES" || categoryName.toUpperCase() === "PACKAGING";

    if (isAncillaryOrPackage) {
      // Calculate item total using the calculateProductTotal helper, 
      // but ensure we're applying discounts proportionally if needed,
      // here we just use the gross product total as requested in standard cases.
      const productTotal = calculateProductTotal(p);
      return sum + (productTotal * 0.1);
    }
    return sum;
  }, 0);

  // Total = (Subtotal - Discount) + Delivery (excluding GST for total display)
  const calculatedTotal = (calculatedSubtotal - couponDiscount) + deliveryFee

  return (
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Albert Sans' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="h-6 w-6 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" style={{ fontWeight: 700 }}>
              {isEditing ? "Editing Subscription Details" : "Viewing Subscription Details"}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Order #{subscription.order_id}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false)
                  // Reset form
                  setStandingOrder(subscription.standing_order || 0)
                  setDeliveryDateTime(subscription.delivery_date_time || "")
                  setOrderComments(subscription.order_comments || "")
                  setCustomerOrderName(subscription.customer_order_name || "")
                }}
                className="gap-2 border-gray-300 bg-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="gap-2 border-gray-300 bg-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadInvoice}
                disabled={downloadingInvoice}
                className="gap-2 border-gray-300 bg-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                <Download className="h-4 w-4" />
                {downloadingInvoice ? "Downloading..." : "Download Invoice"}
              </Button>
              <Button
                onClick={handleSendInvoice}
                disabled={sendingInvoice}
                className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white gap-2"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                <Send className="h-4 w-4" />
                {sendingInvoice ? "Sending..." : "Send Invoice"}
              </Button>
              {subscription.order_status !== 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowCancelModal(true)}
                  className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
                  style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
                >
                  <X className="h-4 w-4" />
                  Cancel Subscription
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Products and Totals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products Table */}
          <Card className="border border-gray-200 shadow-sm bg-white p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>No.</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Product Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Frequency</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Options</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Quantity</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Price</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-4 py-4 text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>{idx + 1}</td>
                      <td className="px-4 py-4 text-sm text-gray-900 font-medium" style={{ fontFamily: 'Albert Sans' }}>{product.product_name}</td>
                      <td className="px-4 py-4 text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                        {getFrequencyText(subscription.standing_order)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                        {product.options?.map((o: any) => {
                          const price = Number(o.option_price || o.price || 0)
                          return `${o.option_value} ${price > 0 ? `(+$${price.toFixed(2)})` : ''}`
                        }).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>{product.quantity}</td>
                      <td className="px-4 py-4 text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                        ${(calculateProductTotal(product) / (product.quantity || 1)).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 font-medium" style={{ fontFamily: 'Albert Sans' }}>${calculateProductTotal(product).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6 space-y-3 border-t border-gray-200 pt-4">
              <div className="flex justify-end gap-32">
                <span className="text-sm text-gray-700 font-medium" style={{ fontFamily: 'Albert Sans' }}>Sub Total</span>
                <span className="text-sm text-gray-900 font-medium" style={{ fontFamily: 'Albert Sans' }}>
                  ${calculatedSubtotal.toFixed(2)}
                </span>
              </div>

              {couponDiscount > 0 && (
                <div className="flex justify-end gap-32">
                  <div className="flex flex-col items-end">
                    <span className="text-sm text-green-600 font-medium" style={{ fontFamily: 'Albert Sans' }}>Coupon Discount</span>
                    {subscription.coupon_code && (
                      <span className="text-xs text-gray-500" style={{ fontFamily: 'Albert Sans' }}>
                        {subscription.coupon_code}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-green-600 font-medium" style={{ fontFamily: 'Albert Sans' }}>
                    -${couponDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-32">
                <span className="text-sm text-gray-700 font-medium" style={{ fontFamily: 'Albert Sans' }}>Delivery Fee</span>
                <span className="text-sm text-gray-900 font-medium" style={{ fontFamily: 'Albert Sans' }}>
                  ${deliveryFee.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end gap-32">
                <span className="text-sm text-blue-600 font-semibold" style={{ fontFamily: 'Albert Sans' }}>Total </span>
                <span className="text-sm text-blue-600 font-semibold" style={{ fontFamily: 'Albert Sans' }}>
                  ${calculatedTotal.toFixed(2)}
                </span>
              </div>

              {ancillaryGst > 0 && (
                <div className="flex justify-end gap-32">
                  <span className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Albert Sans' }}>GST</span>
                  <span className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Albert Sans' }}>
                    ${ancillaryGst.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Order Comments - Editable */}
          <Card className="border border-gray-200 shadow-sm bg-white p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans' }}>
              Order Comments
            </h3>
            {isEditing ? (
              <Textarea
                value={orderComments}
                onChange={(e) => setOrderComments(e.target.value)}
                rows={4}
                className="w-full"
                style={{ fontFamily: 'Albert Sans' }}
              />
            ) : (
              <p className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                {subscription.order_comments || "No comments"}
              </p>
            )}
          </Card>
        </div>

        {/* Right Panel - Order Details and Delivery Details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Order Details */}
          <Card className="border border-gray-200 shadow-sm bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                Order Details
              </h3>
              <Link
                href={`/customers/${subscription.customer_id}`}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                style={{ fontFamily: 'Albert Sans' }}
              >
                View Customer
              </Link>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm text-gray-900" style={{ fontFamily: 'Albert Sans' }}>
                  {subscription.customer_name || subscription.customer_order_name || '-'}
                </span>
              </div>
              {subscription.customer_email && (
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    {subscription.customer_email}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                  {formatOrderDate(subscription.date_added)}
                </span>
              </div>
            </div>
            {subscription.sent_to_customer && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-green-600" style={{ fontFamily: 'Albert Sans' }}>
                  ✓ Sent to customer on {subscription.sent_to_customer_at ? formatOrderDate(subscription.sent_to_customer_at) : 'N/A'}
                </p>
              </div>
            )}
          </Card>

          {/* Delivery Details - Editable */}
          <Card className="border border-gray-200 shadow-sm bg-white p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Albert Sans' }}>
              Delivery Details
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-900 mb-1" style={{ fontFamily: 'Albert Sans' }}>
                  Frequency
                </Label>
                {isEditing ? (
                  <select
                    value={standingOrder}
                    onChange={(e) => setStandingOrder(Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd]"
                    style={{ fontFamily: 'Albert Sans' }}
                  >
                    <option value="0">One-time Order</option>
                    <option value="14">Every 2 Weeks</option>
                    <option value="28">Every 4 Weeks</option>
                    <option value="56">Every 8 Weeks</option>
                  </select>
                ) : (
                  <p className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    {getFrequencyText(subscription.standing_order)}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-900 mb-1" style={{ fontFamily: 'Albert Sans' }}>
                  Delivery start date
                </Label>
                {isEditing ? (
                  <Input
                    type="datetime-local"
                    value={deliveryDateTime ? new Date(deliveryDateTime).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setDeliveryDateTime(e.target.value)}
                    className="w-full"
                    style={{ fontFamily: 'Albert Sans' }}
                  />
                ) : (
                  <p className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    {subscription.delivery_date_time ? formatDeliveryDate(subscription.delivery_date_time) : 'Not set'}
                  </p>
                )}
              </div>

              {subscription.customer_company_name && (
                <div>
                  <Label className="text-sm font-medium text-gray-900 mb-1" style={{ fontFamily: 'Albert Sans' }}>
                    Company Name
                  </Label>
                  <p className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    {subscription.customer_company_name}
                  </p>
                </div>
              )}

              {subscription.customer_department_name && (
                <div>
                  <Label className="text-sm font-medium text-gray-900 mb-1" style={{ fontFamily: 'Albert Sans' }}>
                    Department
                  </Label>
                  <p className="text-sm text-gray-700" style={{ fontFamily: 'Albert Sans' }}>
                    {subscription.customer_department_name}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this subscription? This will stop future recurring orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelModal(false)}>
              No, Keep Active
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
