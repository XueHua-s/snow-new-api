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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { getAllModels, getGroups, getPrefillGroups } from '../../api'
import { ADD_MODE_OPTIONS, CHANNEL_TYPE_OPTIONS } from '../../constants'
import { getAdvancedCustomStats, type ChannelFormValues } from '../../lib'
import { ChannelTypeLogo } from './channel-editor-controls'
import { ADVANCED_CUSTOM_ROUTE_TYPE_PREVIEW_LIMIT } from './channel-editor-state'

export function useChannelEditorOptions({
  multiKeyMode,
  isEditing,
  isChannelLoading,
  currentType,
  vertexKeyType,
  currentAdvancedCustom,
  allModelsData,
  prefillGroupsData,
  groupsData,
  currentGroups,
}: {
  multiKeyMode: ChannelFormValues['multi_key_mode']
  isEditing: boolean
  isChannelLoading: boolean
  currentType: number
  vertexKeyType: ChannelFormValues['vertex_key_type']
  currentAdvancedCustom: ChannelFormValues['advanced_custom']
  allModelsData: Awaited<ReturnType<typeof getAllModels>> | undefined
  prefillGroupsData: Awaited<ReturnType<typeof getPrefillGroups>> | undefined
  groupsData: Awaited<ReturnType<typeof getGroups>> | undefined
  currentGroups: ChannelFormValues['group']
}) {
  const { t } = useTranslation()
  const isBatchMode =
    multiKeyMode === 'batch' || multiKeyMode === 'multi_to_single'

  const isChannelDetailLoading = isEditing && isChannelLoading

  const supportsMultiKeyAddMode =
    currentType !== 57 &&
    currentType !== 61 &&
    !(currentType === 41 && vertexKeyType === 'api_key')

  const addModeOptions = useMemo(
    () =>
      supportsMultiKeyAddMode
        ? ADD_MODE_OPTIONS
        : ADD_MODE_OPTIONS.filter((option) => option.value === 'single'),
    [supportsMultiKeyAddMode]
  )

  const advancedCustomStats = useMemo(
    () => getAdvancedCustomStats(currentAdvancedCustom),
    [currentAdvancedCustom]
  )

  const advancedCustomRouteTypeLabels =
    advancedCustomStats.routeTypeLabels.slice(
      0,
      ADVANCED_CUSTOM_ROUTE_TYPE_PREVIEW_LIMIT
    )

  const hiddenAdvancedCustomRouteTypeCount =
    advancedCustomStats.routeTypeLabels.length -
    advancedCustomRouteTypeLabels.length

  const advancedCustomRouteTypeTitle =
    hiddenAdvancedCustomRouteTypeCount > 0
      ? advancedCustomStats.routeTypeLabels.join(', ')
      : undefined

  const allModelsList = useMemo(
    () => allModelsData?.data?.map((model) => model.id).filter(Boolean) || [],
    [allModelsData]
  )

  const basicModels = useMemo(() => {
    if (!allModelsList.length) return []
    // Filter models based on common patterns for specific types
    if (currentType === 1) {
      return allModelsList.filter(
        (model) => model.startsWith('gpt-') || model.startsWith('text-')
      )
    }
    return allModelsList
  }, [allModelsList, currentType])

  const prefillGroups = useMemo(
    () => prefillGroupsData?.data || [],
    [prefillGroupsData]
  )

  const groupOptions = useMemo(() => {
    if (!groupsData?.data) return []
    const allGroups = new Set([...groupsData.data, ...(currentGroups || [])])
    return [...allGroups].map((group) => ({
      value: group,
      label: group,
    }))
  }, [groupsData, currentGroups])

  const currentTypeLabel = useMemo(
    () =>
      CHANNEL_TYPE_OPTIONS.find((option) => option.value === currentType)
        ?.label || `#${currentType}`,
    [currentType]
  )

  const channelTypeOptions = useMemo(() => {
    const options = CHANNEL_TYPE_OPTIONS.map((option) => ({
      value: String(option.value),
      label: t(option.label),
      icon: <ChannelTypeLogo type={option.value} size={16} />,
    }))
    if (!options.some((option) => Number(option.value) === currentType)) {
      options.push({
        value: String(currentType),
        label: `#${currentType}`,
        icon: <ChannelTypeLogo type={currentType} size={16} />,
      })
    }
    return options
  }, [currentType, t])
  return {
    isBatchMode,
    isChannelDetailLoading,
    supportsMultiKeyAddMode,
    addModeOptions,
    advancedCustomStats,
    advancedCustomRouteTypeLabels,
    hiddenAdvancedCustomRouteTypeCount,
    advancedCustomRouteTypeTitle,
    allModelsList,
    basicModels,
    prefillGroups,
    groupOptions,
    currentTypeLabel,
    channelTypeOptions,
  }
}
