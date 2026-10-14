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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  type Props,
  useWaffoPancake,
  PANCAKE_DASHBOARD_URL,
  DEFAULT_NEW_PAIR_NAME,
} from './use-waffo-pancake'

export function WaffoPancakeSettingsSection({
  defaultValues,
  values,
  onValueChange,
  selectedBinding,
  savedBinding,
  onSelectedBindingChange,
}: Props) {
  const { t } = useTranslation()
  const {
    creatingPair,
    chosenStoreID,
    chosenProductID,
    storeID,
    productID,
    returnURL,
    storeSelectItems,
    productSelectItems,
    handleCreatePair,
    verifying,
    credsReady,
    hasCatalog,
    bindStatusMessage,
  } = useWaffoPancake({
    defaultValues,
    values,
    onValueChange,
    selectedBinding,
    savedBinding,
    onSelectedBindingChange,
  })
  return (
    <div className='space-y-4 pt-4'>
      <div>
        <h3 className='text-lg font-medium'>{t('Waffo Pancake MoR')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Start collecting payments globally without registering a company. Built for indie developers, OPC sole proprietorships, and startups. Waffo Pancake acts as your Merchant of Record, taking on the compliance burden of global payment collection — consumption tax, invoicing, subscription management, refunds, and chargebacks. Solo developers can launch fast and stay focused on product instead of compliance. Onboard in minutes — one prompt to a full integration.'
          )}
        </p>
      </div>
      <div className='grid min-w-0 gap-x-5 gap-y-4 lg:grid-cols-2'>
        {/* Blue box — webhook configuration only. */}
        <div className='rounded-md bg-blue-50 p-4 text-sm text-blue-900 lg:col-span-2 dark:bg-blue-950 dark:text-blue-100'>
          <p className='mb-2 font-medium'>{t('Webhook Configuration:')}</p>
          <ul className='list-inside list-disc space-y-1'>
            <li>
              {t('Webhook URL (Test):')}{' '}
              <code className='rounded bg-blue-100 px-1 py-0.5 text-xs dark:bg-blue-900'>
                {'<ServerAddress>/api/waffo-pancake/webhook/test'}
              </code>
            </li>
            <li>
              {t('Webhook URL (Production):')}{' '}
              <code className='rounded bg-blue-100 px-1 py-0.5 text-xs dark:bg-blue-900'>
                {'<ServerAddress>/api/waffo-pancake/webhook/prod'}
              </code>
            </li>
            <li>
              {t(
                'Register each URL into the matching Test Mode / Production Mode webhook slot in the Pancake dashboard. Separate endpoints prevent test traffic from accidentally crediting production accounts.'
              )}
            </li>
            <li>
              {t('Configure at:')}{' '}
              <a
                href={PANCAKE_DASHBOARD_URL}
                target='_blank'
                rel='noreferrer'
                className='underline hover:no-underline'
              >
                {t('Waffo Pancake Dashboard')}
              </a>
            </li>
          </ul>
        </div>

        <div className='grid gap-1.5'>
          <Label>{t('Merchant ID')}</Label>
          <Input
            placeholder='MER_xxx'
            autoComplete='off'
            value={values.WaffoPancakeMerchantID}
            onChange={(event) =>
              onValueChange('WaffoPancakeMerchantID', event.target.value)
            }
          />
        </div>

        <div className='grid gap-1.5'>
          <Label>{t('API Private Key')}</Label>
          <Textarea
            rows={4}
            placeholder={t('Leave blank to keep the existing key')}
            autoComplete='new-password'
            value={values.WaffoPancakePrivateKey}
            onChange={(event) =>
              onValueChange('WaffoPancakePrivateKey', event.target.value)
            }
            className='font-mono text-xs'
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'The environment (test vs production) is decided by the key you paste here — use the Test key while integrating, then swap to the Production key when going live.'
            )}
          </p>
        </div>

        {/*
          Binding section — split into two visually distinct paths:
          (A) "Use existing" pair from the loaded catalog — only rendered when
              the merchant actually has stores, so first-time setup isn't
              cluttered by dead dropdowns.
          (B) "Create a fresh pair" — always available, paired with the
              return URL field that's only meaningful here.
          The two paths are split by an "or" divider so the operator never has
          to wonder which field belongs to which intent.
        */}
        <div className='space-y-4 pt-2 lg:col-span-2'>
          <div>
            <h4 className='font-medium'>
              {t('Bind a Pancake store + product')}
            </h4>
            <p className='text-muted-foreground text-xs'>{bindStatusMessage}</p>
          </div>

          {/*
              Operator-facing explainer: why only ONE store + product needs
              to be bound at the gateway level, and what each piece is used
              for. Subscriptions reuse the same Store but get their own
              per-plan product, configured in the Subscriptions admin.
            */}
          <div className='rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100'>
            <p className='mb-1 font-medium'>
              {t('Why only one store + product?')}
            </p>
            <ul className='list-inside list-disc space-y-1'>
              <li>
                {t(
                  'The bound Store is the parent container for every Pancake product new-api creates from this admin — both the wallet top-up product and any subscription-plan products. One store is enough; pin a different one only if you genuinely run separate Pancake catalogs.'
                )}
              </li>
              <li>
                {t(
                  'The bound Product powers wallet top-ups: when a user enters any amount, new-api runs the checkout against this single Pancake product and overrides the price per session — no need to pre-create $1 / $5 / $10 SKUs.'
                )}
              </li>
              <li>
                {t(
                  'Subscription plans do NOT use the bound Product — each plan has its own dedicated Pancake product, set in the Subscriptions admin (or auto-minted via the "+ Create" button there).'
                )}
              </li>
            </ul>
          </div>

          {/* Create section — first, since creating auto-fills the pick-existing dropdowns below. */}
          <div className='space-y-1.5'>
            <Label>{t('Payment return URL')}</Label>
            <div className='flex gap-2'>
              <Input
                placeholder='https://example.com/wallet'
                value={returnURL}
                onChange={(event) =>
                  onValueChange('WaffoPancakeReturnURL', event.target.value)
                }
                className='flex-1'
              />
              <Button
                type='button'
                variant='outline'
                onClick={handleCreatePair}
                disabled={creatingPair || verifying || !credsReady}
                className='shrink-0'
              >
                {creatingPair
                  ? t('Creating...')
                  : `+ ${t('Create')} ${DEFAULT_NEW_PAIR_NAME}`}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                "Used as SuccessURL on the new product. You'll be prompted to confirm if left blank."
              )}
            </p>
          </div>

          {hasCatalog ? (
            <>
              <div className='relative flex items-center py-1'>
                <div className='flex-1 border-t' />
                <span className='text-muted-foreground px-3 text-[10px] font-medium tracking-[0.2em] uppercase'>
                  {t('or pick existing')}
                </span>
                <div className='flex-1 border-t' />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='grid gap-1.5'>
                  <Label>{t('Store')}</Label>
                  <Select
                    items={storeSelectItems}
                    value={chosenStoreID}
                    onValueChange={(value) => {
                      // Base UI Select can deliver null on deselect.
                      onSelectedBindingChange({
                        storeID: value ?? '',
                        productID: '',
                      })
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select a store')} />
                    </SelectTrigger>
                    <SelectContent>
                      {storeSelectItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='grid gap-1.5'>
                  <Label>{t('Product')}</Label>
                  <Select
                    items={productSelectItems}
                    value={chosenProductID}
                    onValueChange={(value) =>
                      onSelectedBindingChange((previous) => ({
                        ...previous,
                        productID: value ?? '',
                      }))
                    }
                    disabled={!chosenStoreID || productSelectItems.length === 0}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select a product')} />
                    </SelectTrigger>
                    <SelectContent>
                      {productSelectItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          <div className='flex items-center gap-3'>
            {storeID || productID ? (
              <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                {storeID ? (
                  <span>
                    {t('Bound store:')}{' '}
                    <code className='bg-muted rounded px-1 py-0.5'>
                      {storeID}
                    </code>
                  </span>
                ) : null}
                {productID ? (
                  <span>
                    {t('Bound product:')}{' '}
                    <code className='bg-muted rounded px-1 py-0.5'>
                      {productID}
                    </code>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export {
  type WaffoPancakeSettingsValues,
  type WaffoPancakeBinding,
} from './use-waffo-pancake'
