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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  createAdvancedCustomConfig,
  createAdvancedCustomRoute,
  getAdvancedCustomManagementRoute,
  isAdvancedCustomIncomingPathAllowed,
  parseAdvancedCustomConfig,
  stringifyAdvancedCustomConfig,
  replaceAdvancedCustomForwardingRoutes,
} from '../../lib/advanced-custom'
import {
  isAdvancedCustomManagementPath,
  normalizeAdvancedCustomConfig,
} from '../../lib/advanced-custom-normalization'
import {
  ADVANCED_CUSTOM_BALANCE_PATH,
  ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
} from '../../lib/advanced-custom-options'
import { ADVANCED_CUSTOM_TEMPLATE_OPTIONS } from '../../lib/advanced-custom-templates'
import { validateAdvancedCustomConfig } from '../../lib/advanced-custom-validation'
import type { AdvancedCustomConfig, AdvancedCustomRoute } from '../../types'
import { catchAllOrderErrorMessage } from './advanced-custom-editor-shared'
import { orderAdvancedCustomCatchAllRoutes } from './advanced-custom-route-order'
import {
  emptyAdvancedRoutes,
  getRouteIncomingPath,
  buildRouteGroups,
  type AdvancedCustomRouteGroup,
} from './advanced-route-groups'

export type AdvancedCustomEditorDialogProps = {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onSave: (value: string) => void
}

export type AdvancedCustomEditorTab =
  | 'forwarding'
  | 'models'
  | 'balance'
  | 'json'

const advancedCustomTabs = new Set<AdvancedCustomEditorTab>([
  'forwarding',
  'models',
  'balance',
  'json',
])

