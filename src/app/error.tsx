"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="text-center max-w-md">
        <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Albert Sans' }}>
          Something went wrong!
        </h2>
        <p className="text-gray-600 mb-6" style={{ fontFamily: 'Albert Sans' }}>
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex gap-4 justify-center">
          <Button
            onClick={reset}
            className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
            style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
          >
            Try again
          </Button>
          <Button
            onClick={() => window.location.href = '/dashboard'}
            variant="outline"
            className="border-gray-300"
            style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

