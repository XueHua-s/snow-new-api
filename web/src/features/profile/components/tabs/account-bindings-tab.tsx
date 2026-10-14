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
import { Link2, Unlink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import { EmailBindDialog } from '../dialogs/email-bind-dialog'
import { TelegramBindDialog } from '../dialogs/telegram-bind-dialog'
import { WeChatBindDialog } from '../dialogs/wechat-bind-dialog'
import {
  type AccountBindingsTabProps,
  useAccountBindings,
} from './use-account-bindings'

export function AccountBindingsTab({
  profile,
  onUpdate,
}: AccountBindingsTabProps) {
  const { t } = useTranslation()
  const {
    loading,
    dialogs,
    status,
    unbindTarget,
    setUnbindTarget,
    unbinding,
    customProviders,
    customBindingsByProviderId,
    handleUnbindCustom,
    handleBindCustomOAuth,
    bindings,
  } = useAccountBindings({ profile, onUpdate })
  if (!profile || loading) return null

  return (
    <>
      <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3'>
        {bindings.map((binding) => {
          let actionLabel = t('Bind')
          if (binding.isBound && binding.id === 'email') {
            actionLabel = t('Change')
          } else if (binding.isBound) {
            actionLabel = t('Bound')
          }

          return (
            <div
              key={binding.id}
              className='flex items-center justify-between gap-2.5 rounded-lg border p-2.5 sm:gap-3 sm:p-3'
            >
              <div className='flex min-w-0 items-center gap-2.5 sm:gap-3'>
                <div className='bg-muted shrink-0 rounded-md p-1.5 sm:p-2'>
                  <binding.icon className='h-4 w-4' />
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-1.5'>
                    <p className='text-sm font-medium'>{binding.label}</p>
                    {binding.isBound && (
                      <StatusBadge
                        label={t('Bound')}
                        variant='success'
                        copyable={false}
                      />
                    )}
                  </div>
                  <p className='text-muted-foreground truncate text-xs'>
                    {binding.value || t('Not bound')}
                  </p>
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='h-7 shrink-0 px-2.5 text-xs'
                onClick={binding.onBind}
                disabled={binding.isBound && binding.id !== 'email'}
              >
                {actionLabel}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Custom OAuth Bindings */}
      {customProviders && customProviders.length > 0 && (
        <>
          <Separator className='my-4' />
          <p className='text-muted-foreground mb-3 text-sm font-medium'>
            {t('Custom OAuth')}
          </p>
          <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3'>
            {customProviders.map((provider) => {
              const binding = customBindingsByProviderId.get(provider.id)
              const isBound = !!binding
              return (
                <div
                  key={provider.id}
                  className='flex items-center justify-between gap-2.5 rounded-lg border p-2.5 sm:gap-3 sm:p-3'
                >
                  <div className='flex min-w-0 items-center gap-2.5 sm:gap-3'>
                    <div className='bg-muted shrink-0 rounded-md p-1.5 sm:p-2'>
                      <Link2 className='h-4 w-4' />
                    </div>
                    <div className='min-w-0'>
                      <div className='flex items-center gap-1.5'>
                        <p className='text-sm font-medium'>{provider.name}</p>
                        {isBound && (
                          <StatusBadge
                            label={t('Bound')}
                            variant='success'
                            copyable={false}
                          />
                        )}
                      </div>
                      <p className='text-muted-foreground truncate text-xs'>
                        {isBound
                          ? binding?.provider_user_id || t('Bound')
                          : t('Not bound')}
                      </p>
                    </div>
                  </div>
                  {isBound ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive h-7 shrink-0 px-2.5 text-xs'
                      onClick={() => setUnbindTarget(binding)}
                    >
                      <Unlink className='mr-1 h-3 w-3' />
                      {t('Unbind')}
                    </Button>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-7 shrink-0 px-2.5 text-xs'
                      onClick={() => handleBindCustomOAuth(provider)}
                    >
                      {t('Bind')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Custom OAuth Unbind Confirmation */}
      <ConfirmDialog
        open={!!unbindTarget}
        onOpenChange={(open) => !open && setUnbindTarget(null)}
        title={t('Confirm Unbind')}
        desc={t(
          'Are you sure you want to unbind {{provider}}? You will no longer be able to log in via this method.',
          {
            provider: unbindTarget?.provider_name || '',
          }
        )}
        confirmText={t('Confirm Unbind')}
        destructive
        handleConfirm={handleUnbindCustom}
        isLoading={unbinding}
      />

      {/* Email Bind Dialog */}
      <EmailBindDialog
        open={dialogs.isOpen('email')}
        onOpenChange={(open) =>
          open ? dialogs.open('email') : dialogs.close('email')
        }
        currentEmail={profile.email}
        onSuccess={onUpdate}
      />

      {/* WeChat Bind Dialog */}
      <WeChatBindDialog
        open={dialogs.isOpen('wechat')}
        qrCodeUrl={
          typeof status?.wechat_qrcode === 'string' ? status.wechat_qrcode : ''
        }
        onOpenChange={(open) =>
          open ? dialogs.open('wechat') : dialogs.close('wechat')
        }
        onSuccess={onUpdate}
      />

      {/* Telegram Bind Dialog */}
      {status?.telegram_bot_name && (
        <TelegramBindDialog
          open={dialogs.isOpen('telegram')}
          onOpenChange={(open) =>
            open ? dialogs.open('telegram') : dialogs.close('telegram')
          }
          botName={status.telegram_bot_name as string}
          onSuccess={onUpdate}
        />
      )}
    </>
  )
}
