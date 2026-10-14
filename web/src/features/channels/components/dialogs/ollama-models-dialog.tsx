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
import { Loader2, RefreshCw, Trash2, Download, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

import { formatBytes } from '../../lib/ollama-utils'
import { useOllamaModels } from './use-ollama-models'

export function OllamaModelsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const {
    currentRow,
    isOllamaChannel,
    channelId,
    isFetching,
    selected,
    search,
    setSearch,
    pullName,
    setPullName,
    isPulling,
    pullProgress,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    filteredModels,
    fetchOllamaModels,
    toggleSelected,
    selectAllFiltered,
    clearSelection,
    applySelection,
    pullModel,
    deleteModel,
    close,
  } = useOllamaModels({ open, onOpenChange })
  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('Ollama Models')}
      description={
        <>
          {t('Manage local models for:')} <strong>{currentRow?.name}</strong>
        </>
      }
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <Button variant='outline' onClick={close}>
          {t('Close')}
        </Button>
      }
    >
      {!isOllamaChannel ? (
        <div className='text-muted-foreground py-8 text-center'>
          {t('This channel is not an Ollama channel.')}
        </div>
      ) : (
        <div className='space-y-4 py-2 pr-1'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
            <div className='flex-1 space-y-2'>
              <Label htmlFor='ollama-pull'>{t('Pull model')}</Label>
              <div className='flex gap-2'>
                <Input
                  id='ollama-pull'
                  placeholder={t('e.g. llama3.1:8b')}
                  value={pullName}
                  onChange={(e) => setPullName(e.target.value)}
                  disabled={!channelId || isPulling}
                />
                <Button
                  onClick={() => void pullModel()}
                  disabled={!channelId || isPulling}
                >
                  {isPulling ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      {t('Pulling...')}
                    </>
                  ) : (
                    <>
                      <Download className='mr-2 h-4 w-4' />
                      {t('Pull')}
                    </>
                  )}
                </Button>
              </div>
              {pullProgress && (
                <div className='space-y-2'>
                  <div className='text-muted-foreground text-xs'>
                    {t('Status:')} {String(pullProgress.status || '-')}
                  </div>
                  <Progress
                    value={
                      typeof pullProgress.completed === 'number' &&
                      typeof pullProgress.total === 'number' &&
                      pullProgress.total > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (pullProgress.completed / pullProgress.total) *
                                100
                            )
                          )
                        : 0
                    }
                  />
                </div>
              )}
            </div>

            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => void fetchOllamaModels()}
                disabled={!channelId || isFetching}
              >
                {isFetching ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <RefreshCw className='mr-2 h-4 w-4' />
                )}
                {t('Refresh')}
              </Button>
            </div>
          </div>

          <Separator />

          <div className='space-y-3'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='text-sm font-medium'>{t('Local models')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('Select models and apply to channel models list.')}
                </p>
              </div>
              <div className='relative sm:w-72'>
                <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                <Input
                  placeholder={t('Search models...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='pl-9'
                />
              </div>
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' size='sm' onClick={selectAllFiltered}>
                {t('Select all (filtered)')}
              </Button>
              <Button variant='outline' size='sm' onClick={clearSelection}>
                {t('Clear selection')}
              </Button>
              <Button
                size='sm'
                onClick={() => void applySelection('append')}
                disabled={!selected.length}
              >
                {t('Append to channel')}
              </Button>
              <Button
                variant='secondary'
                size='sm'
                onClick={() => void applySelection('replace')}
                disabled={!selected.length}
              >
                {t('Replace channel models')}
              </Button>
            </div>

            <div className='overflow-hidden rounded-md border'>
              <div className='max-h-[420px] overflow-y-auto'>
                {filteredModels.length === 0 ? (
                  <div className='text-muted-foreground p-6 text-center text-sm'>
                    {t('No models found.')}
                  </div>
                ) : (
                  <div className='divide-y'>
                    {filteredModels.map((m) => {
                      const checked = selected.includes(m.id)
                      return (
                        <div
                          key={m.id}
                          className='flex items-center justify-between gap-3 p-3'
                        >
                          <div className='flex min-w-0 items-start gap-3'>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleSelected(m.id, !!v)}
                              aria-label={`Select model ${m.id}`}
                            />
                            <div className='min-w-0'>
                              <div className='truncate font-mono text-sm'>
                                {m.id}
                              </div>
                              <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
                                <span>
                                  {t('Size:')} {formatBytes(m.size)}
                                </span>
                                {m.digest && (
                                  <span className='truncate'>
                                    {t('Digest:')} {String(m.digest)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            variant='ghost'
                            size='sm'
                            className='text-destructive hover:text-destructive'
                            onClick={() => {
                              setDeleteTarget(m.id)
                              setDeleteOpen(true)
                            }}
                            disabled={!channelId}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v)
          if (!v) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Delete model "{{name}}"? This cannot be undone.', {
                name: deleteTarget || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={isDeleting || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return
                void deleteModel(deleteTarget)
              }}
            >
              {isDeleting ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : null}
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
