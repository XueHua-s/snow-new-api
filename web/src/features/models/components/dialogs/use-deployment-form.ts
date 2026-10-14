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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  checkClusterNameAvailability,
  createDeployment,
  estimatePrice,
  getAvailableReplicas,
  getHardwareTypes,
} from '../../deployment-api'
import { deploymentsQueryKeys } from '../../lib'

const BUILTIN_IMAGE = 'ollama/ollama:latest'

const DEFAULT_TRAFFIC_PORT = 11434

const schema = z.object({
  resource_private_name: z.string().min(1),
  image_url: z.string().min(1),
  traffic_port: z.coerce.number().int().min(1).max(65535),
  hardware_id: z.string().min(1),
  gpus_per_container: z.coerce.number().int().min(1),
  location_ids: z.array(z.string()).min(1),
  replica_count: z.coerce.number().int().min(1),
  duration_hours: z.coerce.number().int().min(1),
  // Advanced
  env_json: z.string().optional(),
  secret_env_json: z.string().optional(),
  entrypoint: z.string().optional(),
  args: z.string().optional(),
  registry_username: z.string().optional(),
  registry_secret: z.string().optional(),
  currency: z.string().optional(),
})

// NOTE: react-hook-form resolver uses the schema input type (coerce input is unknown)
type FormValues = z.input<typeof schema>

