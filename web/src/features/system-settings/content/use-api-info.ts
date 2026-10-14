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
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { getBgColorClass } from '@/lib/colors'

import { useUpdateOption } from '../hooks/use-update-option'

type ApiInfo = {
  id: number
  url: string
  route: string
  description: string
  color: string
}

export type ApiInfoSectionProps = {
  enabled: boolean
  data: string
}

const createApiInfoSchema = (t: (key: string) => string) =>
  z.object({
    url: z.string().url(t('Must be a valid URL')),
    route: z.string().min(1, t('Route is required')),
    description: z.string().min(1, t('Description is required')),
    color: z.string().min(1, t('Color is required')),
  })

type ApiInfoFormValues = z.infer<ReturnType<typeof createApiInfoSchema>>

function parseApiInfoList(data: string): ApiInfo[] {
  try {
    const parsed = JSON.parse(data || '[]')
    if (!Array.isArray(parsed)) return []

    return parsed.map((item, idx) => ({
      ...item,
      id: item.id || idx + 1,
    }))
  } catch {
    return []
  }
}

export function useApiInfo({ enabled, data }: ApiInfoSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const apiInfoSchema = createApiInfoSchema(t)
  const parsedApiInfoList = useMemo(() => parseApiInfoList(data), [data])
  const [draftApiInfoList, setDraftApiInfoList] = useState<ApiInfo[] | null>(
    null
  )
  const [isEnabledDraft, setIsEnabledDraft] = useState<boolean | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingApiInfo, setEditingApiInfo] = useState<ApiInfo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')
  const apiInfoList = draftApiInfoList ?? parsedApiInfoList
  const isEnabled = isEnabledDraft ?? enabled
  const hasChanges = draftApiInfoList !== null

  const form = useForm<ApiInfoFormValues>({
    resolver: zodResolver(apiInfoSchema),
    defaultValues: {
      url: '',
      route: '',
      description: '',
      color: 'blue',
    },
  })

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.api_info_enabled',
        value: checked,
      })
      setIsEnabledDraft(checked)
      toast.success(t('Setting saved'))
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingApiInfo(null)
    form.reset({
      url: '',
      route: '',
      description: '',
      color: 'blue',
    })
    setShowDialog(true)
  }

  const handleEdit = (apiInfo: ApiInfo) => {
    setEditingApiInfo(apiInfo)
    form.reset({
      url: apiInfo.url,
      route: apiInfo.route,
      description: apiInfo.description,
      color: apiInfo.color,
    })
    setShowDialog(true)
  }

  const handleDelete = (apiInfo: ApiInfo) => {
    setEditingApiInfo(apiInfo)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteTarget === 'single' && editingApiInfo) {
      setDraftApiInfoList(
        apiInfoList.filter((item) => item.id !== editingApiInfo.id)
      )
      toast.success(t('API info deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setDraftApiInfoList(
        apiInfoList.filter((item) => !selectedIds.includes(item.id))
      )
      setSelectedIds([])
      toast.success(
        t('{{count}} API entries deleted. Click "Save Settings" to apply.', {
          count: selectedIds.length,
        })
      )
    }
    setShowDeleteDialog(false)
    setEditingApiInfo(null)
  }

  const handleSubmitForm = (values: ApiInfoFormValues) => {
    if (editingApiInfo) {
      setDraftApiInfoList(
        apiInfoList.map((item) =>
          item.id === editingApiInfo.id ? { ...item, ...values } : item
        )
      )
      toast.success(t('API info updated. Click "Save Settings" to apply.'))
    } else {
      const newId = Math.max(...apiInfoList.map((item) => item.id), 0) + 1
      setDraftApiInfoList([...apiInfoList, { id: newId, ...values }])
      toast.success(t('API info added. Click "Save Settings" to apply.'))
    }
    setShowDialog(false)
  }

  const handleSaveAll = async () => {
    try {
      const result = await updateOption.mutateAsync({
        key: 'console_setting.api_info',
        value: JSON.stringify(apiInfoList),
      })
      if (result.success) {
        setDraftApiInfoList(null)
      }
    } catch {
      toast.error(t('Failed to save API info'))
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? apiInfoList.map((item) => item.id) : [])
  }

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  const getColorClass = (color: string) => getBgColorClass(color)

  return {
    updateOption,
    selectedIds,
    showDialog,
    setShowDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    editingApiInfo,
    deleteTarget,
    apiInfoList,
    isEnabled,
    hasChanges,
    form,
    handleToggleEnabled,
    handleAdd,
    handleEdit,
    handleDelete,
    handleBatchDelete,
    confirmDelete,
    handleSubmitForm,
    handleSaveAll,
    toggleSelectAll,
    toggleSelectOne,
    getColorClass,
  }
}
