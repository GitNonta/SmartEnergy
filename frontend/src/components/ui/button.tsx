import React from 'react'

export function Button({ 
  children, 
  variant = 'default',
  size = 'default',
  className = '',
  ...props 
}: {
  children: React.ReactNode
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg'
  className?: string
  [key: string]: any
}) {
  const baseStyle = 'inline-flex items-center justify-center rounded-md font-medium transition-colors'
  const variantStyles = {
    default: 'bg-blue-500 text-white hover:bg-blue-600',
    ghost: 'hover:bg-gray-100',
    outline: 'border border-gray-300 hover:bg-gray-50'
  }
  const sizeStyles = {
    default: 'px-4 py-2',
    sm: 'px-3 py-1 text-sm',
    lg: 'px-6 py-3'
  }
  
  return (
    <button 
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}