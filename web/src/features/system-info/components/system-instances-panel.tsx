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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, ServerCog, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  deleteStaleSystemInstance,
  deleteStaleSystemInstances,
  listSystemInstances,
} from '../api'
import type { SystemInstance } from '../types'
import { INSTANCE_SKELETON_KEYS, getNodeName } from './system-instance-labels'
import { SystemInstancesList } from './system-instances-list'

const INSTANCE_POLL_INTERVAL_MS = 30_000

export function SystemInstancesPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<SystemInstance | null>(null)
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false)
  const [deletingNodeName, setDeletingNodeName] = useState<string | null>(null)
  const instancesQuery = useQuery({
    queryKey: ['system-info', 'instances'],
    queryFn: async () => {
      const res = await listSystemInstances()
      if (!res.success || !Array.isArray(res.data)) {
        throw new Error(res.message || t('We could not load instances.'))
      }
      return res.data
    },
    staleTime: 30 * 1000,
    retry: false,
    refetchInterval: INSTANCE_POLL_INTERVAL_MS,
  })

  const instances = instancesQuery.data ?? []
  const staleInstances = instances.filter(
    (instance) => instance.status === 'stale'
  )
  const hasStaleInstances = staleInstances.length > 0
  const loading = instancesQuery.isLoading
  const refreshing = instancesQuery.isFetching && !instancesQuery.isLoading

  const invalidateInstances = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['system-info', 'instances'],
    })
  }

  const deleteStaleInstanceMutation = useMutation({
    mutationFn: async (nodeName: string) => {
      const res = await deleteStaleSystemInstance(nodeName)
      if (!res.success) {
        throw new Error(res.message || t('Delete failed'))
      }
      return res
    },
    onMutate: (nodeName) => {
      setDeletingNodeName(nodeName)
    },
    onSuccess: async () => {
      toast.success(t('Deleted stale instance'))
      await invalidateInstances()
      setDeleteTarget(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Delete failed'))
      void invalidateInstances()
    },
    onSettled: () => {
      setDeletingNodeName(null)
    },
  })

  const deleteStaleInstancesMutation = useMutation({
    mutationFn: async () => {
      const res = await deleteStaleSystemInstances()
      if (!res.success) {
        throw new Error(res.message || t('Delete failed'))
      }
      return res
    },
    onSuccess: async (res) => {
      toast.success(
        t('Deleted {{count}} stale instances', {
          count: res.data?.deleted_count ?? 0,
        })
      )
      await invalidateInstances()
      setDeleteAllConfirmOpen(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Delete failed'))
    },
  })

  const isMutatingInstance =
    deletingNodeName !== null || deleteStaleInstanceMutation.isPending

  let instancesContent: ReactNode
  if (loading) {
    instancesContent = (
      <div className='space-y-2 p-4 sm:p-5'>
        {INSTANCE_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className='h-9 w-full rounded-md' />
        ))}
      </div>
    )
  } else if (instancesQuery.isError) {
    instancesContent = (
      <ErrorState
        title={t('We could not load instances.')}
        description={
          instancesQuery.error instanceof Error
            ? instancesQuery.error.message
            : undefined
        }
        onRetry={() => {
          void instancesQuery.refetch()
        }}
        className='min-h-[220px]'
      />
    )
  } else if (instances.length === 0) {
    instancesContent = (
      <div className='px-4 py-10 text-center sm:px-5'>
        <div className='bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-lg'>
          <ServerCog
            className='text-muted-foreground size-5'
            aria-hidden='true'
          />
        </div>
        <p className='text-muted-foreground text-sm'>
          {t('No instances have reported yet.')}
        </p>
      </div>
    )
  } else {
    instancesContent = (
      <div className='p-4 sm:p-5'>
        <SystemInstancesList
          instances={instances}
          deletingNodeName={deletingNodeName}
          isDeletingInstance={
            isMutatingInstance || deleteStaleInstancesMutation.isPending
          }
          onDeleteStaleInstance={setDeleteTarget}
        />
      </div>
    )
  }

  return (
    <>
      <section className='bg-card overflow-hidden rounded-lg border shadow-xs'>
        <div className='flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <span className='bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-md'>
                <ServerCog className='size-4' aria-hidden='true' />
              </span>
              <div className='min-w-0'>
                <h3 className='text-sm font-semibold'>{t('Instances')}</h3>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {t(
                    'Nodes reporting from this deployment and their latest heartbeat.'
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap items-center gap-2 sm:justify-end'>
            <span className='text-muted-foreground text-xs' aria-live='polite'>
              {t('Auto-refreshing every {{seconds}}s', {
                seconds: INSTANCE_POLL_INTERVAL_MS / 1000,
              })}
            </span>
            {hasStaleInstances ? (
              <Button
                type='button'
                variant='destructive'
                size='sm'
                onClick={() => setDeleteAllConfirmOpen(true)}
                disabled={
                  isMutatingInstance || deleteStaleInstancesMutation.isPending
                }
              >
                {deleteStaleInstancesMutation.isPending ? (
                  <Loader2
                    data-icon='inline-start'
                    className='size-3.5 animate-spin'
                    aria-hidden='true'
                  />
                ) : (
                  <Trash2
                    data-icon='inline-start'
                    className='size-3.5'
                    aria-hidden='true'
                  />
                )}
                {t('Delete all stale')}
              </Button>
            ) : null}
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => void instancesQuery.refetch()}
              disabled={instancesQuery.isFetching}
              aria-label={t('Refresh')}
            >
              <RefreshCw
                data-icon='inline-start'
                className={cn('size-3.5', refreshing && 'animate-spin')}
                aria-hidden='true'
              />
              {refreshing ? t('Refreshing...') : t('Refresh')}
            </Button>
          </div>
        </div>

        <div aria-busy={instancesQuery.isFetching}>{instancesContent}</div>
      </section>

      <ConfirmDialog
        open={deleteAllConfirmOpen}
        onOpenChange={setDeleteAllConfirmOpen}
        title={t('Delete stale instances')}
        desc={t(
          'Delete {{count}} stale instance records? Online instances will not be deleted.',
          { count: staleInstances.length }
        )}
        destructive
        isLoading={deleteStaleInstancesMutation.isPending}
        confirmText={
          deleteStaleInstancesMutation.isPending
            ? t('Deleting...')
            : t('Delete')
        }
        handleConfirm={() => deleteStaleInstancesMutation.mutate()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('Delete stale instance')}
        desc={
          deleteTarget
            ? t(
                'Delete stale instance "{{name}}"? If it has reported again, it will not be deleted.',
                { name: getNodeName(deleteTarget) }
              )
            : ''
        }
        destructive
        isLoading={deleteStaleInstanceMutation.isPending}
        confirmText={
          deleteStaleInstanceMutation.isPending ? t('Deleting...') : t('Delete')
        }
        handleConfirm={() => {
          if (!deleteTarget) return
          deleteStaleInstanceMutation.mutate(deleteTarget.node_name)
        }}
      />
    </>
  )
}
