import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ChartCardProps = {
  icon: ReactNode
  title: string
  description: string
  badge?: string
  variant?: 'podium' | 'roadmap' | 'race'
  children: ReactNode
}

export function ChartCard(props: ChartCardProps) {
  return (
    <section
      className={cn(
        'lb-default-card lb-default-chart-card bg-card relative overflow-hidden rounded-2xl',
        props.variant && `lb-default-chart-${props.variant}`
      )}
    >
      <header className='lb-default-chart-header relative z-10 px-4 pt-4 pb-1'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 className='flex items-center gap-2 text-sm font-black sm:text-base'>
            {props.icon}
            {props.title}
          </h2>
          {props.badge ? (
            <span className='lb-default-chart-badge inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black tracking-wider text-blue-600 dark:text-blue-300'>
              <span className='lb-default-chart-badge-dot' aria-hidden />
              {props.badge}
            </span>
          ) : null}
        </div>
        <p className='text-muted-foreground mt-1 text-xs sm:text-sm'>
          {props.description}
        </p>
      </header>
      <div className='lb-default-chart-body relative z-10 px-3 pt-2 pb-4'>
        {props.children}
      </div>
    </section>
  )
}
