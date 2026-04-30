"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query"

interface OrderProduct {
  order_product_id: number;
  product_id: number;
  product_name: string;
  product_description?: string;
  quantity: number;
  price: number;
  total: number;
  product_comment?: string;
  is_prepared?: boolean;
  options?: Array<{
    option_name: string;
    option_value: string;
    option_quantity: number;
    option_price: number;
  }>;
}

interface OrderDetails {
  order_id: number;
  customer_order_name: string;
  customer_order_email?: string;
  customer_order_telephone?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  telephone?: string;
  delivery_date_time?: string;
  order_comments?: string;
  order_comment?: string;
  customer_company_name?: string;
  customer_department_name?: string;
  company_name?: string;
  department_name?: string;
  location_name?: string;
  delivery_address?: string;
  order_products?: OrderProduct[];
  products?: OrderProduct[];
  subtotal?: string;
  wholesale_discount?: string | number;
  delivery_fee?: string;
  coupon_discount?: string;
  coupon_code?: string;
  gst?: string;
  calculated_total?: string;
  order_total?: string;
  order_status?: number;
  is_completed?: number;
  pickup_delivery_notes?: string;
  delivery_phone?: string;
  delivery_notes?: string;
  delivery_details?: string;
  delivery_contact?: string;
}

interface OrderDetailModalProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated?: () => void;
}