export function toNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function useDeploymentForm({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      resource_private_name: '',
      image_url: BUILTIN_IMAGE,
      traffic_port: DEFAULT_TRAFFIC_PORT,
      hardware_id: '',
      gpus_per_container: 1,
      location_ids: [],
      replica_count: 1,
      duration_hours: 1,
      env_json: '',
      secret_env_json: '',
      entrypoint: '',
      args: '',
      registry_username: '',
      registry_secret: '',
      currency: 'usdc',
    },
  })

  const hardwareId = form.watch('hardware_id')
  const gpuCount = toNumber(form.watch('gpus_per_container'), 1)
  const locationIds = form.watch('location_ids')
  const durationHours = toNumber(form.watch('duration_hours'), 1)
  const replicaCount = toNumber(form.watch('replica_count'), 1)
  const trafficPort = toNumber(form.watch('traffic_port'), DEFAULT_TRAFFIC_PORT)
  const currency = form.watch('currency')
  const resourceName = form.watch('resource_private_name')

  const { data: hardwareTypesData, isLoading: isLoadingHardware } = useQuery({
    queryKey: ['deployment-hardware-types'],
    queryFn: getHardwareTypes,
    enabled: open,
  })

  const hardwareOptions = useMemo(() => {
    const items = hardwareTypesData?.data?.hardware_types || []
    if (!Array.isArray(items)) return []
    return items.map((h: Record<string, unknown>) => ({
      label:
        (h?.brand_name ? `${h.brand_name} ` : '') + String(h?.name ?? h?.id),
      value: String(h?.id),
      max_gpus: Number(h?.max_gpus || 1),
    }))
  }, [hardwareTypesData])

  // Keep gpus_per_container <= max_gpus
  useEffect(() => {
    if (!hardwareId) return
    const hw = hardwareOptions.find((x) => x.value === hardwareId)
    if (!hw) return
    const max =
      Number.isFinite(hw.max_gpus) && hw.max_gpus > 0 ? hw.max_gpus : 1
    if (gpuCount > max) {
      form.setValue('gpus_per_container', max)
    }
  }, [hardwareId, hardwareOptions, gpuCount, form])

  const { data: replicasData, isLoading: isLoadingReplicas } = useQuery({
    queryKey: ['deployment-available-replicas', hardwareId, gpuCount],
    queryFn: () =>
      getAvailableReplicas({
        hardware_id: hardwareId,
        gpu_count: gpuCount,
      }),
    enabled: open && Boolean(hardwareId) && gpuCount > 0,
  })

  const locationOptions = useMemo(() => {
    const replicas = replicasData?.data?.replicas || []
    if (!Array.isArray(replicas)) return []
    const map = new Map<string, { label: string; value: string }>()
    replicas.forEach((r: Record<string, unknown>) => {
      const id = (r?.location_id ??
        (r?.location as Record<string, unknown>)?.id) as string | undefined
      if (id === null || id === undefined) return
      const name = (r?.location_name ??
        (r?.location as Record<string, unknown>)?.name ??
        r?.name ??
        String(id)) as string
      const key = String(id)
      if (!map.has(key)) {
        map.set(key, { label: String(name), value: key })
      }
    })
    return [...map.values()]
  }, [replicasData])

  const { data: priceData, isLoading: _isLoadingPrice } = useQuery({
    queryKey: [
      'deployment-price',
      hardwareId,
      gpuCount,
      durationHours,
      replicaCount,
      locationIds,
      currency,
    ],
    queryFn: () =>
      estimatePrice({
        location_ids: locationIds,
        hardware_id: hardwareId,
        gpus_per_container: gpuCount,
        duration_hours: durationHours,
        replica_count: replicaCount,
        currency: currency || 'usdc',
      }),
    enabled:
      open &&
      Boolean(hardwareId) &&
      gpuCount > 0 &&
      durationHours > 0 &&
      replicaCount > 0 &&
      locationIds.length > 0,
  })

  const { data: nameCheckData, isFetching: isCheckingName } = useQuery({
    queryKey: ['deployment-name-check', resourceName],
    queryFn: async () => {
      const name = (resourceName || '').trim()
      if (!name) return null
      return await checkClusterNameAvailability(name)
    },
    enabled: open && Boolean(resourceName && resourceName.trim().length > 0),
    staleTime: 10_000,
  })

  const nameAvailable =
    nameCheckData?.success === true ? nameCheckData?.data?.available : undefined

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const env =
        values.env_json && values.env_json.trim()
          ? (JSON.parse(values.env_json) as Record<string, unknown>)
          : undefined
      const secretEnv =
        values.secret_env_json && values.secret_env_json.trim()
          ? (JSON.parse(values.secret_env_json) as Record<string, unknown>)
          : undefined

      const envVariables =
        env && typeof env === 'object' && !Array.isArray(env)
          ? (Object.fromEntries(
              Object.entries(env).map(([k, v]) => [k, String(v)])
            ) as Record<string, string>)
          : undefined

      const secretEnvVariables =
        secretEnv && typeof secretEnv === 'object' && !Array.isArray(secretEnv)
          ? (Object.fromEntries(
              Object.entries(secretEnv).map(([k, v]) => [k, String(v)])
            ) as Record<string, string>)
          : undefined

      const gpusPerContainer = Number(values.gpus_per_container)
      const durationHoursVal = Number(values.duration_hours)
      const replicaCountVal = Number(values.replica_count)

      const entrypoint = values.entrypoint
        ? values.entrypoint
            .split(' ')
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined

      const args = values.args
        ? values.args
            .split(' ')
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined

      const location_ids = (values.location_ids || [])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)

      const payload = {
        resource_private_name: values.resource_private_name.trim(),
        duration_hours: Number.isFinite(durationHoursVal)
          ? durationHoursVal
          : 1,
        gpus_per_container: Number.isFinite(gpusPerContainer)
          ? gpusPerContainer
          : 1,
        hardware_id: Number(values.hardware_id),
        location_ids,
        container_config: {
          replica_count: Number.isFinite(replicaCountVal) ? replicaCountVal : 1,
          traffic_port: Number.isFinite(trafficPort)
            ? trafficPort
            : DEFAULT_TRAFFIC_PORT,
          ...(entrypoint?.length ? { entrypoint } : {}),
          ...(args?.length ? { args } : {}),
          ...(envVariables ? { env_variables: envVariables } : {}),
          ...(secretEnvVariables
            ? { secret_env_variables: secretEnvVariables }
            : {}),
        },
        registry_config: {
          image_url: values.image_url,
          ...(values.registry_username?.trim()
            ? { registry_username: values.registry_username.trim() }
            : {}),
          ...(values.registry_secret?.trim()
            ? { registry_secret: values.registry_secret.trim() }
            : {}),
        },
      }

      return await createDeployment(payload)
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(t('Deployment created successfully'))
        queryClient.invalidateQueries({
          queryKey: deploymentsQueryKeys.lists(),
        })
        onOpenChange(false)
        return
      }
      toast.error(data?.message || t('Failed to create deployment'))
    },
    onError: (err: Error) => {
      toast.error(err.message || t('Failed to create deployment'))
    },
  })

  // Reset form when opening
  useEffect(() => {
    if (!open) return
    form.reset({
      resource_private_name: '',
      image_url: BUILTIN_IMAGE,
      traffic_port: DEFAULT_TRAFFIC_PORT,
      hardware_id: '',
      gpus_per_container: 1,
      location_ids: [],
      replica_count: 1,
      duration_hours: 1,
      env_json: '',
      secret_env_json: '',
      entrypoint: '',
      args: '',
      registry_username: '',
      registry_secret: '',
      currency: 'usdc',
    })
  }, [open, form])

  const priceSummary = useMemo<string>(() => {
    const est = priceData?.data
    if (!est || typeof est !== 'object') return ''
    const total =
      (est as Record<string, unknown>)?.total_cost ??
      (est as Record<string, unknown>)?.total ??
      ''
    const currency = (est as Record<string, unknown>)?.currency ?? ''
    if (total === '' && currency === '') return ''
    return `${total} ${currency}`.trim()
  }, [priceData])
  void priceSummary

  return {
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
  }
}
