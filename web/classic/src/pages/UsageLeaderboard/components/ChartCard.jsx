import React from 'react';
import { Card } from '@douyinfe/semi-ui';

export function ChartCard({ icon, title, description, variant, children }) {
  return (
    <Card
      bordered={false}
      headerLine={false}
      className={`lb-chart-card !rounded-2xl h-full ${variant ? `lb-chart-${variant}` : ''}`}
      title={
        <div>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-2 text-sm font-black sm:text-base'>
              {icon}
              {title}
            </div>
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