export function useAdvancedCustomEditor({
  open,
  value,
  onOpenChange,
  onSave,
}: AdvancedCustomEditorDialogProps) {
  const { t } = useTranslation()
  const routeKeyCounterRef = useRef(0)
  const [config, setConfig] = useState<AdvancedCustomConfig>(
    () => parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
  )
  const [routeKeys, setRouteKeys] = useState<string[]>(() => {
    const initialConfig =
      parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
    const normalized = normalizeAdvancedCustomConfig(initialConfig)
    return (normalized.advanced_routes || []).map(
      (_, routeIndex) => `advanced-custom-route-initial-${routeIndex}`
    )
  })
  const [activeTab, setActiveTab] =
    useState<AdvancedCustomEditorTab>('forwarding')
  const [jsonText, setJsonText] = useState(() =>
    stringifyAdvancedCustomConfig(
      parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
    )
  )
  const [jsonError, setJsonError] = useState('')
  const [templateKey, setTemplateKey] = useState(
    ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0]?.value || ''
  )
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false)
  const [expandedRouteGroups, setExpandedRouteGroups] = useState<Set<string>>(
    () => new Set()
  )

  const normalizedConfig = useMemo(
    () => normalizeAdvancedCustomConfig(config),
    [config]
  )
  const routes = normalizedConfig.advanced_routes || emptyAdvancedRoutes
  const allRouteRows = useMemo(
    () =>
      routes.map((route, index) => ({
        route,
        index,
        routeKey:
          routeKeys.at(index) ||
          route.incoming_path ||
          route.upstream_path ||
          route.converter ||
          'advanced-custom-route',
      })),
    [routeKeys, routes]
  )
  const routeRows = useMemo(
    () =>
      allRouteRows.filter(
        (routeRow) =>
          !isAdvancedCustomManagementPath(getRouteIncomingPath(routeRow.route))
      ),
    [allRouteRows]
  )
  const routeGroups = useMemo(() => buildRouteGroups(routeRows), [routeRows])
  const usedIncomingPaths = useMemo(
    () => new Set(routeGroups.map((routeGroup) => routeGroup.incomingPath)),
    [routeGroups]
  )
  const availableIncomingPathOptions = useMemo(
    () =>
      ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.filter(
        (option) =>
          !isAdvancedCustomManagementPath(option.value) &&
          !usedIncomingPaths.has(option.value)
      ),
    [usedIncomingPaths]
  )
  const validationError = useMemo(
    () => validateAdvancedCustomConfig(normalizedConfig),
    [normalizedConfig]
  )
  const canFixCatchAllOrder =
    validationError?.message === catchAllOrderErrorMessage
  const modelListRoute = getAdvancedCustomManagementRoute(
    normalizedConfig,
    ADVANCED_CUSTOM_MODEL_LIST_PATH
  )
  const balanceRoute = getAdvancedCustomManagementRoute(
    normalizedConfig,
    ADVANCED_CUSTOM_BALANCE_PATH
  )
  const selectedTemplate = useMemo(
    () =>
      ADVANCED_CUSTOM_TEMPLATE_OPTIONS.find(
        (template) => template.value === templateKey
      ) || ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0],
    [templateKey]
  )

  // Synchronize the draft only when the dialog opens or the source value changes.
  // Route keys are disposable UI identity and do not belong in the saved config.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const parsed =
      parseAdvancedCustomConfig(value) || createAdvancedCustomConfig()
    const normalized = normalizeAdvancedCustomConfig(parsed)
    setConfig(normalized)
    setRouteKeys(createRouteKeys(normalized.advanced_routes?.length || 0))
    setJsonText(stringifyAdvancedCustomConfig(normalized))
    setJsonError('')
    setActiveTab('forwarding')
    setTemplateConfirmOpen(false)
    const firstForwardingPath = (normalized.advanced_routes || [])
      .map((route) => getRouteIncomingPath(route))
      .find((path) => !isAdvancedCustomManagementPath(path))
    setExpandedRouteGroups(
      firstForwardingPath ? new Set([firstForwardingPath]) : new Set()
    )
  }, [open, value])

  const createRouteKey = () => {
    routeKeyCounterRef.current += 1
    return `advanced-custom-route-${routeKeyCounterRef.current}`
  }

  const createRouteKeys = (count: number) =>
    Array.from({ length: count }, () => createRouteKey())

  const updateRoute = (index: number, patch: Partial<AdvancedCustomRoute>) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      const nextRoutes = [...(next.advanced_routes || [])]
      nextRoutes[index] = { ...nextRoutes[index], ...patch }
      return { ...next, advanced_routes: nextRoutes }
    })
  }

  const replaceRoutes = (
    nextRoutes: AdvancedCustomRoute[],
    nextRouteKeys = allRouteRows.map((routeRow) => routeRow.routeKey)
  ) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return { ...next, advanced_routes: nextRoutes }
    })
    setRouteKeys(nextRouteKeys)
  }

  const addRoute = (incomingPath: string | null) => {
    if (!incomingPath || usedIncomingPaths.has(incomingPath)) return
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: [
          ...(next.advanced_routes || []),
          {
            ...createAdvancedCustomRoute(),
            incoming_path: incomingPath,
            upstream_path: incomingPath,
          },
        ],
      }
    })
    setRouteKeys((current) => [...current, createRouteKey()])
    setExpandedRouteGroups((current) => new Set(current).add(incomingPath))
  }

  const addRouteForIncomingPath = (incomingPath: string) => {
    const resolvedIncomingPath = incomingPath || '/v1/chat/completions'
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: [
          ...(next.advanced_routes || []),
          {
            ...createAdvancedCustomRoute(),
            incoming_path: resolvedIncomingPath,
            upstream_path: resolvedIncomingPath,
          },
        ],
      }
    })
    setRouteKeys((current) => [...current, createRouteKey()])
    setExpandedRouteGroups((current) =>
      new Set(current).add(resolvedIncomingPath)
    )
  }

  const removeRoute = (index: number) => {
    setConfig((current) => {
      const next = normalizeAdvancedCustomConfig(current)
      return {
        ...next,
        advanced_routes: (next.advanced_routes || []).filter(
          (_, routeIndex) => routeIndex !== index
        ),
      }
    })
    setRouteKeys((current) =>
      current.filter((_, routeIndex) => routeIndex !== index)
    )
  }

  const updateGroupIncomingPath = (
    group: AdvancedCustomRouteGroup,
    nextIncomingPath: string | null
  ) => {
    const resolvedIncomingPath = nextIncomingPath || '/v1/chat/completions'
    const groupRouteIndexes = new Set(
      group.routeRows.map((routeRow) => routeRow.index)
    )
    const nextRoutes = routes.map((route, routeIndex) => {
      if (!groupRouteIndexes.has(routeIndex)) return route
      if (resolvedIncomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH) {
        return {
          ...route,
          incoming_path: resolvedIncomingPath,
          upstream_path: ADVANCED_CUSTOM_MODEL_LIST_PATH,
          converter: 'none' as const,
          models: [],
        }
      }
      const converter = route.converter || 'none'
      return {
        ...route,
        incoming_path: resolvedIncomingPath,
        converter: isAdvancedCustomIncomingPathAllowed(
          resolvedIncomingPath,
          converter
        )
          ? converter
          : 'none',
      }
    })
    replaceRoutes(nextRoutes)
    setExpandedRouteGroups((current) => {
      const next = new Set(current)
      next.delete(group.incomingPath)
      next.add(resolvedIncomingPath)
      return next
    })
  }

  const swapRoutes = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const nextRoutes = [...routes]
    const nextRouteKeys = allRouteRows.map((routeRow) => routeRow.routeKey)
    const fromRoute = nextRoutes[fromIndex]
    nextRoutes[fromIndex] = nextRoutes[toIndex]
    nextRoutes[toIndex] = fromRoute
    const fromRouteKey = nextRouteKeys[fromIndex]
    nextRouteKeys[fromIndex] = nextRouteKeys[toIndex]
    nextRouteKeys[toIndex] = fromRouteKey
    replaceRoutes(nextRoutes, nextRouteKeys)
  }

  const moveRouteWithinGroup = (index: number, direction: -1 | 1) => {
    const incomingPath = getRouteIncomingPath(routes[index])
    const samePathIndexes = routes
      .map((route, routeIndex) => ({ route, routeIndex }))
      .filter(({ route }) => getRouteIncomingPath(route) === incomingPath)
      .map(({ routeIndex }) => routeIndex)
    const position = samePathIndexes.indexOf(index)
    const nextIndex = samePathIndexes.at(position + direction)
    if (nextIndex === undefined) return
    swapRoutes(index, nextIndex)
  }

  const moveRouteToGroupEnd = (index: number) => {
    const incomingPath = getRouteIncomingPath(routes[index])
    let lastSamePathIndex = -1
    for (let routeIndex = routes.length - 1; routeIndex >= 0; routeIndex -= 1) {
      if (getRouteIncomingPath(routes[routeIndex]) === incomingPath) {
        lastSamePathIndex = routeIndex
        break
      }
    }
    if (lastSamePathIndex < 0 || index === lastSamePathIndex) return

    const nextRoutes = [...routes]
    const nextRouteKeys = allRouteRows.map((routeRow) => routeRow.routeKey)
    const [route] = nextRoutes.splice(index, 1)
    const [routeKey] = nextRouteKeys.splice(index, 1)
    nextRoutes.splice(lastSamePathIndex, 0, route)
    nextRouteKeys.splice(lastSamePathIndex, 0, routeKey)
    replaceRoutes(nextRoutes, nextRouteKeys)
  }

  const fixCatchAllOrder = () => {
    replaceRoutes(
      ...orderAdvancedCustomCatchAllRoutes(routeRows, routes, allRouteRows)
    )
  }

  const parseJsonEditorConfig = (): AdvancedCustomConfig | null => {
    const parsed = parseAdvancedCustomConfig(jsonText)
    if (!parsed) {
      setJsonError(t('Invalid JSON'))
      return null
    }

    const error = validateAdvancedCustomConfig(parsed)
    if (error) {
      setJsonError(t(error.message))
      return null
    }

    setJsonError('')
    return parsed
  }

  const switchTab = (nextTab: AdvancedCustomEditorTab) => {
    if (!advancedCustomTabs.has(nextTab)) return
    if (activeTab !== 'json') {
      if (nextTab === 'json') {
        setJsonText(stringifyAdvancedCustomConfig(normalizedConfig))
        setJsonError('')
      }
      setActiveTab(nextTab)
      return
    }

    const parsed = parseJsonEditorConfig()
    if (!parsed) return
    const normalized = normalizeAdvancedCustomConfig(parsed)
    setConfig(normalized)
    setRouteKeys(createRouteKeys(normalized.advanced_routes?.length || 0))
    setActiveTab(nextTab)
  }

  const handleJsonChange = (nextValue: string) => {
    setJsonText(nextValue)
    if (jsonError) setJsonError('')
  }

  const selectTemplate = (nextTemplateKey: string) => {
    const template =
      ADVANCED_CUSTOM_TEMPLATE_OPTIONS.find(
        (option) => option.value === nextTemplateKey
      ) || ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0]
    setTemplateKey(template.value)
    setTemplateConfirmOpen(true)
  }

  const applySelectedTemplate = () => {
    if (!selectedTemplate) return
    const templateRoutes = (selectedTemplate.config.advanced_routes || []).map(
      (route) => ({
        ...route,
        models: [],
      })
    )
    const normalized = replaceAdvancedCustomForwardingRoutes(
      normalizedConfig,
      templateRoutes
    )
    setConfig(normalized)
    setRouteKeys(createRouteKeys(normalized.advanced_routes?.length || 0))
    setJsonText(stringifyAdvancedCustomConfig(normalized))
    setJsonError('')
    setExpandedRouteGroups(
      new Set(templateRoutes.map((route) => getRouteIncomingPath(route)))
    )
    setTemplateConfirmOpen(false)
  }

  const saveConfig = () => {
    if (activeTab === 'json') {
      const parsed = parseJsonEditorConfig()
      if (!parsed) {
        toast.error(t('Please fix JSON errors before saving'))
        return
      }
      onSave(stringifyAdvancedCustomConfig(parsed))
      onOpenChange(false)
      return
    }

    if (validationError) {
      toast.error(t(validationError.message))
      return
    }
    onSave(stringifyAdvancedCustomConfig(normalizedConfig))
    onOpenChange(false)
  }

  return {
    config,
    setConfig,
    activeTab,
    jsonText,
    jsonError,
    templateKey,
    templateConfirmOpen,
    setTemplateConfirmOpen,
    expandedRouteGroups,
    setExpandedRouteGroups,
    routes,
    routeRows,
    routeGroups,
    usedIncomingPaths,
    availableIncomingPathOptions,
    validationError,
    canFixCatchAllOrder,
    modelListRoute,
    balanceRoute,
    selectedTemplate,
    updateRoute,
    addRoute,
    addRouteForIncomingPath,
    removeRoute,
    updateGroupIncomingPath,
    moveRouteWithinGroup,
    moveRouteToGroupEnd,
    fixCatchAllOrder,
    switchTab,
    handleJsonChange,
    selectTemplate,
    applySelectedTemplate,
    saveConfig,
  }
}
