import React from 'react';
import { Card } from '@douyinfe/semi-ui';

export function ChartCard({
  icon,
  title,
  description,
  badge,
  variant,
  children,
}) {
  return (
    <Card
      bordered={false}
      headerLine={false}
      className={`lb-chart-card !rounded-2xl h-full ${variant ? `lb-chart-${variant}` : ''}`}
      title={
        <div>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2 text-sm font-black sm:text-base'>
              {icon}
              {title}
            </div>
            {badge ? (
              <span className='lb-chart-badge inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black tracking-wider text-blue-600 dark:text-blue-300'>
                <span className='lb-chart-badge-dot' aria-hidden='true' />
                {badge}
              </span>
            ) : null}
          </div>
          <p className='mt-1 text-xs font-normal text-gray-500 sm:text-sm'>
            {description}
          </p>
        </div>
      }
    >
      {children}
    </Card>
  );
}
