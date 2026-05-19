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
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
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

type OAuthStartResponse = {
  success: boolean
  message?: string
  data?: {
    authorize_url?: string
  }
}

type OAuthCompleteResponse = {
  success: boolean
  message?: string
  data?: {
    key?: string
  }
}

type OAuthCredentialDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onKeyGenerated: (key: string) => void
  title: string
  description: string
  instructions: string
  inputLabel: string
  inputPlaceholder: string
  tip: string
  startOAuth: () => Promise<OAuthStartResponse>
  completeOAuth: (input: string) => Promise<OAuthCompleteResponse>
  completeButtonLabel?: string
  completingLabel?: string
  successMessage?: string
  requireKeyResult?: boolean
}

export function OAuthCredentialDialog({
  open,
  onOpenChange,
  onKeyGenerated,
  title,
  description,
  instructions,
  inputLabel,
  inputPlaceholder,
  tip,
  startOAuth,
  completeOAuth,
  completeButtonLabel = 'Generate credential',
  completingLabel = 'Generating...',
  successMessage = 'Credential generated',
  requireKeyResult = true,
}: OAuthCredentialDialogProps) {
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
      const res = await startOAuth()
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
      const res = await completeOAuth(state.callbackUrl.trim())
      if (!res.success) {
        throw new Error(res.message || 'OAuth failed')
      }

      const rawKey = res.data?.key || ''
      if (requireKeyResult && !rawKey) {
        throw new Error('Missing key in response')
      }

      onKeyGenerated(requireKeyResult ? tryPrettyJson(rawKey) : '')
      toast.success(t(successMessage))
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
          <DialogTitle>{t(title)}</DialogTitle>
          <DialogDescription>{t(description)}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <Alert>
            <AlertDescription>{t(instructions)}</AlertDescription>
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
              aria-label={t('Copy authorization link')}
              title={t('Copy authorization link')}
            >
              {copiedText === state.authorizeUrl ? (
                <Check className='mr-2 h-4 w-4 text-green-600' />
              ) : (
                <Copy className='mr-2 h-4 w-4' />
              )}
              {t('Copy authorization link')}
            </Button>
          </div>

          <div className='space-y-2'>
            <div className='text-sm font-medium'>{t(inputLabel)}</div>
            <Input
              value={state.callbackUrl}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  callbackUrl: e.target.value,
                }))
              }
              placeholder={t(inputPlaceholder)}
              autoComplete='off'
              spellCheck={false}
            />
            <div className='text-muted-foreground text-xs'>{t(tip)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={state.isStarting || state.isCompleting}
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
            {state.isCompleting ? t(completingLabel) : t(completeButtonLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
