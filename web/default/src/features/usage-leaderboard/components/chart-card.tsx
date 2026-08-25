import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ChartCardProps = {
  icon: ReactNode
  title: string
  description: string
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
        <div className='flex items-center gap-2'>
          <h2 className='flex items-center gap-2 text-sm font-black sm:text-base'>
            {props.icon}
            {props.title}
          </h2>
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
