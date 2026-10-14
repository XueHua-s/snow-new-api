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
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { RiskAcknowledgementDialog } from '@/components/risk-acknowledgement-dialog'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { CreemPaymentSettings } from './creem-payment-settings'
import { EpayPaymentSettings } from './epay-payment-settings'
import { GeneralPaymentSettings } from './general-payment-settings'
import { paymentTabContentClassName } from './payment-layout'
import { StripePaymentSettings } from './stripe-payment-settings'
import {
  type PaymentSettingsSectionProps,
  usePaymentSettings,
} from './use-payment-settings'
import { WaffoPancakeSettingsSection } from './waffo-pancake-settings-section'
import { WaffoSettingsSection } from './waffo-settings-section'

export function PaymentSettingsSection({
  defaultValues,
  waffoDefaultValues,
  waffoPancakeDefaultValues,
  waffoPancakeProvisionedStoreID,
  waffoPancakeProvisionedProductID,
  complianceDefaults,
}: PaymentSettingsSectionProps) {
  const { t } = useTranslation()
  const {
    updateOption,
    payMethodsVisualMode,
    setPayMethodsVisualMode,
    amountOptionsVisualMode,
    setAmountOptionsVisualMode,
    amountDiscountVisualMode,
    setAmountDiscountVisualMode,
    creemProductsVisualMode,
    setCreemProductsVisualMode,
    showComplianceDialog,
    setShowComplianceDialog,
    waffoPayMethods,
    setWaffoPayMethods,
    waffoPancakeSelection,
    setWaffoPancakeSelection,
    waffoPancakeSavedBinding,
    complianceStatements,
    complianceRequiredText,
    complianceRequiredTextParts,
    complianceConfirmed,
    confirmComplianceMutation,
    form,
    isSubmitting,
    setWaffoValue,
    setWaffoPancakeValue,
    onSubmit,
    waffoValues,
    waffoPancakeValues,
  } = usePaymentSettings({
    defaultValues,
    waffoDefaultValues,
    waffoPancakeDefaultValues,
    waffoPancakeProvisionedStoreID,
    waffoPancakeProvisionedProductID,
    complianceDefaults,
  })
  return (
    <SettingsSection title={t('Payment Gateway')}>
      {!complianceConfirmed ? (
        <Alert variant='destructive' className='mb-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>{t('Compliance confirmation required')}</AlertTitle>
          <AlertDescription>
            <div className='space-y-3'>
              <p>
                {t(
                  'Payment, redemption codes, subscription plans, and invitation rewards are locked until the root administrator confirms the compliance terms.'
                )}
              </p>
              <ol className='list-decimal space-y-1 pl-5'>
                {complianceStatements.map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ol>
            </div>
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              onClick={() => setShowComplianceDialog(true)}
            >
              {t('Confirm compliance')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <Alert className='mb-6'>
          <AlertTitle>{t('Compliance confirmed')}</AlertTitle>
          <AlertDescription>
            {t('Confirmed at {{time}} by user #{{userId}}', {
              time: complianceDefaults.confirmedAt
                ? new Date(
                    complianceDefaults.confirmedAt * 1000
                  ).toLocaleString()
                : '-',
              userId: complianceDefaults.confirmedBy || '-',
            })}
          </AlertDescription>
        </Alert>
      )}

      <RiskAcknowledgementDialog
        open={showComplianceDialog}
        onOpenChange={setShowComplianceDialog}
        title={t('Confirm compliance terms')}
        description={t(
          'This confirmation unlocks payment, redemption code, subscription plan, and invitation reward features. Please read the statements carefully.'
        )}
        items={complianceStatements}
        requiredText={complianceRequiredText}
        requiredTextParts={complianceRequiredTextParts}
        inputPrompt={t('Please type the following text to confirm:')}
        inputPlaceholder={t('Type the confirmation text here')}
        mismatchHint={t('The entered text does not match the required text.')}
        confirmText={t('Confirm and enable')}
        isLoading={confirmComplianceMutation.isPending}
        onConfirm={() => confirmComplianceMutation.mutate()}
      />

      <Form {...form}>
        <SettingsForm
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            'gap-y-8',
            !complianceConfirmed && 'pointer-events-none opacity-40'
          )}
          data-no-autosubmit='true'
        >
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            saveLabel='Save all settings'
          />
          <Tabs defaultValue='general' className='min-w-0'>
            <div className='overflow-x-auto pb-1'>
              <TabsList className='grid min-w-[44rem] grid-cols-6'>
                <TabsTrigger value='general'>{t('General')}</TabsTrigger>
                <TabsTrigger value='epay'>Epay</TabsTrigger>
                <TabsTrigger value='stripe'>{t('Stripe')}</TabsTrigger>
                <TabsTrigger value='creem'>Creem</TabsTrigger>
                <TabsTrigger value='waffo-pancake'>Waffo Pancake</TabsTrigger>
                <TabsTrigger value='waffo'>Waffo</TabsTrigger>
              </TabsList>
            </div>

            <GeneralPaymentSettings
              form={form}
              setPayMethodsVisualMode={setPayMethodsVisualMode}
              payMethodsVisualMode={payMethodsVisualMode}
              setAmountOptionsVisualMode={setAmountOptionsVisualMode}
              amountOptionsVisualMode={amountOptionsVisualMode}
              setAmountDiscountVisualMode={setAmountDiscountVisualMode}
              amountDiscountVisualMode={amountDiscountVisualMode}
            />

            <EpayPaymentSettings form={form} />

            <StripePaymentSettings form={form} />

            <CreemPaymentSettings
              form={form}
              setCreemProductsVisualMode={setCreemProductsVisualMode}
              creemProductsVisualMode={creemProductsVisualMode}
            />

            <TabsContent
              value='waffo-pancake'
              className={paymentTabContentClassName}
            >
              <WaffoPancakeSettingsSection
                defaultValues={waffoPancakeDefaultValues}
                values={waffoPancakeValues}
                onValueChange={setWaffoPancakeValue}
                selectedBinding={waffoPancakeSelection}
                savedBinding={waffoPancakeSavedBinding}
                onSelectedBindingChange={setWaffoPancakeSelection}
              />
            </TabsContent>

            <TabsContent value='waffo' className={paymentTabContentClassName}>
              <WaffoSettingsSection
                values={waffoValues}
                onValueChange={setWaffoValue}
                payMethods={waffoPayMethods}
                onPayMethodsChange={setWaffoPayMethods}
              />
            </TabsContent>
          </Tabs>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
