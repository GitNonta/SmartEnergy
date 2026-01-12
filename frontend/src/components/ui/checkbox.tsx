import React from 'react'

export function Checkbox({ defaultChecked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      defaultChecked={defaultChecked}
      className="h-4 w-4 rounded border-gray-300"
      {...props}
    />
  )
}