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
import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { sideDrawerSectionClassName } from '@/components/drawer-layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  FormControl,
  FormDescription,
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { ResponsesWebSocketSetting } from '../responses-websocket-setting'
import { CardHeading } from './channel-editor-controls'
import { ADVANCED_SETTINGS_SECTION_IDS } from './channel-editor-state'
import { configuredAdvancedSectionClassName } from './channel-section-style'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelTransportFields({
  extraSettingsConfigured,
  sensitiveLocked,
  currentType,
  isSubmitting,
  form,
  currentHttpProtocol,
}: {
  extraSettingsConfigured: ReturnType<
    typeof useChannelEditor
  >['extraSettingsConfigured']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  isSubmitting: ReturnType<typeof useChannelEditor>['isSubmitting']
  form: ReturnType<typeof useChannelEditor>['form']
  currentHttpProtocol: ReturnType<
    typeof useChannelEditor
  >['currentHttpProtocol']
}) {
  const { t } = useTranslation()
  return (
    <div
      id={ADVANCED_SETTINGS_SECTION_IDS.extraSettings}
      className={sideDrawerSectionClassName(
        configuredAdvancedSectionClassName(
          'scroll-mt-4',
          extraSettingsConfigured
        )
      )}
    >
      <CardHeading
        title={t('Channel Extra Settings')}
        icon={<Settings className='h-4 w-4' />}
        iconTone='chart-3'
      />
      {sensitiveLocked && (
        <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
          <AlertDescription>
            {t('No permission to perform this action')}
          </AlertDescription>
        </Alert>
      )}
      <fieldset
        disabled={sensitiveLocked}
        className='space-y-4 disabled:opacity-60'
      >
        <div className='divide-border space-y-0 divide-y border-y'>
          <ResponsesWebSocketSetting
            channelType={currentType}
            disabled={sensitiveLocked || isSubmitting}
          />
          {currentType === 1 && (
            <FormField
              control={form.control}
              name='force_format'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between px-4 py-3'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('Force Format')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Force format response to OpenAI standard (OpenAI channel only)'
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name='thinking_to_content'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Thinking to Content')}</FormLabel>
                  <FormDescription>
                    {t('Convert reasoning_content to <think> tag in content')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='pass_through_body_enabled'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Pass Through Body')}</FormLabel>
                  <FormDescription>
                    {t('Pass request body directly to upstream')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='disable_task_polling_sleep'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Skip async task polling delay')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Do not wait one second between polling async tasks for this channel'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='proxy'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Proxy Address')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('socks5://user:pass@host:port')}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Network proxy for this channel (supports HTTP, HTTPS, SOCKS5, and SOCKS5H)'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='http_protocol'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('HTTP Protocol')}</FormLabel>
              <Select
                items={[
                  {
                    value: 'auto',
                    label: t('Auto'),
                  },
                  {
                    value: 'http1',
                    label: t('HTTP/1.1'),
                  },
                ]}
                value={field.value || 'auto'}
                onValueChange={(value) => {
                  const nextProtocol = value === 'http1' ? 'http1' : 'auto'
                  field.onChange(nextProtocol)
                  if (nextProtocol === 'http1') {
                    form.setValue('http2_connection_shards', 1, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='auto'>{t('Auto')}</SelectItem>
                    <SelectItem value='http1'>{t('HTTP/1.1')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {t(
                  'Auto negotiates HTTP/2 when available. HTTP/1.1 forces multiple keep-alive connections under concurrency.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='http2_connection_shards'
          render={({ field }) => {
            const http1Selected = currentHttpProtocol === 'http1'
            const shardItems = Array.from({ length: 8 }, (_, index) => {
              const value = String(index + 1)
              return { value, label: value }
            })
            return (
              <FormItem>
                <FormLabel>{t('HTTP/2 Connection Shards')}</FormLabel>
                <Select
                  items={shardItems}
                  value={String(field.value || 1)}
                  disabled={http1Selected}
                  onValueChange={(value) => {
                    field.onChange(Number(value))
                  }}
                >
                  <FormControl>
                    <SelectTrigger disabled={http1Selected}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {shardItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {http1Selected
                    ? t(
                        'HTTP/2 connection shards are unavailable when HTTP/1.1 is selected.'
                      )
                    : t(
                        'Spread HTTP/2 traffic across multiple reusable connections to the same upstream origin (1-8).'
                      )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )
          }}
        />

        <FormField
          control={form.control}
          name='system_prompt'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('System Prompt')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t(
                    'Enter system prompt (user prompt takes priority)'
                  )}
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Default system prompt for this channel')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='system_prompt_override'
          render={({ field }) => (
            <FormItem className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <FormLabel>{t('System Prompt Concatenation')}</FormLabel>
                <FormDescription>
                  {t(
                    'Concatenate channel system prompt with user&apos;s prompt'
                  )}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </fieldset>
    </div>
  )
}
