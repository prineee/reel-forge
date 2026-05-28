import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface border-surface-border text-gray-400',
  success: 'bg-green-950 border-green-800 text-green-400',
  warning: 'bg-yellow-950 border-yellow-800 text-yellow-400',
  danger: 'bg-red-950 border-red-800 text-red-400',
  info: 'bg-brand-950 border-brand-800 text-brand-300',
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
