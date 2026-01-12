import React from 'react'

export function Select({ 
  value, 
  onValueChange, 
  children, 
  className = '' 
}: {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select 
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={`border rounded-md px-3 py-2 bg-white ${className}`}
    >
      {children}
    </select>
  )
}

export function SelectItem({ value, children }: { value: string, children: React.ReactNode }) {
  return (
    <option value={value}>{children}</option>
  )
}

// Since we won't need these in our simplified version, we'll make them no-ops
export const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const SelectTrigger = SelectContent
export const SelectValue = SelectContent