"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ValidatedInput } from "@/components/ui/validated-input"
import { ValidatedTextarea } from "@/components/ui/validated-textarea"
import { ValidationRules } from "@/lib/validation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { companiesAPI, customersAPI, locationsAPI } from "@/lib/api"
import { QuoteData } from "../page"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { formatAustralianPhone, cleanPhoneNumber, getPhonePlaceholder, getPhoneValidationError } from "@/lib/phone-mask"

interface CustomerStepProps {
  data: QuoteData
  onUpdate: (data: Partial<QuoteData>) => void
  onNext: () => void
  showAddCustomerModal?: boolean
  onCloseAddCustomerModal?: () => void
  onOpenAddCustomerModal?: () => void
}

interface Company {
  company_id: number
  company_name: string
}

interface Department {
  department_id: number
  department_name: string
}

interface Customer {
  customer_id: number
  firstname: string
  lastname: string
  email: string
  telephone: string
  customer_type?: string
  customer_address?: string
}

interface Location {
  location_id: number
  location_name: string
}

export function CustomerStep({ data, onUpdate, onNext, showAddCustomerModal = false, onCloseAddCustomerModal, onOpenAddCustomerModal }: CustomerStepProps) {
  const queryClient = useQueryClient()
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  // Initialize with data prop values, but will sync via useEffect
  const [selectedCompany, setSelectedCompany] = useState(0)
  const [selectedDepartment, setSelectedDepartment] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState(0)
  const [selectedLocation, setSelectedLocation] = useState(0)
  const [customerName, setCustomerName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  // Modal states
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false)
  const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false)

  // Company form state
  const [companyName, setCompanyName] = useState("")
  const [companyAbn, setCompanyAbn] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")

  // Department form state
  const [departmentName, setDepartmentName] = useState("")
  const [departmentComments, setDepartmentComments] = useState("")

  // Customer form state
  const [customerFirstname, setCustomerFirstname] = useState("")
  const [customerLastname, setCustomerLastname] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [customerType, setCustomerType] = useState("Retail")
  const [customerNotes, setCustomerNotes] = useState("")
  const [customerCostCentre, setCustomerCostCentre] = useState("")

  // Fetch companies using React Query
  const { data: companiesData, isLoading: loadingCompanies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const response = await companiesAPI.list()
      return response.data
    }
  })

  // Fetch departments when company is selected
  const { data: departmentsData, isLoading: loadingDepartments } = useQuery({
    queryKey: ['departments', selectedCompany],
    queryFn: async () => {
      console.log("Fetching departments for company:", selectedCompany)
      const response = await companiesAPI.getDepartments(selectedCompany)
      console.log("Departments loaded:", response.data)
      return response.data
    },
    enabled: selectedCompany > 0
  })

  // Fetch customers - include all customers if no company selected, or filter by company if selected
  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', selectedCompany],
    queryFn: async () => {
      // If company is selected, filter by company_id
      // If no company selected, fetch all customers (API will return all if company_id not provided)
      const params = selectedCompany > 0 ? { company_id: selectedCompany } : {}
      const response = await customersAPI.list(params)
      return response.data
    },
    // Always enabled - fetch customers regardless of company selection
  })

  // Fetch locations
  const { data: locationsData, isLoading: loadingLocations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await locationsAPI.list()
      return response.data
    }
  })

  const companies = companiesData?.companies || []
  const departments = departmentsData?.departments || []
  const customers = customersData?.customers || []
  const locations = locationsData?.locations || []

  // Auto-select location if only one exists
  useEffect(() => {
    if (locations.length === 1 && selectedLocation === 0 && !loadingLocations) {
      const singleLocation = locations[0]
      setSelectedLocation(singleLocation.location_id)
      onUpdate({ location_id: singleLocation.location_id })
    }
  }, [locations, selectedLocation, loadingLocations])

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (companyData: any) => {
      const response = await companiesAPI.create(companyData)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      toast.success("Company added successfully!")
      setShowAddCompanyModal(false)
      // Select the newly created company
      if (data?.company?.company_id) {
        setSelectedCompany(data.company.company_id)
      }
      // Reset form
      setCompanyName("")
      setCompanyAbn("")
      setCompanyPhone("")
      setCompanyAddress("")
    },
    onError: (error: any) => {
      console.error("Error creating company:", error)
      toast.error(error.response?.data?.message || "Failed to add company")
    },
  })

  // Create department mutation
  const createDepartmentMutation = useMutation({
    mutationFn: async (departmentData: any) => {
      const response = await companiesAPI.createDepartment(departmentData)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['departments', selectedCompany] })
      toast.success("Department added successfully!")
      setShowAddDepartmentModal(false)
      // Select the newly created department
      if (data?.department?.department_id) {
        setSelectedDepartment(data.department.department_id)
      }
      // Reset form
      setDepartmentName("")
      setDepartmentComments("")
    },
    onError: (error: any) => {
      console.error("Error creating department:", error)
      const errorMessage = error.response?.data?.message || error.message || "Failed to add department"
      toast.error(errorMessage)
    },
  })

  const handleSaveCompany = () => {
    if (!companyName.trim()) {
      toast.error("Company name is required")
      return
    }
    if (!companyPhone.trim()) {
      toast.error("Phone number is required")
      return
    }

    createCompanyMutation.mutate({
      company_name: companyName.trim(),
      company_abn: companyAbn.trim() || null,
      company_phone: cleanPhoneNumber(companyPhone),
      company_address: companyAddress.trim() || null,
      company_status: 1,
    })
  }

  const handleSaveDepartment = () => {
    if (!selectedCompany || selectedCompany === 0) {
      toast.error("Please select a company first")
      return
    }
    if (!departmentName.trim()) {
      toast.error("Department name is required")
      return
    }

    createDepartmentMutation.mutate({
      department_name: departmentName.trim(),
      company_id: selectedCompany,
      comments: departmentComments.trim() || null,
    })
  }

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      const response = await customersAPI.create(customerData)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customers', selectedCompany] })
      toast.success("Customer added successfully!")
      if (onCloseAddCustomerModal) {
        onCloseAddCustomerModal()
      }
      // Select the newly created customer
      if (data?.customer?.customer_id) {
        setSelectedCustomer(data.customer.customer_id)
        // Update customer details
        const customer = data.customer
        setCustomerName(`${customer.firstname} ${customer.lastname}`)
        setPhone(customer.telephone || "")
        setEmail(customer.email || "")
        // Update parent state
        onUpdate({
          customer_id: customer.customer_id,
          customer_name: `${customer.firstname} ${customer.lastname}`,
          customer_type: customer.customer_type || "Retail",
          phone: customer.telephone,
          email: customer.email,
          company_id: customer.company_id || selectedCompany,
          department_id: customer.department_id || selectedDepartment,
          customer_address: customer.customer_address || "",
        })
      }
      // Reset form
      setCustomerFirstname("")
      setCustomerLastname("")
      setCustomerEmail("")
      setCustomerPhone("")
      setCustomerAddress("")
      setCustomerNotes("")
      setCustomerCostCentre("")
    },
    onError: (error: any) => {
      console.error("Error creating customer:", error)
      toast.error(error.response?.data?.message || "Failed to add customer")
    },
  })

  const handleSaveCustomer = () => {
    if (!customerFirstname.trim()) {
      toast.error("First name is required")
      return
    }

    createCustomerMutation.mutate({
      firstname: customerFirstname.trim(),
      lastname: customerLastname.trim(),
      email: customerEmail.trim() || null,
      telephone: cleanPhoneNumber(customerPhone) || null,
      customer_address: customerAddress.trim() || null,
      customer_type: customerType || "Retail",
      customer_notes: customerNotes.trim() || null,
      customer_cost_centre: customerCostCentre.trim() || null,
      company_id: selectedCompany > 0 ? selectedCompany : null,
      department_id: selectedDepartment > 0 ? selectedDepartment : null,
      status: 1,
      archived: false,
    })
  }

  // Sync with incoming data prop (for edit mode)
  // This effect ensures data is synced when it becomes available
  useEffect(() => {
    // Use a small delay to ensure data is fully loaded and avoid race conditions
    const timer = setTimeout(() => {
      // Handle company_id (can be undefined/null for customers without company)
      if (data.company_id !== undefined) {
        const newCompanyId = data.company_id || 0
        if (newCompanyId !== selectedCompany) {
          setSelectedCompany(newCompanyId)
        }
      }
      // Handle department_id (can be undefined/null for customers without department)
      if (data.department_id !== undefined) {
        const newDeptId = data.department_id || 0
        if (newDeptId !== selectedDepartment) {
          setSelectedDepartment(newDeptId)
        }
      }
      // Handle customer_id
      if (data.customer_id !== undefined) {
        const newCustomerId = data.customer_id || 0
        if (newCustomerId !== selectedCustomer) {
          setSelectedCustomer(newCustomerId)
        }
      }
      // Handle location_id
      if (data.location_id !== undefined) {
        const newLocationId = data.location_id || 0
        if (newLocationId !== selectedLocation) {
          setSelectedLocation(newLocationId)
        }
      }
      // Handle customer_name
      if (data.customer_name !== undefined) {
        const newCustomerName = data.customer_name || ''
        if (newCustomerName !== customerName) {
          setCustomerName(newCustomerName)
        }
      }
      // Handle phone
      if (data.phone !== undefined) {
        const newPhone = data.phone || ''
        if (newPhone !== phone) {
          setPhone(newPhone)
        }
      }
      // Handle email
      if (data.email !== undefined) {
        const newEmail = data.email || ''
        if (newEmail !== email) {
          setEmail(newEmail)
        }
      }
    }, 50) // Small delay to ensure data is ready

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.company_id, data.department_id, data.customer_id, data.location_id, data.customer_name, data.phone, data.email])

  // Mark initial load as complete once we have all the data loaded
  useEffect(() => {
    if (isInitialLoad) {
      // Check if we have valid data (either from props or state)
      const hasDataFromProps = (data.company_id !== undefined && data.company_id !== null) ||
        (data.customer_id !== undefined && data.customer_id !== null) ||
        (data.location_id !== undefined && data.location_id !== null)

      const hasDataFromState = selectedCompany > 0 || selectedCustomer > 0 || selectedLocation > 0

      // Wait for all queries to finish loading
      const allLoaded = !loadingDepartments && !loadingCustomers && !loadingCompanies && !loadingLocations

      if ((hasDataFromProps || hasDataFromState) && allLoaded) {
        // Add a delay to ensure everything is rendered and synced
        const timer = setTimeout(() => {
          setIsInitialLoad(false)
        }, 200) // Increased delay to ensure data is fully synced
        return () => clearTimeout(timer)
      } else if (!hasDataFromProps && !hasDataFromState && allLoaded) {
        // No initial data, but all queries loaded - mark as loaded
        const timer = setTimeout(() => {
          setIsInitialLoad(false)
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [isInitialLoad, selectedCompany, selectedCustomer, selectedLocation, loadingDepartments, loadingCustomers, loadingCompanies, loadingLocations, data.company_id, data.customer_id, data.location_id])

  // Reset department and customer when company changes manually (not during initial load)
  const handleCompanyChange = (companyId: number) => {
    setSelectedCompany(companyId)
    if (!isInitialLoad && companyId > 0) {
      setSelectedDepartment(0)
      setSelectedCustomer(0)
      setCustomerName("")
      setPhone("")
      setEmail("")
    }
  }

  // Update customer details when customer is selected manually
  const handleCustomerChange = (customerId: number) => {
    setSelectedCustomer(customerId)
    if (!isInitialLoad && customerId > 0) {
      const customer = customers.find((c: Customer) => c.customer_id === customerId)
      if (customer) {
        setCustomerName(`${customer.firstname} ${customer.lastname}`)
        setPhone(customer.telephone || "")
        setEmail(customer.email || "")
        // Update customer_type immediately when customer is selected
        onUpdate({
          customer_id: customerId,
          customer_name: `${customer.firstname} ${customer.lastname}`,
          customer_type: customer.customer_type || "Retail",
          phone: customer.telephone || "",
          email: customer.email || "",
          customer_address: customer.customer_address || "",
        })
      }
    }
  }

  const handleProceed = () => {
    // Validation - Company and Department are now optional
    if (!selectedCustomer || selectedCustomer === 0) {
      toast.error("Please select a customer")
      return
    }

    if (!selectedLocation || selectedLocation === 0) {
      toast.error("Please select a location")
      return
    }

    if (!phone || !email) {
      toast.error("Phone and email are required")
      return
    }

    // Update parent state with all customer data
    // Company and department are optional - only include if selected
    const customer = customers.find((c: Customer) => c.customer_id === selectedCustomer)
    const locationObj = locations.find((l: Location) => l.location_id === selectedLocation)

    onUpdate({
      company_id: selectedCompany > 0 ? selectedCompany : undefined,
      department_id: selectedDepartment > 0 ? selectedDepartment : undefined,
      customer_id: selectedCustomer,
      location_id: selectedLocation,
      location: locationObj?.location_name,
      customer_name: customerName,
      customer_type: customer?.customer_type || "Retail",
      phone,
      email,
      customer_address: customer?.customer_address || customerAddress || "",
    })

    toast.success("Customer details saved")
    onNext()
  }

  return (
    <Card className="p-8 bg-white border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}>
          Enter Customer Details
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company */}
        <div className="space-y-2">
          <Label htmlFor="company" className="text-sm font-medium text-gray-700">
            Company
          </Label>
          <div className="flex gap-2">
            <select
              id="company"
              value={selectedCompany}
              onChange={(e) => handleCompanyChange(Number(e.target.value))}
              disabled={loadingCompanies}
              className="flex-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Albert Sans' }}
            >
              <option value={0}>
                {loadingCompanies ? "Loading..." : "Select"}
              </option>
              {companies.map((company: Company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.company_name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddCompanyModal(true)}
              className="gap-2 border-gray-300 text-[#0d6efd] hover:text-[#0b5ed7]"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              <span className="text-lg">+</span>
              Add New
            </Button>
          </div>
        </div>

        {/* Department */}
        <div className="space-y-2">
          <Label htmlFor="department" className="text-sm font-medium text-gray-700">
            Department
          </Label>
          <div className="flex gap-2">
            <select
              id="department"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(Number(e.target.value))}
              disabled={selectedCompany === 0 || loadingDepartments}
              className="flex-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Albert Sans' }}
            >
              <option value={0}>
                {loadingDepartments ? "Loading..." : "Select"}
              </option>
              {departments.map((dept: Department) => (
                <option key={dept.department_id} value={dept.department_id}>
                  {dept.department_name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={selectedCompany === 0}
              onClick={() => setShowAddDepartmentModal(true)}
              className="gap-2 border-gray-300 text-[#0d6efd] hover:text-[#0b5ed7] disabled:opacity-50"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              <span className="text-lg">+</span>
              Add New
            </Button>
          </div>
        </div>

        {/* Customer Name */}
        <div className="space-y-2">
          <Label htmlFor="customer" className="text-sm font-medium text-gray-700">
            Customer Name <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <select
              id="customer"
              value={selectedCustomer}
              onChange={(e) => handleCustomerChange(Number(e.target.value))}
              disabled={loadingCustomers}
              className="flex-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Albert Sans' }}
            >
              <option value={0}>
                {loadingCustomers ? "Loading..." : "Enter"}
              </option>
              {customers.map((customer: Customer) => (
                <option key={customer.customer_id} value={customer.customer_id}>
                  {customer.firstname} {customer.lastname}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onOpenAddCustomerModal) {
                  onOpenAddCustomerModal();
                }
              }}
              className="gap-2 border-gray-300 text-[#0d6efd] hover:text-[#0b5ed7] disabled:opacity-50"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              <span className="text-lg">+</span>
              Add New
            </Button>
          </div>
        </div>

        {/* Phone Number */}
        <ValidatedInput
          label="Phone Number *"
          type="tel"
          placeholder={getPhonePlaceholder()}
          value={phone}
          validationRule={ValidationRules.customer.telephone}
          fieldName="Phone Number"
          onChange={(value, isValid) => {
            const previousValue = phone
            const formatted = formatAustralianPhone(value, previousValue)
            setPhone(formatted)
          }}
          className="h-11 border-gray-300"
        />

        {/* Email */}
        <ValidatedInput
          label="Email *"
          type="email"
          placeholder="Enter"
          value={email}
          validationRule={ValidationRules.customer.email}
          fieldName="Email"
          onChange={(value) => setEmail(value)}
          className="h-11 border-gray-300"
        />

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location" className="text-sm font-medium text-gray-700">
            Location <span className="text-red-500">*</span>
          </Label>
          <select
            id="location"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(Number(e.target.value))}
            disabled={loadingLocations}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            style={{ fontFamily: 'Albert Sans' }}
          >
            <option value={0}>
              {loadingLocations ? "Loading..." : "Enter"}
            </option>
            {locations.map((loc: Location) => (
              <option key={loc.location_id} value={loc.location_id}>
                {loc.location_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Proceed Button */}
      <div className="flex justify-end mt-8">
        <Button
          onClick={handleProceed}
          className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white px-8 py-2 rounded-full"
          style={{
            fontFamily: 'Albert Sans',
            fontWeight: 600,
            height: '50px',
            minWidth: '196px'
          }}
        >
          Proceed
        </Button>
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddCompanyModal} onOpenChange={(open) => {
        if (!open) {
          // Blur active element to prevent validation on blur
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        }
        setShowAddCompanyModal(open)
      }}>
        <DialogContent className="max-w-md" style={{ fontFamily: 'Albert Sans' }}>
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto mb-4">
              <Plus className="h-6 w-6 text-[#0d6efd]" />
            </div>
            <DialogTitle className="text-center text-xl font-semibold">
              Add Company
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Company Name */}
            <ValidatedInput
              label="Company Name"
              placeholder="Name"
              value={companyName}
              validationRule={ValidationRules.company.company_name}
              fieldName="Company Name"
              onChange={(value) => setCompanyName(value)}
              className="h-11 border-gray-300"
            />

            {/* ABN */}
            <ValidatedInput
              label="ABN"
              placeholder="Enter ABN (11 digits)"
              value={companyAbn}
              validationRule={ValidationRules.company.company_abn}
              fieldName="ABN"
              onChange={(value) => setCompanyAbn(value)}
              className="h-11 border-gray-300"
            />

            {/* Phone */}
            <ValidatedInput
              label="Phone"
              type="tel"
              placeholder={getPhonePlaceholder()}
              value={companyPhone}
              validationRule={ValidationRules.company.company_phone}
              fieldName="Phone"
              onChange={(value, isValid) => {
                const previousValue = companyPhone
                const formatted = formatAustralianPhone(value, previousValue)
                setCompanyPhone(formatted)
              }}
              className="h-11 border-gray-300"
            />

            {/* Address */}
            <ValidatedTextarea
              label="Address"
              placeholder="Enter address"
              value={companyAddress}
              validationRule={ValidationRules.company.company_address}
              fieldName="Address"
              onChange={(value) => setCompanyAddress(value)}
              rows={3}
              className="border-gray-300 resize-none"
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  setShowAddCompanyModal(false)
                  setCompanyName("")
                  setCompanyAbn("")
                  setCompanyPhone("")
                  setCompanyAddress("")
                }}
                variant="outline"
                className="flex-1 border-gray-300"
                disabled={createCompanyMutation.isPending}
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCompany}
                disabled={createCompanyMutation.isPending}
                className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                {createCompanyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                    Saving...
                  </>
                ) : (
                  'Add'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Department Modal */}
      <Dialog open={showAddDepartmentModal} onOpenChange={(open) => {
        if (!open) {
          // Blur active element to prevent validation on blur
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        }
        setShowAddDepartmentModal(open)
      }}>
        <DialogContent className="max-w-md" style={{ fontFamily: 'Albert Sans' }}>
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto mb-4">
              <Plus className="h-6 w-6 text-[#0d6efd]" />
            </div>
            <DialogTitle className="text-center text-xl font-semibold">
              Add Department
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Company Info (read-only) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                Company
              </Label>
              <Input
                value={companies.find((c: Company) => c.company_id === selectedCompany)?.company_name || "No company selected"}
                disabled
                className="h-11 border-gray-300 bg-gray-100"
                style={{ fontFamily: 'Albert Sans' }}
              />
              {selectedCompany === 0 && (
                <p className="text-xs text-red-500">Please select a company first</p>
              )}
            </div>

            {/* Department Name */}
            <ValidatedInput
              label="Department Name"
              placeholder="Enter department name"
              value={departmentName}
              validationRule={ValidationRules.department.department_name}
              fieldName="Department Name"
              onChange={(value) => setDepartmentName(value)}
              className="h-11 border-gray-300"
            />

            {/* Comments */}
            <ValidatedTextarea
              label="Comments"
              placeholder="Enter comments (optional)"
              value={departmentComments}
              validationRule={ValidationRules.department.department_comments}
              fieldName="Comments"
              onChange={(value) => setDepartmentComments(value)}
              rows={3}
              className="border-gray-300 resize-none"
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  setShowAddDepartmentModal(false)
                  setDepartmentName("")
                  setDepartmentComments("")
                }}
                variant="outline"
                className="flex-1 border-gray-300"
                disabled={createDepartmentMutation.isPending}
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDepartment}
                disabled={createDepartmentMutation.isPending || selectedCompany === 0}
                className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white disabled:opacity-50"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                {createDepartmentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                    Saving...
                  </>
                ) : (
                  'Add'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Customer Modal */}
      <Dialog open={showAddCustomerModal} onOpenChange={(open) => {
        if (!open) {
          // Blur active element to prevent validation on blur
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
          if (onCloseAddCustomerModal) {
            onCloseAddCustomerModal()
          }
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'Albert Sans' }}>
          <DialogHeader>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto mb-4">
              <Plus className="h-6 w-6 text-[#0d6efd]" />
            </div>
            <DialogTitle className="text-center text-xl font-semibold">
              Add Customer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* First Name */}
              <ValidatedInput
                label="First Name"
                placeholder="Enter first name"
                value={customerFirstname}
                validationRule={ValidationRules.customer.firstname}
                fieldName="First Name"
                onChange={(value) => setCustomerFirstname(value)}
                className="h-11 border-gray-300"
              />

              {/* Last Name */}
              <ValidatedInput
                label="Last Name"
                placeholder="Enter last name"
                value={customerLastname}
                validationRule={ValidationRules.customer.lastname}
                fieldName="Last Name"
                onChange={(value) => setCustomerLastname(value)}
                className="h-11 border-gray-300"
              />

              {/* Email */}
              <ValidatedInput
                label="Email"
                type="email"
                placeholder="Enter email"
                value={customerEmail}
                validationRule={ValidationRules.customer.email}
                fieldName="Email"
                onChange={(value) => setCustomerEmail(value)}
                className="h-11 border-gray-300"
              />

              {/* Phone */}
              <ValidatedInput
                label="Phone"
                type="tel"
                placeholder={getPhonePlaceholder()}
                value={customerPhone}
                validationRule={ValidationRules.customer.telephone}
                fieldName="Phone"
                onChange={(value, isValid) => {
                  const previousValue = customerPhone
                  const formatted = formatAustralianPhone(value, previousValue)
                  setCustomerPhone(formatted)
                }}
                className="h-11 border-gray-300"
              />

              {/* Customer Type */}
              <div className="space-y-2">
                <Label htmlFor="customerType" className="text-sm font-medium text-gray-700">
                  Customer Type
                </Label>
                <select
                  id="customerType"
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value)}
                  className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d6efd] focus:border-transparent"
                  style={{ fontFamily: 'Albert Sans' }}
                >
                  <option value="Retail">Retail</option>
                  <option value="Full Service Wholesale">Full Service Wholesale</option>
                  <option value="Partial Service Wholesale">Partial Service Wholesale</option>
                </select>
              </div>

              {/* Cost Centre */}
              <ValidatedInput
                label="Cost Centre"
                placeholder="Enter cost centre"
                value={customerCostCentre}
                validationRule={ValidationRules.customer.customer_cost_centre}
                fieldName="Cost Centre"
                onChange={(value) => setCustomerCostCentre(value)}
                className="h-11 border-gray-300"
              />
            </div>

            {/* Billing Address */}
            <ValidatedTextarea
              label="Billing Address"
              placeholder="Enter billing address"
              value={customerAddress}
              validationRule={ValidationRules.customer.customer_address}
              fieldName="Billing Address"
              onChange={(value) => setCustomerAddress(value)}
              rows={3}
              className="border-gray-300 resize-none"
            />

            {/* Notes */}
            <ValidatedTextarea
              label="Notes"
              placeholder="Enter additional notes"
              value={customerNotes}
              validationRule={ValidationRules.customer.customer_notes}
              fieldName="Notes"
              onChange={(value) => setCustomerNotes(value)}
              rows={3}
              className="border-gray-300 resize-none"
            />

            {/* Company/Department Info */}
            {selectedCompany > 0 && (
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Company:</span> {companies.find((c: Company) => c.company_id === selectedCompany)?.company_name || "N/A"}
                  {selectedDepartment > 0 && (
                    <>
                      {" | "}
                      <span className="font-medium">Department:</span> {departments.find((d: Department) => d.department_id === selectedDepartment)?.department_name || "N/A"}
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Customer will be associated with the selected company and department
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  if (onCloseAddCustomerModal) {
                    onCloseAddCustomerModal()
                  }
                  setCustomerFirstname("")
                  setCustomerLastname("")
                  setCustomerEmail("")
                  setCustomerPhone("")
                  setCustomerAddress("")
                  setCustomerNotes("")
                  setCustomerCostCentre("")
                }}
                variant="outline"
                className="flex-1 border-gray-300"
                disabled={createCustomerMutation.isPending}
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCustomer}
                disabled={createCustomerMutation.isPending}
                className="flex-1 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
                style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
              >
                {createCustomerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                    Saving...
                  </>
                ) : (
                  'Add Customer'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

