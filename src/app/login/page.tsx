"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/store/auth"
import { toast } from "sonner"

type LoginForm = {
  username: string
  password: string
}

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { login, logout } = useAuthStore()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>()

  // Clear any existing tokens when landing on login page
  useEffect(() => {
    logout()
  }, [logout])

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)

    try {
      await login(data.username, data.password)
      toast.success("Login successful!")
      
      // Signal to session manager that we just logged in (avoid premature auth checks)
      sessionStorage.setItem('just-logged-in', 'true')
      
      // Check if there's a redirect parameter
      const urlParams = new URLSearchParams(window.location.search)
      const redirect = urlParams.get('redirect')
      
      // Ensure redirect is a valid internal path (not "/" which may be intercepted by cPanel)
      const targetPath = redirect && redirect !== '/' ? redirect : '/dashboard'
      
      // Redirect to the original page or dashboard
      router.push(targetPath)
    } catch (error: any) {
      const errorMessage = error?.message || error.response?.data?.message || "Login failed. Please check your credentials."
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="flex justify-center">
            <Image
              src="/assets/group171.svg"
              alt="St. Dreux Coffee"
              width={120}
              height={40}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-gray-800">Admin Portal</CardTitle>
            <CardDescription className="text-base mt-2">
              Enter your credentials to access the dashboard
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">Username or Email</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                className="h-11"
                {...register("username", { required: "Username is required" })}
                disabled={isLoading}
              />
              {errors.username && (
                <p className="text-sm text-red-500">{errors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                className="h-11"
                {...register("password", { required: "Password is required" })}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#0d6efd] hover:bg-[#0b5ed7] text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {/* <div className="mt-6 text-center text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
            <p className="font-medium">Default credentials:</p>
            <p className="font-mono text-xs mt-2">
              superadmin / password123<br />
              admin / password123
            </p>
          </div> */}
        </CardContent>
      </Card>
    </div>
  )
}

