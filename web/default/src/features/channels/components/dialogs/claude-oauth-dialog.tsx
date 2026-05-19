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
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Copy, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { tryPrettyJson } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { completeClaudeOAuth, startClaudeOAuth } from '../../api'

type ClaudeOAuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onKeyGenerated: (key: string) => void
}

export function ClaudeOAuthDialog({
  open,
  onOpenChange,
  onKeyGenerated,
}: ClaudeOAuthDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })

  const [state, setState] = useState({
    authorizeUrl: '',
    callbackUrl: '',
    isStarting: false,
    isCompleting: false,
  })

  useEffect(() => {
    if (!open) {
      setState({
        authorizeUrl: '',
        callbackUrl: '',
        isStarting: false,
        isCompleting: false,
      })
    }
  }, [open])

  const canCopyAuthorizeUrl = Boolean(state.authorizeUrl && !state.isStarting)
  const canComplete = useMemo(
    () => Boolean(state.callbackUrl.trim()) && !state.isCompleting,
    [state.callbackUrl, state.isCompleting]
  )

  const handleStart = async () => {
    setState((prev) => ({ ...prev, isStarting: true }))
    try {
      const res = await startClaudeOAuth()
      if (!res.success) {
        throw new Error(res.message || 'Failed to start OAuth')
      }

      const url = res.data?.authorize_url || ''
      if (!url) {
        throw new Error('Missing authorize_url in response')
      }

      setState((prev) => ({ ...prev, authorizeUrl: url }))
      try {
        window.open(url, '_blank', 'noopener,noreferrer')
        toast.success(t('Opened authorization page'))
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to open authorization page:', error)
        toast.warning(t('Please manually copy and open the authorization link'))
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('OAuth start failed')
      )
    } finally {
      setState((prev) => ({ ...prev, isStarting: false }))
    }
  }

  const handleComplete = async () => {
    if (!state.callbackUrl.trim()) return
    setState((prev) => ({ ...prev, isCompleting: true }))
    try {
      const res = await completeClaudeOAuth(state.callbackUrl.trim())
      if (!res.success) {
        throw new Error(res.message || 'OAuth failed')
      }

      const rawKey = res.data?.key || ''
      if (!rawKey) {
        throw new Error('Missing key in response')
      }

      onKeyGenerated(tryPrettyJson(rawKey))
      toast.success(t('Credential generated'))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('OAuth failed'))
    } finally {
      setState((prev) => ({ ...prev, isCompleting: false }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Claude OAuth Authorization')}</DialogTitle>
          <DialogDescription>
            {t(
              'Connect a Claude subscription and insert the OAuth JSON credential into the channel key field.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <Alert>
            <AlertDescription>
              {t(
                '1) Open the authorization page and log in to Claude; 2) copy the redirected URL or code; 3) paste it here; 4) generate the credential.'
              )}
            </AlertDescription>
          </Alert>

          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              onClick={handleStart}
              disabled={state.isStarting}
            >
              {state.isStarting ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <ExternalLink className='mr-2 h-4 w-4' />
              )}
              {t('Open authorization page')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={!canCopyAuthorizeUrl}
              onClick={async () => {
                if (!state.authorizeUrl) return
                await copyToClipboard(state.authorizeUrl)
              }}
            >
              {copiedText === state.authorizeUrl ? (
                <Check className='mr-2 h-4 w-4' />
              ) : (
                <Copy className='mr-2 h-4 w-4' />
              )}
              {t('Copy authorization link')}
            </Button>
          </div>

          <Input
            value={state.callbackUrl}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                callbackUrl: e.target.value,
              }))
            }
            placeholder={t('Paste redirected URL or authorization code')}
            autoComplete='off'
          />

          <p className='text-muted-foreground text-xs'>
            {t(
              'The result is a JSON credential containing access_token and refresh_token. It is used directly against Anthropic OAuth endpoints, not through a local CLI bridge.'
            )}
          </p>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={state.isCompleting}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            onClick={handleComplete}
            disabled={!canComplete}
          >
            {state.isCompleting && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('Generate and insert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
