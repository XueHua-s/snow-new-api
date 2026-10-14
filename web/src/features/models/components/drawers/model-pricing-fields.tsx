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
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SideDrawerSection } from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { PricingMode, PricingSubMode } from './model-mutate-pricing'
import type { useModelMutateForm } from './use-model-mutate-form'

export function ModelPricingFields({
  pricingMode,
  setPricingMode,
  form,
  validateNumber,
  pricingSubMode,
  setPricingSubMode,
  setPromptPrice,
  setCompletionPrice,
  promptPrice,
  handlePromptPriceChange,
  completionPrice,
  handleCompletionPriceChange,
  advancedOpen,
  setAdvancedOpen,
}: {
  pricingMode: ReturnType<typeof useModelMutateForm>['pricingMode']
  setPricingMode: ReturnType<typeof useModelMutateForm>['setPricingMode']
  form: ReturnType<typeof useModelMutateForm>['form']
  validateNumber: ReturnType<typeof useModelMutateForm>['validateNumber']
  pricingSubMode: ReturnType<typeof useModelMutateForm>['pricingSubMode']
  setPricingSubMode: ReturnType<typeof useModelMutateForm>['setPricingSubMode']
  setPromptPrice: ReturnType<typeof useModelMutateForm>['setPromptPrice']
  setCompletionPrice: ReturnType<
    typeof useModelMutateForm
  >['setCompletionPrice']
  promptPrice: ReturnType<typeof useModelMutateForm>['promptPrice']
  handlePromptPriceChange: ReturnType<
    typeof useModelMutateForm
  >['handlePromptPriceChange']
  completionPrice: ReturnType<typeof useModelMutateForm>['completionPrice']
  handleCompletionPriceChange: ReturnType<
    typeof useModelMutateForm
  >['handleCompletionPriceChange']
  advancedOpen: ReturnType<typeof useModelMutateForm>['advancedOpen']
  setAdvancedOpen: ReturnType<typeof useModelMutateForm>['setAdvancedOpen']
}) {
  const { t } = useTranslation()
  return (
    <SideDrawerSection>
      <h3 className='text-sm font-semibold'>{t('Pricing Configuration')}</h3>

      <div className='space-y-4'>
        <Label>{t('Pricing mode')}</Label>
        <RadioGroup
          value={pricingMode}
          onValueChange={(value) => setPricingMode(value as PricingMode)}
        >
          <div className='flex items-center space-x-2'>
            <RadioGroupItem value='per-token' id='per-token' />
            <Label htmlFor='per-token' className='font-normal'>
              {t('Per-token (ratio based)')}
            </Label>
          </div>
          <div className='flex items-center space-x-2'>
            <RadioGroupItem value='per-request' id='per-request' />
            <Label htmlFor='per-request' className='font-normal'>
              {t('Per-request (fixed price)')}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {pricingMode === 'per-request' ? (
        <FormField
          control={form.control}
          name='price'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Fixed price (USD)')}</FormLabel>
              <FormControl>
                <Input
                  type='text'
                  placeholder='0.01'
                  {...field}
                  onChange={(e) => {
                    const value = e.target.value
                    if (validateNumber(value)) {
                      field.onChange(value)
                    }
                  }}
                />
              </FormControl>
              <FormDescription>
                {t('Cost in USD per request, regardless of tokens used.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <>
          <div className='space-y-4'>
            <Label>{t('Input mode')}</Label>
            <RadioGroup
              value={pricingSubMode}
              onValueChange={(value) =>
                setPricingSubMode(value as PricingSubMode)
              }
            >
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='ratio' id='ratio' />
                <Label htmlFor='ratio' className='font-normal'>
                  {t('Ratio mode')}
                </Label>
              </div>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='price' id='price' />
                <Label htmlFor='price' className='font-normal'>
                  {t('Price mode (USD per 1M tokens)')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {pricingSubMode === 'ratio' ? (
            <>
              <FormField
                control={form.control}
                name='ratio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Model ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='1.0'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                            if (value) {
                              setPromptPrice(
                                (Number.parseFloat(value) * 2).toString()
                              )
                            } else {
                              setPromptPrice('')
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value &&
                      !Number.isNaN(Number.parseFloat(field.value))
                        ? `Calculated price: $${(Number.parseFloat(field.value) * 2).toFixed(4)} per 1M tokens`
                        : t('Multiplier for prompt tokens.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='completionRatio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Completion ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='1.0'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                            const ratio = form.getValues('ratio')
                            if (value && ratio) {
                              const compPrice =
                                Number.parseFloat(ratio) *
                                2 *
                                Number.parseFloat(value)
                              setCompletionPrice(compPrice.toString())
                            } else {
                              setCompletionPrice('')
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value &&
                      !Number.isNaN(Number.parseFloat(field.value)) &&
                      promptPrice &&
                      !Number.isNaN(Number.parseFloat(promptPrice))
                        ? `Calculated price: $${(Number.parseFloat(promptPrice) * Number.parseFloat(field.value)).toFixed(4)} per 1M tokens`
                        : t('Multiplier for completion tokens.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label>{t('Prompt price ($/1M tokens)')}</Label>
                <Input
                  type='text'
                  placeholder='2.0'
                  value={promptPrice}
                  onChange={(e) => handlePromptPriceChange(e.target.value)}
                />
                <p className='text-muted-foreground text-sm'>
                  {promptPrice && !Number.isNaN(Number.parseFloat(promptPrice))
                    ? `Calculated ratio: ${(Number.parseFloat(promptPrice) / 2).toFixed(4)}`
                    : t('Enter Input price to calculate ratio')}
                </p>
              </div>

              <div className='space-y-2'>
                <Label>{t('Completion price ($/1M tokens)')}</Label>
                <Input
                  type='text'
                  placeholder='4.0'
                  value={completionPrice}
                  onChange={(e) => handleCompletionPriceChange(e.target.value)}
                />
                <p className='text-muted-foreground text-sm'>
                  {completionPrice &&
                  !Number.isNaN(Number.parseFloat(completionPrice)) &&
                  promptPrice &&
                  !Number.isNaN(Number.parseFloat(promptPrice)) &&
                  Number.parseFloat(promptPrice) > 0
                    ? `Calculated ratio: ${(Number.parseFloat(completionPrice) / Number.parseFloat(promptPrice)).toFixed(4)}`
                    : t('Enter Completion price to calculate ratio')}
                </p>
              </div>
            </div>
          )}

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger
              render={
                <Button
                  type='button'
                  variant='outline'
                  className='flex w-full items-center justify-between'
                />
              }
            >
              {t('Advanced options')}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  advancedOpen ? 'rotate-180' : ''
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className='flex flex-col gap-4 pt-4'>
              <FormField
                control={form.control}
                name='cacheRatio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Cache ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='0.1'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Discount ratio for cache hits.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='imageRatio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Image ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='1.0'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Multiplier for image processing.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='audioRatio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Audio ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='1.0'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Multiplier for audio inputs.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='audioCompletionRatio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Audio completion ratio')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        placeholder='1.0'
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value
                          if (validateNumber(value)) {
                            field.onChange(value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Multiplier for audio outputs.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </SideDrawerSection>
  )
}
