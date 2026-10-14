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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'

import {
  createPlan,
  updatePlan,
  getGroups,
  createWaffoPancakeSubscriptionProduct,
  listWaffoPancakeSubscriptionProductOptions,
} from '../api'
import { getDurationUnitOptions, getResetPeriodOptions } from '../constants'
import {
  getPlanFormSchema,
  PLAN_FORM_DEFAULTS,
  planToFormValues,
  formValuesToPlanPayload,
  type PlanFormValues,
} from '../lib/plan-form'
import type { PlanRecord } from '../types'
import { useSubscriptions } from './subscriptions-provider'

export interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: PlanRecord
}

export function useSubscriptionForm({ open, onOpenChange, currentRow }: Props) {
  const { t } = useTranslation()
  const isEdit = !!currentRow?.plan?.id
  const { triggerRefresh } = useSubscriptions()
  const { meta: currencyMeta } = getCurrencyDisplay()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const currencyLabel = getCurrencyLabel()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [creatingPancakeProduct, setCreatingPancakeProduct] = useState(false)
  const [pancakeProducts, setPancakeProducts] = useState<
    { id: string; name: string; status: string }[]
  >([])

  const schema = getPlanFormSchema(t)
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<PlanFormValues>,
    defaultValues: PLAN_FORM_DEFAULTS,
  })

  useEffect(() => {
    if (open) {
      if (currentRow?.plan) {
        form.reset(planToFormValues(currentRow.plan))
      } else {
        form.reset(PLAN_FORM_DEFAULTS)
      }
      getGroups()
        .then((res) => {
          if (res.success) setGroupOptions(res.data || [])
        })
        .catch(() => {})
      // Best-effort — empty list still lets the operator use "+ Create".
      listWaffoPancakeSubscriptionProductOptions()
        .then((res) => {
          if (
            res.message === 'success' &&
            typeof res.data === 'object' &&
            res.data &&
            Array.isArray((res.data as { products?: unknown }).products)
          ) {
            setPancakeProducts(
              (res.data as { products: typeof pancakeProducts }).products
            )
          } else {
            setPancakeProducts([])
          }
        })
        .catch(() => setPancakeProducts([]))
    }
  }, [open, currentRow, form])

  const durationUnit = form.watch('duration_unit')
  const resetPeriod = form.watch('quota_reset_period')
  // Gate "+ Create on Pancake" on the same checks the mint handler runs.
  const watchedTitle = form.watch('title')
  const watchedPrice = form.watch('price_amount')
  const pancakeCreateReady =
    typeof watchedTitle === 'string' &&
    watchedTitle.trim().length > 0 &&
    Number(watchedPrice ?? 0) > 0

  const onSubmit = async (values: PlanFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = formValuesToPlanPayload(values)
      if (isEdit && currentRow?.plan?.id) {
        const res = await updatePlan(currentRow.plan.id, payload)
        if (res.success) {
          toast.success(t('Update succeeded'))
          onOpenChange(false)
          triggerRefresh()
        }
      } else {
        const res = await createPlan(payload)
        if (res.success) {
          toast.success(t('Create succeeded'))
          onOpenChange(false)
          triggerRefresh()
        }
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Mints a Pancake OnetimeProduct (not SubscriptionProduct — see
  // controller) using persisted creds + the form's title/price, then
  // pins the returned PROD_ ID into the form field.
  const handleCreatePancakeProduct = async () => {
    const title = form.getValues('title').trim()
    const priceAmount = Number(form.getValues('price_amount') || 0)
    if (!title) {
      toast.error(t('Plan title is required'))
      return
    }
    if (priceAmount <= 0) {
      toast.error(t('Plan price must be greater than zero'))
      return
    }
    setCreatingPancakeProduct(true)
    try {
      const res = await createWaffoPancakeSubscriptionProduct({
        name: title,
        amount: priceAmount.toFixed(2),
      })
      if (
        res.message === 'success' &&
        typeof res.data === 'object' &&
        res.data
      ) {
        const created = res.data as { product_id: string; product_name: string }
        form.setValue('waffo_pancake_product_id', created.product_id, {
          shouldDirty: true,
        })
        // Refetch from GraphQL so the dropdown reflects authoritative state.
        try {
          const refresh = await listWaffoPancakeSubscriptionProductOptions()
          if (
            refresh.message === 'success' &&
            typeof refresh.data === 'object' &&
            refresh.data &&
            Array.isArray((refresh.data as { products?: unknown }).products)
          ) {
            setPancakeProducts(
              (refresh.data as { products: typeof pancakeProducts }).products
            )
          }
        } catch {
          // Best-effort — form value already points at the new product;
          // raw-ID fallback covers the missing label.
        }
        toast.success(
          `${t('Waffo Pancake product created')}: ${created.product_id}`
        )
      } else {
        const reason = typeof res.data === 'string' ? res.data : undefined
        toast.error(
          reason
            ? `${t('Waffo Pancake product creation failed')}: ${reason}`
            : t('Waffo Pancake product creation failed')
        )
      }
    } catch (err) {
      toast.error(
        `${t('Waffo Pancake product creation failed')}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setCreatingPancakeProduct(false)
    }
  }

  const durationUnitOpts = getDurationUnitOptions(t)
  const resetPeriodOpts = getResetPeriodOptions(t)

  return {
    isEdit,
    tokensOnly,
    currencyLabel,
    isSubmitting,
    groupOptions,
    creatingPancakeProduct,
    pancakeProducts,
    form,
    durationUnit,
    resetPeriod,
    pancakeCreateReady,
    onSubmit,
    handleCreatePancakeProduct,
    durationUnitOpts,
    resetPeriodOpts,
  }
}
