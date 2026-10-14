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

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { DeploymentContainerFields } from './deployment-container-fields'
import { useDeploymentForm, toNumber } from './use-deployment-form'

export function CreateDeploymentDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const {
    form,
    hardwareId,
    gpuCount,
    durationHours,
    replicaCount,
    trafficPort,
    isLoadingHardware,
    hardwareOptions,
    isLoadingReplicas,
    locationOptions,
    isCheckingName,
    nameAvailable,
    createMutation,
  } = useDeploymentForm({ open, onOpenChange })
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[600px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Create deployment')}</SheetTitle>
          <SheetDescription>
            {t('Configure and deploy a new container instance.')}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id='deployment-form'
            onSubmit={form.handleSubmit((values) =>
              createMutation.mutate(values)
            )}
            className={sideDrawerFormClassName()}
          >
            {/* Basic Configuration */}
            <SideDrawerSection>
              <h3 className='text-sm font-medium'>
                {t('Basic Configuration')}
              </h3>

              <FormField
                control={form.control}
                name='resource_private_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Container name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('Enter a name')} {...field} />
                    </FormControl>

                    {open && field.value?.trim() && (
                      <div className='text-muted-foreground text-xs'>
                        {isCheckingName && t('Checking name...')}
                        {!isCheckingName && (
                          <>
                            {nameAvailable === true && t('Name is available')}
                            {!(nameAvailable === true) && (
                              <>
                                {nameAvailable === false &&
                                  t('Name is not available')}
                                {!(nameAvailable === false) && ''}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {!(open && field.value?.trim()) && null}

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='image_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Image')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SideDrawerSection>

            {/* Resource Configuration */}
            <SideDrawerSection>
              <h3 className='text-sm font-medium'>
                {t('Resource Configuration')}
              </h3>

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='hardware_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Hardware type')}</FormLabel>
                      <Select
                        items={hardwareOptions.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        value={field.value}
                        onValueChange={(v) => field.onChange(v)}
                        disabled={isLoadingHardware}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder={t('Select')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {hardwareOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='location_ids'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Deployment location')}</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={locationOptions}
                        selected={(field.value || []) as string[]}
                        onChange={(vals) => {
                          if (isLoadingReplicas || !hardwareId) return
                          field.onChange(vals)
                        }}
                        placeholder={
                          isLoadingReplicas
                            ? t('Loading...')
                            : t('Select locations')
                        }
                        className={
                          isLoadingReplicas || !hardwareId
                            ? 'pointer-events-none opacity-60'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='gpus_per_container'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('GPU count')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          value={toNumber(field.value, gpuCount)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='replica_count'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Replica count')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          value={toNumber(field.value, replicaCount)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='duration_hours'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Duration (hours)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          value={toNumber(field.value, durationHours)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='traffic_port'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Port')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          value={toNumber(field.value, trafficPort)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? 0 : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SideDrawerSection>

            {/* Price Estimation */}
            <SideDrawerSection>
              <h3 className='text-sm font-medium'>{t('Price estimation')}</h3>
              <p className='text-muted-foreground text-xs'>
                {t('Price estimation description')}
              </p>

              <FormField
                control={form.control}
                name='currency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Billing currency')}</FormLabel>
                    <Select
                      items={[
                        { value: 'usdc', label: 'USDC' },
                        { value: 'iocoin', label: 'IOCOIN' },
                      ]}
                      value={field.value || 'usdc'}
                      onValueChange={(v) => field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder={t('Select')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value='usdc'>USDC</SelectItem>
                          <SelectItem value='iocoin'>IOCOIN</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </SideDrawerSection>

            {/* Advanced Configuration */}
            <DeploymentContainerFields form={form} />
          </form>
        </Form>

        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </SheetClose>
          <Button
            form='deployment-form'
            type='submit'
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? t('Submitting...') : t('Create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
