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
import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

import { FIELD_PLACEHOLDERS } from '../../constants'
import { CHANNEL_TYPE_ADVANCED_CUSTOM } from '../../lib'
import { AwsConnectionFields } from './aws-connection-fields'
import { AzureConnectionFields } from './azure-connection-fields'
import type { useChannelEditor } from './use-channel-editor'
import { VertexConnectionFields } from './vertex-connection-fields'

export function ChannelProviderFields({
  currentType,
  form,
  vertexKeyType,
  isBatchMode,
  doubaoApiEditUnlocked,
  handleApiConfigSecretClick,
  advancedCustomStats,
  advancedCustomRouteTypeLabels,
  hiddenAdvancedCustomRouteTypeCount,
  advancedCustomRouteTypeTitle,
  setAdvancedCustomEditorOpen,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  form: ReturnType<typeof useChannelEditor>['form']
  vertexKeyType: ReturnType<typeof useChannelEditor>['vertexKeyType']
  isBatchMode: ReturnType<typeof useChannelEditor>['isBatchMode']
  doubaoApiEditUnlocked: ReturnType<
    typeof useChannelEditor
  >['doubaoApiEditUnlocked']
  handleApiConfigSecretClick: ReturnType<
    typeof useChannelEditor
  >['handleApiConfigSecretClick']
  advancedCustomStats: ReturnType<
    typeof useChannelEditor
  >['advancedCustomStats']
  advancedCustomRouteTypeLabels: ReturnType<
    typeof useChannelEditor
  >['advancedCustomRouteTypeLabels']
  hiddenAdvancedCustomRouteTypeCount: ReturnType<
    typeof useChannelEditor
  >['hiddenAdvancedCustomRouteTypeCount']
  advancedCustomRouteTypeTitle: ReturnType<
    typeof useChannelEditor
  >['advancedCustomRouteTypeTitle']
  setAdvancedCustomEditorOpen: ReturnType<
    typeof useChannelEditor
  >['setAdvancedCustomEditorOpen']
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* Azure (type 3) */}
      <AzureConnectionFields currentType={currentType} form={form} />

      {/* Custom (type 8) */}
      {currentType === 8 && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('Full Base URL (supports')} {'{'}
                {t('model')}
                {'}'} {t('variable) *')}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={t(
                    'e.g., https://api.openai.com/v1/chat/completions'
                  )}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Enter the complete URL, supports')} {'{'}
                {t('model')}
                {'}'} {t('variable')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Xunfei/Spark (type 18) */}
      {currentType === 18 && (
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Model Version *')}</FormLabel>
              <FormControl>
                <Input placeholder={t('e.g., v2.1')} {...field} />
              </FormControl>
              <FormDescription>
                {t(
                  'Spark model version, e.g., v2.1 (version number in API URL)'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* OpenRouter (type 20) */}
      {currentType === 20 && (
        <FormField
          control={form.control}
          name='is_enterprise_account'
          render={({ field }) => (
            <FormItem className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <FormLabel>{t('Enterprise Account')}</FormLabel>
                <FormDescription>
                  {t(
                    'Enable if this is an OpenRouter enterprise account with special response format'
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

      {/* AWS (type 33) */}
      <AwsConnectionFields currentType={currentType} form={form} />

      {/* AI Proxy Library (type 21) */}
      {currentType === 21 && (
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Knowledge Base ID *')}</FormLabel>
              <FormControl>
                <Input placeholder={t('e.g., 123456')} {...field} />
              </FormControl>
              <FormDescription>
                {t('Enter the knowledge base ID')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* FastGPT (type 22) */}
      {currentType === 22 && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Private Deployment URL')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('e.g., https://fastgpt.run/api/openapi')}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t(
                  'For private deployments, format: https://fastgpt.run/api/openapi'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* SunoAPI (type 36) */}
      {currentType === 36 && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('API Base URL (Important: Not Chat API) *')}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={t(
                    'e.g., https://api.example.com (path before /suno)'
                  )}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Enter the path before /suno, usually just the domain')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Cloudflare Workers AI (type 39) */}
      {currentType === 39 && (
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Account ID *')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('e.g., d6b5da8hk1awo8nap34ube6gh')}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Your Cloudflare Account ID')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* SiliconFlow (type 40) */}
      {currentType === 40 && (
        <Alert>
          <AlertDescription>
            {t('Referral link:')}{' '}
            <a
              href='https://cloud.siliconflow.cn/i/hij0YNTZ'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary underline'
            >
              {t('https://cloud.siliconflow.cn/i/hij0YNTZ')}
            </a>
          </AlertDescription>
        </Alert>
      )}

      {/* Vertex AI (type 41) */}
      <VertexConnectionFields
        currentType={currentType}
        form={form}
        vertexKeyType={vertexKeyType}
        isBatchMode={isBatchMode}
      />

      {/* VolcEngine (type 45) */}
      {currentType === 45 && !doubaoApiEditUnlocked && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel
                className='cursor-pointer select-none'
                onClick={handleApiConfigSecretClick}
              >
                {t('API Base URL *')}
              </FormLabel>
              <Select
                items={[
                  {
                    value: 'https://ark.cn-beijing.volces.com',
                    label: t('https://ark.cn-beijing.volces.com'),
                  },
                  {
                    value: 'https://ark.ap-southeast.bytepluses.com',
                    label: t('https://ark.ap-southeast.bytepluses.com'),
                  },
                ]}
                onValueChange={field.onChange}
                value={
                  field.value === 'doubao-coding-plan'
                    ? 'https://ark.cn-beijing.volces.com'
                    : field.value || 'https://ark.cn-beijing.volces.com'
                }
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='https://ark.cn-beijing.volces.com'>
                      {t('https://ark.cn-beijing.volces.com')}
                    </SelectItem>
                    <SelectItem value='https://ark.ap-southeast.bytepluses.com'>
                      {t('https://ark.ap-southeast.bytepluses.com')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {t('Select the API endpoint region')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* VolcEngine (type 45) - Custom API URL (unlocked) */}
      {currentType === 45 && doubaoApiEditUnlocked && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('API Base URL *')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('e.g., https://ark.cn-beijing.volces.com')}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Enter custom API endpoint URL')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Coze (type 49) */}
      {currentType === 49 && (
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Agent ID *')}</FormLabel>
              <FormControl>
                <Input placeholder={t('e.g., 7342866812345')} {...field} />
              </FormControl>
              <FormDescription>{t('Enter the Coze agent ID')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* General base_url for other types */}
      {![3, 8, 22, 36, 45].includes(currentType) && (
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Base URL')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t(FIELD_PLACEHOLDERS.BASE_URL)}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Custom API base URL. For official channels, New API has built-in addresses. Only fill this for third-party proxy sites or special endpoints. Do not add /v1 or trailing slash.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {currentType === CHANNEL_TYPE_ADVANCED_CUSTOM && (
        <FormField
          control={form.control}
          name='advanced_custom'
          render={({ field }) => (
            <FormItem className='space-y-3 border-y py-4'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='space-y-2'>
                  <FormLabel>{t('Advanced Custom Routes')}</FormLabel>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='secondary'>
                      {t('Routes')}: {advancedCustomStats.routeCount}
                    </Badge>
                    {advancedCustomRouteTypeLabels.map((label) => (
                      <Badge
                        key={label}
                        variant='outline'
                        className='max-w-[12rem]'
                        title={label}
                      >
                        <span className='truncate'>{label}</span>
                      </Badge>
                    ))}
                    {hiddenAdvancedCustomRouteTypeCount > 0 && (
                      <Badge
                        variant='outline'
                        title={advancedCustomRouteTypeTitle}
                      >
                        +{hiddenAdvancedCustomRouteTypeCount}
                      </Badge>
                    )}
                    {!advancedCustomStats.valid && (
                      <Badge variant='destructive'>{t('Incomplete')}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setAdvancedCustomEditorOpen(true)}
                >
                  <Route className='mr-2 h-4 w-4' />
                  {t('Configure routes')}
                </Button>
              </div>
              <FormControl>
                <input type='hidden' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  )
}
