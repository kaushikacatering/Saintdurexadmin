"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="text-center max-w-md">
        <FileQuestion className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Albert Sans' }}>
          404
        </h2>
        <h3 className="text-xl font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Albert Sans' }}>
          Page Not Found
        </h3>
        <p className="text-gray-600 mb-6" style={{ fontFamily: 'Albert Sans' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/dashboard">
            <Button
              className="bg-[#0d6efd] hover:bg-[#0b5ed7] text-white"
              style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
            >
              Go to Dashboard
            </Button>
          </Link>
          <Button
            onClick={() => window.history.back()}
            variant="outline"
            className="border-gray-300"
            style={{ fontFamily: 'Albert Sans', fontWeight: 600 }}
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  )
}