export function OrderDetailModal({
  orderId,
  open,
  onOpenChange,
  onOrderUpdated,
}: OrderDetailModalProps) {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all products to match categories for GST
  const { data: allProductsData } = useQuery({
    queryKey: ["all-products-for-gst-modal"],
    queryFn: async () => {
      const response = await api.get("/admin/products-new?limit=1000&status=1");
      return response.data;
    },
    staleTime: 300000,
  });

  const allProducts = allProductsData?.products || [];

  useEffect(() => {
    if (open && orderId) {
      fetchOrderDetails();
    } else {
      setOrder(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const fetchOrderDetails = async () => {
    if (!orderId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/admin/orders/${orderId}`);
      if (response.data && response.data.order) {
        setOrder(response.data.order);
      } else {
        setError("Order data not found in response");
      }
    } catch (error: any) {
      console.error("Failed to fetch order details:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to fetch order details";
      setError(errorMessage);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };


  const getStatusText = (status?: number) => {
    switch (status) {
      case 0:
        return "Cancelled";
      case 1:
        return "New";
      case 2:
        return "Paid";
      case 4:
        return "Awaiting Approval";
      case 5:
        return "Completed";
      case 7:
        return "Approved";
      case 8:
        return "Rejected";
      case 9:
        return "Modified";
      default:
        return "Unknown";
    }
  };

  const getStatusColor = (status?: number) => {
    switch (status) {
      case 1:
        return "bg-orange-50 text-orange-700";
      case 2:
        return "bg-green-50 text-green-700";
      case 4:
        return "bg-yellow-50 text-yellow-700";
      case 7:
        return "bg-blue-50 text-blue-700";
      case 0:
        return "bg-red-50 text-red-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  if (!orderId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "Albert Sans", fontWeight: 600 }}
            className="text-2xl"
          >
            Order Details #{orderId}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span
              style={{ fontFamily: "Albert Sans" }}
              className="ml-3 text-gray-600"
            >
              Loading order details...
            </span>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p
              style={{ fontFamily: "Albert Sans" }}
              className="text-red-600 mb-2"
            >
              {error}
            </p>
            <p
              style={{ fontFamily: "Albert Sans" }}
              className="text-sm text-gray-500"
            >
              Order ID: {orderId}
            </p>
            <Button
              onClick={fetchOrderDetails}
              className="mt-4"
              variant="outline"
              style={{ fontFamily: "Albert Sans", fontWeight: 600 }}
            >
              Retry
            </Button>
          </div>
        ) : order ? (
          <div className="space-y-6">
            {/* Order Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                    order.order_status
                  )}`}
                >
                  {getStatusText(order.order_status)}
                </span>
                {order.is_completed === 1 && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700">
                    Completed
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Products Table */}
              <div className="lg:col-span-2">
                <Card className="bg-white border border-gray-200">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-left px-4 py-3 text-sm text-gray-700"
                            >
                              No.
                            </th>
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-left px-4 py-3 text-sm text-gray-700"
                            >
                              Product Name
                            </th>
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-left px-4 py-3 text-sm text-gray-700"
                            >
                              Description
                            </th>
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-center px-4 py-3 text-sm text-gray-700"
                            >
                              Quantity
                            </th>
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-right px-4 py-3 text-sm text-gray-700"
                            >
                              Price
                            </th>
                            <th
                              style={{
                                fontFamily: "Albert Sans",
                                fontWeight: 600,
                              }}
                              className="text-right px-4 py-3 text-sm text-gray-700"
                            >
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.order_products &&
                            order.order_products.length > 0 ? (
                            order.order_products.map((product, index) => (
                              <tr
                                key={product.order_product_id}
                                className="border-b border-gray-100"
                              >
                                <td className="px-4 py-4">
                                  <span
                                    style={{ fontFamily: "Albert Sans" }}
                                    className="text-sm text-gray-700"
                                  >
                                    {index + 1}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <div>
                                    <p
                                      style={{ fontFamily: "Albert Sans" }}
                                      className="text-sm font-medium text-gray-900"
                                    >
                                      {product.product_name}
                                    </p>
                                    {product.product_description && (
                                      <p
                                        style={{ fontFamily: "Albert Sans" }}
                                        className="text-xs text-gray-500 mt-1"
                                      >
                                        {product.product_description}
                                      </p>
                                    )}
                                    {product.options &&
                                      product.options.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          <p
                                            style={{
                                              fontFamily: "Albert Sans",
                                            }}
                                            className="text-xs text-gray-600 font-medium"
                                          >
                                            Options:
                                          </p>
                                          {product.options.map(
                                            (option, optIdx) => (
                                              <div
                                                key={optIdx}
                                                style={{
                                                  fontFamily: "Albert Sans",
                                                }}
                                                className="text-xs text-gray-600 ml-2"
                                              >
                                                {option.option_name}:{" "}
                                                {option.option_value} (Qty:{" "}
                                                {option.option_quantity}, $
                                                {Number(
                                                  option.option_price
                                                ).toFixed(2)}
                                                )
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                    {product.product_comment && (
                                      <p
                                        style={{ fontFamily: "Albert Sans" }}
                                        className="text-xs text-gray-500 mt-1 italic"
                                      >
                                        Note: {product.product_comment}
                                      </p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <span
                                    style={{ fontFamily: "Albert Sans" }}
                                    className="text-sm text-gray-600"
                                  >
                                    {product.product_description || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span
                                    style={{ fontFamily: "Albert Sans" }}
                                    className="text-sm text-gray-900"
                                  >
                                    {product.quantity}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <span
                                    style={{ fontFamily: "Albert Sans" }}
                                    className="text-sm text-gray-900"
                                  >
                                    ${Number(product.price).toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <span
                                    style={{ fontFamily: "Albert Sans" }}
                                    className="text-sm font-medium text-gray-900"
                                  >
                                    ${(Number(product.price || 0) * Number(product.quantity || 0)).toFixed(2)}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-gray-500"
                              >
                                <span style={{ fontFamily: "Albert Sans" }}>
                                  No products in this order
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      <div className="space-y-2">
                        {(() => {
                          const subtotal = Number(order.subtotal || 0);
                          const couponDiscount = Number(order.coupon_discount || 0);
                          const deliveryFee = Number(order.delivery_fee || 0);
                          const orderProducts = order.products || order.order_products || [];

                          // Calculate GST only for ANCILLARIES and packages (10%)
                          const ancillaryGst = orderProducts.reduce((sum: number, p: any) => {
                            // Find the original product to get categories
                            const originalProduct = allProducts.find((ap: any) => Number(ap.product_id) === Number(p.product_id));

                            const categories = originalProduct?.categories || p.categories || [];
                            const categoryName = p.category || (p.categories && p.categories[0]?.category_name) || p.category_name || "";

                            const isAncillaryOrPackage = categories.some((c: any) => {
                              const name = (c.category_name || "").toUpperCase();
                              return name === "ANCILLARIES" || name === "PACKAGES" || name === "PACKAGING";
                            }) || categoryName.toUpperCase() === "ANCILLARIES" || categoryName.toUpperCase() === "PACKAGES" || categoryName.toUpperCase() === "PACKAGING";

                            if (isAncillaryOrPackage) {
                              return sum + (Number(p.total || 0) * 0.1);
                            }
                            return sum;
                          }, 0);

                          // Use subtotal + delivery - discount for total (don't add GST)
                          const total = subtotal + deliveryFee - couponDiscount;

                          return (
                            <>
                              <div className="flex justify-between items-center text-sm md:text-base border-b border-gray-100 pb-2 mb-2">
                                <span style={{ fontFamily: "Albert Sans" }} className="text-gray-600">
                                  Sub Total
                                </span>
                                <span style={{ fontFamily: "Albert Sans" }} className="text-sm font-medium text-gray-900">
                                  ${subtotal.toFixed(2)}
                                </span>
                              </div>
                              {couponDiscount > 0 && (
                                <div className="flex justify-between">
                                  <span style={{ fontFamily: "Albert Sans" }} className="text-sm text-green-600">
                                    Coupon Discount {order.coupon_code && `(${order.coupon_code})`}
                                  </span>
                                  <span style={{ fontFamily: "Albert Sans" }} className="text-sm text-green-600">
                                    -${couponDiscount.toFixed(2)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span style={{ fontFamily: "Albert Sans" }} className="text-sm text-gray-700">
                                  Delivery Fee
                                </span>
                                <span style={{ fontFamily: "Albert Sans" }} className="text-sm font-medium text-gray-900">
                                  ${deliveryFee.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-gray-300">
                                <span style={{ fontFamily: "Albert Sans", fontWeight: 600 }} className="text-base text-gray-900">
                                  Total
                                </span>
                                <span style={{ fontFamily: "Albert Sans", fontWeight: 600 }} className="text-base text-gray-900">
                                  ${total.toFixed(2)}
                                </span>
                              </div>
                              {ancillaryGst > 0 && (
                                <div className="flex justify-between mt-1">
                                  <span style={{ fontFamily: "Albert Sans" }} className="text-sm text-gray-600">
                                    GST
                                  </span>
                                  <span style={{ fontFamily: "Albert Sans" }} className="text-sm font-medium text-gray-900">
                                    ${ancillaryGst.toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Order Details */}
              <div className="space-y-4">
                <Card className="bg-white border border-gray-200">
                  <CardContent className="p-4">
                    <h3
                      style={{ fontFamily: "Albert Sans", fontWeight: 600 }}
                      className="text-base font-semibold text-gray-900 mb-4"
                    >
                      Customer Details
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-xs text-gray-500"
                        >
                          Name
                        </p>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-sm font-medium text-gray-900"
                        >
                          {order.customer_order_name ||
                            `${order.firstname || ""} ${order.lastname || ""
                              }`.trim() ||
                            "N/A"}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-xs text-gray-500"
                        >
                          Email
                        </p>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-sm text-gray-700"
                        >
                          {order.customer_order_email || order.email || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-xs text-gray-500"
                        >
                          Phone
                        </p>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-sm text-gray-700"
                        >
                          {order.customer_order_telephone ||
                            order.telephone ||
                            "N/A"}
                        </p>
                      </div>
                      {order.company_name && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Company
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700"
                          >
                            {order.company_name}
                          </p>
                        </div>
                      )}
                      {order.department_name && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Department
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700"
                          >
                            {order.department_name}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-200">
                  <CardContent className="p-4">
                    <h3
                      style={{ fontFamily: "Albert Sans", fontWeight: 600 }}
                      className="text-base font-semibold text-gray-900 mb-4"
                    >
                      Delivery Details
                    </h3>
                    <div className="space-y-3">
                      {/* <div>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-xs text-gray-500"
                        >
                          Delivery Date
                        </p>
                        <p
                          style={{ fontFamily: "Albert Sans" }}
                          className="text-sm text-gray-700"
                        >
                          {order.delivery_date_time
                            ? format(
                              new Date(order.delivery_date_time.endsWith('Z') ? order.delivery_date_time.slice(0, -1) : order.delivery_date_time),
                              "dd MMM, yyyy"
                            )
                            : "N/A"}
                        </p>
                      </div> */}
                      {order.location_name && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Location
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700"
                          >
                            {order.location_name}
                          </p>
                        </div>
                      )}
                      {order.delivery_address && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Delivery Address
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700"
                          >
                            {order.delivery_address}
                          </p>
                        </div>
                      )}
                      {(order.order_comments || order.order_comment) && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Order Comments
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700 whitespace-pre-line"
                          >
                            {order.order_comments || order.order_comment}
                          </p>
                        </div>
                      )}
                      {(order.pickup_delivery_notes || order.delivery_details || order.delivery_notes) && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Delivery Notes
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700 whitespace-pre-line"
                          >
                            {order.pickup_delivery_notes || order.delivery_details || order.delivery_notes}
                          </p>
                        </div>
                      )}
                      {(order.delivery_phone || order.delivery_contact) && (
                        <div>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-xs text-gray-500"
                          >
                            Delivery Contact No
                          </p>
                          <p
                            style={{ fontFamily: "Albert Sans" }}
                            className="text-sm text-gray-700"
                          >
                            {order.delivery_contact
                              ? (() => {
                                const parts = order.delivery_contact.split('|');
                                const name = parts[0] || '';
                                const number = parts[1] || '';
                                return (name && number) ? `${name} (${number})` : (name || number);
                              })()
                              : order.delivery_phone}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-gray-500">
            <span style={{ fontFamily: "Albert Sans" }}>Order not found</span>
            {orderId && (
              <p
                style={{ fontFamily: "Albert Sans" }}
                className="text-sm text-gray-400 mt-2"
              >
                Order ID: {orderId}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
