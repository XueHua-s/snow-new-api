import { Medal, RefreshCw, TrendingDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function LeaderboardLoading() {
  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-28 rounded-xl' />
        ))}
      </div>
      <div className='grid gap-4 xl:grid-cols-[1.3fr_0.7fr]'>
        <Skeleton className='h-[520px] rounded-xl' />
        <Skeleton className='h-[520px] rounded-xl' />
      </div>
      <Skeleton className='h-[440px] rounded-xl' />
    </div>
  )
}

export function LeaderboardError(props: {
  message: string
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className='lb-default-state bg-card relative overflow-hidden rounded-2xl px-6 py-14 text-center'>
      <TrendingDown
        className='text-muted-foreground mx-auto size-8'
        aria-hidden
      />
      <h2 className='mt-3 font-bold'>
        {t('The leaderboard is taking a short breather')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-1 max-w-md text-sm'>
        {props.message}
      </p>
      <Button className='mt-4' onClick={props.onRetry}>
        <RefreshCw className='size-4' aria-hidden />
        {t('Try again')}
      </Button>
    </div>
  )
}

export function LeaderboardEmpty() {
  const { t } = useTranslation()

  return (
    <div className='lb-default-state bg-card relative overflow-hidden rounded-2xl px-6 py-16 text-center'>
      <Medal className='mx-auto size-10 text-amber-500' aria-hidden />
      <h2 className='mt-3 text-lg font-black'>
        {t('Be the first name on the board')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
        {t(
          'Your first effective call is your entry declaration. The empty throne is waiting.'
        )}
      </p>
    </div>
  )
}
