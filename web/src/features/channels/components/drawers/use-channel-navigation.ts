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
import type * as React from 'react'
import { useEffect, useCallback, useRef, useState } from 'react'
import type { SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type ChannelFormValues, hasAdvancedSettingsErrors } from '../../lib'
import {
  CHANNEL_EDITOR_SECTION_IDS,
  ADVANCED_SETTINGS_EXPANDED_KEY,
  ADVANCED_SETTINGS_CHILD_SECTION_IDS,
  CHANNEL_EDITOR_MAIN_SECTION_IDS,
} from './channel-editor-state'

/** Owns navigation selection and scrolling; resetting does not change saved preferences. */
export function useChannelNavigation({
  setAdvancedSettingsOpen,
  advancedSettingsOpen,
  open,
  isChannelDetailLoading,
}: {
  setAdvancedSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  advancedSettingsOpen: boolean
  open: boolean
  isChannelDetailLoading: boolean
}) {
  const { t } = useTranslation()
  const channelFormRef = useRef<HTMLFormElement>(null)
  const advancedNavScrollPendingRef = useRef(false)
  const [activeEditorSectionId, setActiveEditorSectionId] = useState<string>(
    CHANNEL_EDITOR_SECTION_IDS.identity
  )
  const [expandedEditorNavItemId, setExpandedEditorNavItemId] = useState<
    string | undefined
  >()
  const resetNavigation = useCallback(() => {
    advancedNavScrollPendingRef.current = false
    setActiveEditorSectionId(CHANNEL_EDITOR_SECTION_IDS.identity)
    setExpandedEditorNavItemId(undefined)
  }, [])

  const handleAdvancedSettingsOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        advancedNavScrollPendingRef.current = false
        setExpandedEditorNavItemId(undefined)
      }
      setAdvancedSettingsOpen(nextOpen)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          ADVANCED_SETTINGS_EXPANDED_KEY,
          String(nextOpen)
        )
      }
    },
    [setAdvancedSettingsOpen]
  )

  const handleEditorNavNavigate = useCallback(
    (targetId: string) => {
      const isAdvancedTarget =
        targetId === CHANNEL_EDITOR_SECTION_IDS.advanced ||
        ADVANCED_SETTINGS_CHILD_SECTION_IDS.includes(targetId)

      if (isAdvancedTarget) {
        advancedNavScrollPendingRef.current = true
        handleAdvancedSettingsOpenChange(true)
        setActiveEditorSectionId(CHANNEL_EDITOR_SECTION_IDS.advanced)
        setExpandedEditorNavItemId(CHANNEL_EDITOR_SECTION_IDS.advanced)
      } else {
        advancedNavScrollPendingRef.current = false
        setActiveEditorSectionId(targetId)
        setExpandedEditorNavItemId(undefined)
      }

      const scrollTargetIntoView = () => {
        document
          .querySelector<HTMLElement>(`#${targetId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      if (isAdvancedTarget && !advancedSettingsOpen) {
        window.requestAnimationFrame(scrollTargetIntoView)
        return
      }

      scrollTargetIntoView()
    },
    [advancedSettingsOpen, handleAdvancedSettingsOpenChange]
  )

  const updateActiveEditorSection = useCallback(() => {
    const formElement = channelFormRef.current
    if (!formElement) return

    const activationY = formElement.getBoundingClientRect().top + 80
    let nextActiveSectionId: string = CHANNEL_EDITOR_SECTION_IDS.identity

    for (const sectionId of CHANNEL_EDITOR_MAIN_SECTION_IDS) {
      const sectionElement = document.querySelector<HTMLElement>(
        `#${sectionId}`
      )
      if (!sectionElement) continue
      if (sectionElement.getBoundingClientRect().top <= activationY) {
        nextActiveSectionId = sectionId
      } else {
        break
      }
    }

    setActiveEditorSectionId((current) =>
      current === nextActiveSectionId ? current : nextActiveSectionId
    )

    if (nextActiveSectionId === CHANNEL_EDITOR_SECTION_IDS.advanced) {
      advancedNavScrollPendingRef.current = false
      setExpandedEditorNavItemId(CHANNEL_EDITOR_SECTION_IDS.advanced)
      if (!advancedSettingsOpen) {
        handleAdvancedSettingsOpenChange(true)
      }
    } else if (!advancedNavScrollPendingRef.current) {
      setExpandedEditorNavItemId(undefined)
    }
  }, [advancedSettingsOpen, handleAdvancedSettingsOpenChange])

  useEffect(() => {
    if (!open || isChannelDetailLoading) return
    const formElement = channelFormRef.current
    if (!formElement) return

    updateActiveEditorSection()
    formElement.addEventListener('scroll', updateActiveEditorSection, {
      passive: true,
    })
    window.addEventListener('resize', updateActiveEditorSection)

    return () => {
      formElement.removeEventListener('scroll', updateActiveEditorSection)
      window.removeEventListener('resize', updateActiveEditorSection)
    }
  }, [isChannelDetailLoading, open, updateActiveEditorSection, channelFormRef])

  const onInvalid: SubmitErrorHandler<ChannelFormValues> = useCallback(
    (errors) => {
      if (hasAdvancedSettingsErrors(errors)) {
        handleAdvancedSettingsOpenChange(true)
      }
      toast.error(t('Please fix the highlighted fields before saving'))
    },
    [handleAdvancedSettingsOpenChange, t]
  )
  return {
    channelFormRef,
    activeEditorSectionId,
    expandedEditorNavItemId,
    resetNavigation,
    handleAdvancedSettingsOpenChange,
    handleEditorNavNavigate,
    onInvalid,
  }
}
