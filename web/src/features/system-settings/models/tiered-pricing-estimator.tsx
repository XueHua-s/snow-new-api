/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  type ExtraTokenValues,
  evalExprLocally,
  exprUsesExtraVars,
} from '@/features/pricing/lib/tier-expr'
import { cn } from '@/lib/utils'

import { BILLING_EXTRA_VARS } from '../../pricing/lib/billing-variables'
import { DraftNumberInput } from './tiered-pricing-numbers'

// ---------------------------------------------------------------------------
// Cost estimator
// ---------------------------------------------------------------------------

type EstimatorProps = {
  effectiveExpr: string
}

export function CostEstimator({ effectiveExpr }: EstimatorProps) {
  const { t } = useTranslation()
  const [promptTokens, setPromptTokens] = useState(0)
  const [completionTokens, setCompletionTokens] = useState(0)
  const [extras, setExtras] = useState<ExtraTokenValues>({
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    cacheCreate1hTokens: 0,
    imageTokens: 0,
    imageOutputTokens: 0,
    audioInputTokens: 0,
    audioOutputTokens: 0,
  })

  const usesExtras = useMemo(
    () => exprUsesExtraVars(effectiveExpr),
    [effectiveExpr]
  )

  const result = useMemo(
    () =>
      evalExprLocally(effectiveExpr, promptTokens, completionTokens, extras),
    [effectiveExpr, promptTokens, completionTokens, extras]
  )

  return (
    <div className='bg-muted/30 space-y-3 rounded-md border p-3'>
      <div className='space-y-1'>
        <h4 className='text-sm font-medium'>{t('Token estimator')}</h4>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Enter token counts to preview the estimated cost (excluding group multipliers).'
          )}
        </p>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1'>
          <Label className='text-xs'>{t('Input tokens')}</Label>
          <DraftNumberInput
            min={0}
            value={promptTokens}
            onValueChange={setPromptTokens}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-xs'>{t('Output tokens')}</Label>
          <DraftNumberInput
            min={0}
            value={completionTokens}
            onValueChange={setCompletionTokens}
          />
        </div>
      </div>
      {usesExtras && (
        <div className='grid grid-cols-2 gap-3'>
          {BILLING_EXTRA_VARS.map((variable) => {
            // BILLING_EXTRA_VARS only contains pricing variables; they are
            // guaranteed to have a non-null `field` (the `len` condition-only
            // variable is filtered out). Narrow the type here for safety.
            if (!variable.field) return null
            const stateKey = variable.field.replace(
              'Price',
              'Tokens'
            ) as keyof ExtraTokenValues
            return (
              <div key={variable.key} className='space-y-1'>
                <Label className='text-xs'>{t(variable.shortLabel)}</Label>
                <DraftNumberInput
                  min={0}
                  value={extras[stateKey]}
                  onValueChange={(value) =>
                    setExtras((prev) => ({
                      ...prev,
                      [stateKey]: value,
                    }))
                  }
                />
              </div>
            )
          })}
        </div>
      )}
      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          result.error
            ? 'border-destructive/50 bg-destructive/10 text-destructive'
            : 'border-primary/50 bg-primary/10'
        )}
      >
        {result.error ? (
          <span>
            {t('Expression error')}: {result.error}
          </span>
        ) : (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>
              {t('Estimated quota cost')}: {result.cost.toLocaleString()}
            </span>
            {result.matchedTier && (
              <Badge variant='outline' className='text-xs'>
                {t('Hit tier')}: {result.matchedTier}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
