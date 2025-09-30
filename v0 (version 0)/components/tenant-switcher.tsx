"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Tenant {
  id: string
  name: string
  slug: string
  role: string
}

interface TenantSwitcherProps {
  tenants: Tenant[]
  currentTenant: Tenant | null
  onTenantChange: (tenant: Tenant) => void
  onCreateTenant: (name: string) => Promise<void>
}

export function TenantSwitcher({ tenants, currentTenant, onTenantChange, onCreateTenant }: TenantSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [showNewTenantDialog, setShowNewTenantDialog] = useState(false)
  const [newTenantName, setNewTenantName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return

    setIsCreating(true)
    try {
      await onCreateTenant(newTenantName.trim())
      setNewTenantName("")
      setShowNewTenantDialog(false)
    } catch (error) {
      console.error("Failed to create tenant:", error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={showNewTenantDialog} onOpenChange={setShowNewTenantDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select a tenant"
            className="w-[200px] justify-between bg-transparent"
          >
            {currentTenant ? currentTenant.name : "Select organization..."}
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandList>
              <CommandInput placeholder="Search organizations..." />
              <CommandEmpty>No organization found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                {tenants.map((tenant) => (
                  <CommandItem
                    key={tenant.id}
                    onSelect={() => {
                      onTenantChange(tenant)
                      setOpen(false)
                    }}
                    className="text-sm"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{tenant.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground capitalize">{tenant.role}</span>
                        <Check
                          className={cn("h-4 w-4", currentTenant?.id === tenant.id ? "opacity-100" : "opacity-0")}
                        />
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false)
                      setShowNewTenantDialog(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Organization
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Add a new organization to manage your synthetic data generation projects.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Organization name</Label>
            <Input
              id="name"
              placeholder="Acme Inc."
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewTenantDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateTenant} disabled={isCreating || !newTenantName.trim()}>
            {isCreating ? "Creating..." : "Create Organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
