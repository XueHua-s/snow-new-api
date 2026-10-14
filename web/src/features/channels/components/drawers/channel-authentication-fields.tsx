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
import { Loader2, Trash2, Copy, Eye, Link2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'

import { FIELD_DESCRIPTIONS } from '../../constants'
import { getKeyPromptForType } from '../../lib'
import { ChannelAuthSection } from './sections'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelAuthenticationFields({
  isEditing,
  form,
  addModeOptions,
  currentType,
  awsKeyType,
  isBatchMode,
  keyMode,
  isMultiKeyChannel,
  handleDeduplicateKeys,
  canRevealChannelKey,
  handleRevealKey,
  isChannelKeyLoading,
  verificationState,
  channelKey,
  copyToClipboard,
  setCodexOAuthDialogOpen,
  sensitiveLocked,
  channelId,
  handleRefreshCodexCredential,
  isCodexCredentialRefreshing,
  setClaudeOAuthDialogOpen,
  multiKeyMode,
  multiKeyType,
}: {
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  form: ReturnType<typeof useChannelEditor>['form']
  addModeOptions: ReturnType<typeof useChannelEditor>['addModeOptions']
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  awsKeyType: ReturnType<typeof useChannelEditor>['awsKeyType']
  isBatchMode: ReturnType<typeof useChannelEditor>['isBatchMode']
  keyMode: ReturnType<typeof useChannelEditor>['keyMode']
  isMultiKeyChannel: ReturnType<typeof useChannelEditor>['isMultiKeyChannel']
  handleDeduplicateKeys: ReturnType<
    typeof useChannelEditor
  >['handleDeduplicateKeys']
  canRevealChannelKey: ReturnType<
    typeof useChannelEditor
  >['canRevealChannelKey']
  handleRevealKey: ReturnType<typeof useChannelEditor>['handleRevealKey']
  isChannelKeyLoading: ReturnType<
    typeof useChannelEditor
  >['isChannelKeyLoading']
  verificationState: ReturnType<typeof useChannelEditor>['verificationState']
  channelKey: ReturnType<typeof useChannelEditor>['channelKey']
  copyToClipboard: ReturnType<typeof useChannelEditor>['copyToClipboard']
  setCodexOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setCodexOAuthDialogOpen']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  channelId: ReturnType<typeof useChannelEditor>['channelId']
  handleRefreshCodexCredential: ReturnType<
    typeof useChannelEditor
  >['handleRefreshCodexCredential']
  isCodexCredentialRefreshing: ReturnType<
    typeof useChannelEditor
  >['isCodexCredentialRefreshing']
  setClaudeOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setClaudeOAuthDialogOpen']
  multiKeyMode: ReturnType<typeof useChannelEditor>['multiKeyMode']
  multiKeyType: ReturnType<typeof useChannelEditor>['multiKeyType']
}) {
  const { t } = useTranslation()
  return (
    <ChannelAuthSection>
      {!isEditing && (
        <FormField
          control={form.control}
          name='multi_key_mode'
          render={({ field }) => (
            <FormItem className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <FormLabel className='text-muted-foreground text-xs font-medium'>
                {t('Add Mode')}
              </FormLabel>
              <Select
                items={addModeOptions.map((option) => ({
                  value: option.value,
                  label: t(option.label),
                }))}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger size='sm' className='w-full sm:w-56'>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {addModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name='key'
        render={({ field }) => {
          let keyPlaceholder = t(getKeyPromptForType(currentType))
          if (isEditing) {
            keyPlaceholder = t('Leave empty to keep existing key')
          } else if (
            currentType === 33 &&
            awsKeyType === 'api_key' &&
            isBatchMode
          ) {
            keyPlaceholder = t(
              'Enter API Key, one per line, format: APIKey|Region'
            )
          } else if (currentType === 33 && awsKeyType === 'api_key') {
            keyPlaceholder = t('Enter API Key, format: APIKey|Region')
          } else if (currentType === 33 && isBatchMode) {
            keyPlaceholder = t(
              'Enter key, one per line, format: AccessKey|SecretAccessKey|Region'
            )
          } else if (currentType === 33) {
            keyPlaceholder = t(
              'Enter key, format: AccessKey|SecretAccessKey|Region'
            )
          } else if (isBatchMode) {
            keyPlaceholder = t('Enter one key per line for batch creation')
          }

          let keyDescription: ReactNode = t(FIELD_DESCRIPTIONS.KEY)
          if (isEditing) {
            let keyModeDescription = t(
              'Append mode: New keys will be added to the end of the existing key list'
            )
            if (keyMode === 'replace') {
              keyModeDescription = t(
                'Replace mode: Will completely replace all existing keys'
              )
            }
            keyDescription = (
              <>
                {t(
                  'Enter new key to update, or leave empty to keep current key'
                )}
                {isMultiKeyChannel && (
                  <span className='text-warning mt-1 block'>
                    {keyModeDescription}
                  </span>
                )}
              </>
            )
          } else if (isBatchMode) {
            keyDescription = t('Enter one API key per line for batch creation')
          }
          return (
            <FormItem>
              <FormLabel>{t('API Key *')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={keyPlaceholder}
                  rows={isBatchMode ? 8 : 4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                <div className='flex flex-col gap-2'>
                  <span>{keyDescription}</span>
                  {isBatchMode && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleDeduplicateKeys}
                      className='w-fit'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      {t('Remove Duplicates')}
                    </Button>
                  )}
                </div>
              </FormDescription>
              {isEditing && canRevealChannelKey && (
                <div className='border-border/60 mt-4 flex flex-col gap-3 border-y border-dashed py-4'>
                  <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                    <div>
                      <p className='text-sm font-medium'>{t('Current key')}</p>
                      <p className='text-muted-foreground text-xs'>
                        {t('Verification required to reveal the saved key.')}
                      </p>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={handleRevealKey}
                        disabled={
                          isChannelKeyLoading || verificationState.loading
                        }
                      >
                        {isChannelKeyLoading || verificationState.loading ? (
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        ) : (
                          <Eye className='mr-2 h-4 w-4' />
                        )}
                        {t('Reveal key')}
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={async () => {
                          if (channelKey) {
                            await copyToClipboard(channelKey)
                          }
                        }}
                        disabled={!channelKey}
                      >
                        <Copy className='mr-2 h-4 w-4' />
                        {t('Copy')}
                      </Button>
                    </div>
                  </div>
                  <Input
                    readOnly
                    value={channelKey ?? ''}
                    placeholder={t('Hidden — verify to reveal')}
                    className='font-mono'
                  />
                </div>
              )}
              <FormMessage />
            </FormItem>
          )
        }}
      />

      {currentType === 57 && (
        <div className='border-border/60 flex flex-col gap-3 border-y py-4'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='text-muted-foreground text-xs'>
              {t('Codex channels use an OAuth JSON credential as the key.')}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setCodexOAuthDialogOpen(true)}
                disabled={sensitiveLocked}
              >
                <Link2 className='mr-2 h-4 w-4' />
                {isEditing ? t('Re-authorize') : t('Authorize')}
              </Button>
              {isEditing && channelId && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleRefreshCodexCredential}
                  disabled={sensitiveLocked || isCodexCredentialRefreshing}
                >
                  {isCodexCredentialRefreshing ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <RefreshCw className='mr-2 h-4 w-4' />
                  )}
                  {isCodexCredentialRefreshing
                    ? t('Refreshing...')
                    : t('Refresh credential')}
                </Button>
              )}
            </div>
          </div>
          <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
            <AlertDescription>
              {t(
                "Disclaimer: Personal use only. Do not distribute or share any credentials. This channel has prerequisites and requires prior setup; use it only if you understand the flow and risks, and comply with OpenAI's terms and policies. Credentials and configuration are for Codex CLI integration only, and are not intended for any other client, platform, or channel."
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {currentType === 61 && (
        <div className='border-border/60 flex flex-col gap-3 border-y py-4'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='text-muted-foreground text-xs'>
              {t(
                'Claude(OAuth) credentials are created through OAuth authorization and used directly against Anthropic.'
              )}
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setClaudeOAuthDialogOpen(true)}
              disabled={sensitiveLocked}
            >
              <Link2 className='mr-2 h-4 w-4' />
              {isEditing ? t('Re-authorize') : t('Authorize')}
            </Button>
          </div>
        </div>
      )}

      {isEditing && isMultiKeyChannel && (
        <FormField
          control={form.control}
          name='key_mode'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Key Update Mode')}</FormLabel>
              <Select
                items={[
                  {
                    value: 'append',
                    label: t('Append to existing keys'),
                  },
                  {
                    value: 'replace',
                    label: t('Replace all existing keys'),
                  },
                ]}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='append'>
                      {t('Append to existing keys')}
                    </SelectItem>
                    <SelectItem value='replace'>
                      {t('Replace all existing keys')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {field.value === 'replace'
                  ? t('Replace mode: Will completely replace all existing keys')
                  : t(
                      'Append mode: New keys will be added to the end of the existing key list'
                    )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {!isEditing && multiKeyMode === 'multi_to_single' && (
        <FormField
          control={form.control}
          name='multi_key_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Multi-Key Strategy')}</FormLabel>
              <Select
                items={[
                  {
                    value: 'random',
                    label: t('Random'),
                  },
                  {
                    value: 'polling',
                    label: t('Polling'),
                  },
                ]}
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='random'>{t('Random')}</SelectItem>
                    <SelectItem value='polling'>{t('Polling')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {multiKeyType === 'polling' ? (
                  <span className='text-warning'>
                    {t(
                      'Polling mode requires Redis and memory cache, otherwise performance will be significantly degraded'
                    )}
                  </span>
                ) : (
                  t('Randomly select a key from the pool for each request')
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </ChannelAuthSection>
  )
}
