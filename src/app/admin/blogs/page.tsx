"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Search, Plus, Edit, Trash2, Eye, EyeOff, Upload, X, Check } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://ec2-13-55-72-162.ap-southeast-2.compute.amazonaws.com:9000"

// Resolve image URL: if the stored URL points to localhost or a wrong host, rewrite it using the actual API URL
function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return ""
  // If it's a relative path like /uploads/..., prepend the API URL
  if (url.startsWith("/uploads/")) return `${API_URL}${url}`
  // If it contains /uploads/ but with a wrong host (e.g. localhost), extract the path and prepend the correct API URL
  const uploadsIndex = url.indexOf("/uploads/")
  if (uploadsIndex !== -1) return `${API_URL}${url.substring(uploadsIndex)}`
  return url
}

interface Blog {
  blog_id: number
  title: string
  slug: string
  category: string
  excerpt: string
  content: string
  featured_image_url: string
  author: string
  tags: string[]
  read_time: number
  is_featured: boolean
  is_published: boolean
  published_date: string
  created_date: string
  modified_date: string
  created_by_username?: string
}

export default function BlogsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null)
  const [filterPublished, setFilterPublished] = useState<boolean | undefined>(undefined)

  // Form state
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [category, setCategory] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [content, setContent] = useState("")
  const [featuredImageUrl, setFeaturedImageUrl] = useState("")
  const [author, setAuthor] = useState("")
  const [tags, setTags] = useState("")
  const [isFeatured, setIsFeatured] = useState(false)
  const [isPublished, setIsPublished] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<string>("")

  // Fetch blogs
  const { data: blogsData, isLoading } = useQuery({
    queryKey: ["blogs", searchQuery, filterPublished],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (searchQuery) params.append("search", searchQuery)
      if (filterPublished !== undefined) params.append("is_published", filterPublished.toString())
      params.append("limit", "50")
      
      const response = await api.get(`/admin/blogs?${params.toString()}`)
      return response.data
    },
  })

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: async () => {
      const response = await api.get("/store/blogs/categories")
      return response.data
    },
  })

  // Create blog mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post("/admin/blogs", data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] })
      toast.success("Blog created successfully")
      resetForm()
      setShowAddModal(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create blog")
    },
  })

  // Update blog mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/admin/blogs/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] })
      toast.success("Blog updated successfully")
      resetForm()
      setShowEditModal(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update blog")
    },
  })

  // Delete blog mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/admin/blogs/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogs"] })
      toast.success("Blog deleted successfully")
      setShowDeleteModal(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete blog")
    },
  })

  // Upload image mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const response = await api.post("/admin/blogs/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      return response.data
    },
    onSuccess: (data) => {
      console.log("Image upload response:", data)
      const imageUrl = data.image_url || data.url || data.imageUrl
      if (!imageUrl) {
        console.error("No image URL in response:", data)
        toast.error("Image uploaded but no URL returned")
        setUploadingImage(false)
        return
      }
      setFeaturedImageUrl(imageUrl)
      setImagePreview(resolveImageUrl(imageUrl))
      setUploadingImage(false)
      toast.success("Image uploaded successfully")
    },
    onError: (error: any) => {
      console.error("Image upload error:", error)
      setUploadingImage(false)
      toast.error(error.response?.data?.message || "Failed to upload image")
    },
  })

  const resetForm = () => {
    setTitle("")
    setSlug("")
    setCategory("")
    setExcerpt("")
    setContent("")
    setFeaturedImageUrl("")
    setAuthor("")
    setTags("")
    setIsFeatured(false)
    setIsPublished(false)
    setImagePreview("")
  }

  const handleAdd = () => {
    resetForm()
    setShowAddModal(true)
  }

  const handleEdit = (blog: Blog) => {
    setSelectedBlog(blog)
    setTitle(blog.title)
    setSlug(blog.slug)
    setCategory(blog.category || "")
    setExcerpt(blog.excerpt || "")
    setContent(blog.content)
    setFeaturedImageUrl(blog.featured_image_url || "")
    setAuthor(blog.author || "")
    setTags(blog.tags?.join(", ") || "")
    setIsFeatured(blog.is_featured)
    setIsPublished(blog.is_published)
    setImagePreview(resolveImageUrl(blog.featured_image_url))
    setShowEditModal(true)
  }

  const handleDelete = (blog: Blog) => {
    setSelectedBlog(blog)
    setShowDeleteModal(true)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadingImage(true)
      uploadImageMutation.mutate(file)
    }
  }

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required")
      return
    }

    const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t.length > 0)

    const data = {
      title,
      slug: slug || undefined, // Auto-generate if not provided
      category: category || undefined,
      excerpt: excerpt || undefined,
      content,
      featured_image_url: featuredImageUrl || undefined,
      author: author || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      is_featured: isFeatured,
      is_published: isPublished,
    }

    if (selectedBlog) {
      updateMutation.mutate({ id: selectedBlog.blog_id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDeleteConfirm = () => {
    if (selectedBlog) {
      deleteMutation.mutate(selectedBlog.blog_id)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const blogs = blogsData?.blogs || []

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Blog Management</h1>
          <p className="text-gray-600">Create, edit, and manage blog posts</p>
        </div>
        <Button onClick={handleAdd} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Blog
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search blogs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterPublished === undefined ? "default" : "outline"}
              onClick={() => setFilterPublished(undefined)}
            >
              All
            </Button>
            <Button
              variant={filterPublished === true ? "default" : "outline"}
              onClick={() => setFilterPublished(true)}
            >
              Published
            </Button>
            <Button
              variant={filterPublished === false ? "default" : "outline"}
              onClick={() => setFilterPublished(false)}
            >
              Draft
            </Button>
          </div>
        </div>
      </Card>

      {/* Blogs List */}
      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : blogs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500">No blogs found</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {blogs.map((blog: Blog) => (
            <Card key={blog.blog_id} className="p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                {blog.featured_image_url && (
                  <div className="relative w-full sm:w-48 h-48 flex-shrink-0 rounded-lg overflow-hidden">
                    <Image
                      src={resolveImageUrl(blog.featured_image_url)}
                      alt={blog.title}
                      fill
                      className="object-cover"
                      unoptimized={true}
                      onError={(e) => {
                        console.error("Failed to load blog image:", blog.featured_image_url)
                        console.error("Image error:", e)
                      }}
                    />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-semibold">{blog.title}</h3>
                        {blog.is_featured && (
                          <Badge variant="default" className="bg-yellow-500">Featured</Badge>
                        )}
                        {blog.is_published ? (
                          <Badge variant="default" className="bg-green-500">
                            <Eye className="w-3 h-3 mr-1" />
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Draft
                          </Badge>
                        )}
                      </div>
                      {blog.category && (
                        <p className="text-sm text-gray-500 mb-2">Category: {blog.category}</p>
                      )}
                      {blog.excerpt && (
                        <p className="text-gray-600 mb-2 line-clamp-2">{blog.excerpt}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {blog.author && <span>By {blog.author}</span>}
                        {blog.read_time && <span>{blog.read_time} min read</span>}
                        {blog.published_date && (
                          <span>Published: {formatDate(blog.published_date)}</span>
                        )}
                        {blog.created_date && (
                          <span>Created: {formatDate(blog.created_date)}</span>
                        )}
                      </div>
                      {blog.tags && blog.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {blog.tags.map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(blog)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(blog)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false)
          setShowEditModal(false)
          resetForm()
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBlog ? "Edit Blog" : "Add New Blog"}</DialogTitle>
            <DialogDescription>
              {selectedBlog ? "Update blog post details" : "Create a new blog post"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Blog title"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug (auto-generated if empty)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="url-friendly-slug"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Roasting Process"
                  list="categories-list"
                />
                {categories && categories.length > 0 && (
                  <datalist id="categories-list">
                    {categories.map((cat: string, idx: number) => (
                      <option key={idx} value={cat} />
                    ))}
                  </datalist>
                )}
              </div>
              <div>
                <Label htmlFor="author">Author</Label>
                <Input
                  id="author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Author name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Short description"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Blog content (HTML supported)"
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <div>
              <Label>Featured Image</Label>
              {imagePreview ? (
                <div className="relative w-full h-48 rounded-lg overflow-hidden mb-2 border">
                  <Image
                    src={resolveImageUrl(imagePreview)}
                    alt="Preview"
                    fill
                    className="object-cover"
                    unoptimized={true}
                    onError={(e) => {
                      console.error("Failed to load image preview:", imagePreview)
                      console.error("Image error:", e)
                    }}
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setImagePreview("")
                      setFeaturedImageUrl("")
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <Label htmlFor="image-upload" className="cursor-pointer">
                    <span className="text-blue-600 hover:text-blue-700">Click to upload</span>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploadingImage}
                    />
                  </Label>
                  {uploadingImage && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_featured"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_featured" className="cursor-pointer">
                  Featured Blog
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_published"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_published" className="cursor-pointer">
                  Publish Now
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddModal(false)
              setShowEditModal(false)
              resetForm()
            }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Blog</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedBlog?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

