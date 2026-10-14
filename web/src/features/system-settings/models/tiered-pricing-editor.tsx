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
import { Plus } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
  tryParseRequestRuleExpr,
} from '@/features/pricing/lib/billing-expr'
import {
  type VisualConfig,
  createDefaultVisualConfig,
  generateExprFromVisualConfig,
  tryParseVisualConfig,
} from '@/features/pricing/lib/tier-expr'

import {
  buildRequestRuleExpr,
  createEmptyRuleGroup,
} from '../../pricing/lib/billing-request-rules'
import type { RequestRuleGroup } from '../../pricing/lib/billing-rule-types'
import { CostEstimator } from './tiered-pricing-estimator'
import { LlmPromptHelper } from './tiered-pricing-llm-help'
import { type Preset, PresetSection } from './tiered-pricing-presets'
import { RuleGroupCard } from './tiered-pricing-rule-group'
import { VisualEditor } from './tiered-pricing-visual'

// ---------------------------------------------------------------------------
// Raw expression editor
// ---------------------------------------------------------------------------

type RawExprEditorProps = {
  exprString: string
  onChange: (value: string) => void
}

function RawExprEditor({ exprString, onChange }: RawExprEditorProps) {
  const { t } = useTranslation()
  return (
    <div className='space-y-3'>
      <Alert>
        <AlertDescription className='space-y-1 text-xs'>
          <div>
            {t('Variables')}: <code>len</code>, <code>p</code>, <code>c</code>,{' '}
            <code>cr</code>, <code>cc</code>, <code>cc1h</code>,{' '}
            <code>img</code>, <code>img_o</code>, <code>ai</code>,{' '}
            <code>ao</code>
          </div>
          <div>
            {t('Functions')}: <code>tier(name, value)</code>, <code>max</code>,{' '}
            <code>min</code>, <code>ceil</code>, <code>floor</code>,{' '}
            <code>abs</code>, <code>header(name)</code>,{' '}
            <code>param(path)</code>, <code>has(source, text)</code>
          </div>
        </AlertDescription>
      </Alert>
      <Textarea
        value={exprString}
        onChange={(event) => onChange(event.target.value)}
        placeholder='tier("base", p * 3 + c * 15)'
        rows={6}
        className='font-mono text-xs'
        spellCheck={false}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export type TieredPricingEditorProps = {
  modelName?: string
  billingExpr: string
  requestRuleExpr: string
  onBillingExprChange: (next: string) => void
  onRequestRuleExprChange: (next: string) => void
}

type EditorMode = 'visual' | 'raw'

export const TieredPricingEditor = memo(function TieredPricingEditor({
  modelName,
  billingExpr: currentExpr,
  requestRuleExpr: currentRequestRuleExpr,
  onBillingExprChange,
  onRequestRuleExprChange,
}: TieredPricingEditorProps) {
  const { t } = useTranslation()
  const [editorMode, setEditorMode] = useState<EditorMode>('visual')
  const [visualConfig, setVisualConfig] = useState<VisualConfig | null>(() =>
    tryParseVisualConfig(currentExpr)
  )
  const [rawExpr, setRawExpr] = useState(() =>
    combineBillingExpr(currentExpr || '', currentRequestRuleExpr || '')
  )
  const [requestRuleGroups, setRequestRuleGroups] = useState<
    RequestRuleGroup[]
  >(() => tryParseRequestRuleExpr(currentRequestRuleExpr) || [])
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    const parsedConfig = tryParseVisualConfig(currentExpr)
    if (parsedConfig) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisualConfig(parsedConfig)
      setEditorMode('visual')
    } else if (currentExpr) {
      setVisualConfig(null)
      setEditorMode('raw')
    } else {
      setVisualConfig(createDefaultVisualConfig())
    }
    setRawExpr(
      combineBillingExpr(currentExpr || '', currentRequestRuleExpr || '')
    )
    setRequestRuleGroups(tryParseRequestRuleExpr(currentRequestRuleExpr) || [])
  }, [currentExpr, currentRequestRuleExpr])

  useEffect(() => {
    initRef.current = false
  }, [modelName])

  const canUseVisualRules = useMemo(() => {
    if (!currentRequestRuleExpr) return true
    return tryParseRequestRuleExpr(currentRequestRuleExpr) !== null
  }, [currentRequestRuleExpr])

  const effectiveExpr = useMemo(() => {
    if (editorMode === 'visual') {
      return generateExprFromVisualConfig(visualConfig)
    }
    const { billingExpr } = splitBillingExprAndRequestRules(rawExpr)
    return billingExpr
  }, [editorMode, visualConfig, rawExpr])

  useEffect(() => {
    if (effectiveExpr !== currentExpr) {
      onBillingExprChange(effectiveExpr)
    }
  }, [effectiveExpr, currentExpr, onBillingExprChange])

  useEffect(() => {
    if (editorMode !== 'visual') return
    const ruleExpr = buildRequestRuleExpr(requestRuleGroups)
    if (ruleExpr !== currentRequestRuleExpr) {
      onRequestRuleExprChange(ruleExpr)
    }
  }, [
    editorMode,
    requestRuleGroups,
    currentRequestRuleExpr,
    onRequestRuleExprChange,
  ])

  const handleVisualChange = useCallback((next: VisualConfig) => {
    setVisualConfig(next)
  }, [])

  const handleRawChange = useCallback(
    (value: string) => {
      setRawExpr(value)
      const { requestRuleExpr: ruleStr } =
        splitBillingExprAndRequestRules(value)
      onRequestRuleExprChange(ruleStr)
    },
    [onRequestRuleExprChange]
  )

  const handleModeChange = useCallback(
    (next: EditorMode) => {
      if (next === 'visual') {
        const { billingExpr, requestRuleExpr: ruleStr } =
          splitBillingExprAndRequestRules(rawExpr)
        const parsed = tryParseVisualConfig(billingExpr)
        if (parsed) {
          setVisualConfig(parsed)
        } else {
          setVisualConfig(createDefaultVisualConfig())
        }
        const parsedGroups = tryParseRequestRuleExpr(ruleStr)
        setRequestRuleGroups(parsedGroups || [])
        onRequestRuleExprChange(ruleStr)
      } else {
        const expr = generateExprFromVisualConfig(visualConfig)
        const ruleExpr = buildRequestRuleExpr(requestRuleGroups)
        setRawExpr(combineBillingExpr(expr, ruleExpr) || expr)
      }
      setEditorMode(next)
    },
    [rawExpr, visualConfig, requestRuleGroups, onRequestRuleExprChange]
  )

  const applyPreset = useCallback(
    (preset: Preset) => {
      const presetGroups = preset.requestRules || []
      const ruleExpr = buildRequestRuleExpr(presetGroups)
      const combined = combineBillingExpr(preset.expr, ruleExpr) || preset.expr
      setRawExpr(combined)
      const parsed = tryParseVisualConfig(preset.expr)
      if (parsed) {
        setVisualConfig(parsed)
        setEditorMode('visual')
      } else {
        setEditorMode('raw')
        setVisualConfig(null)
      }
      setRequestRuleGroups(presetGroups)
      onRequestRuleExprChange(ruleExpr)
    },
    [onRequestRuleExprChange]
  )

  const handleRuleGroupsChange = useCallback((next: RequestRuleGroup[]) => {
    setRequestRuleGroups(next)
  }, [])

  return (
    <div className='space-y-5'>
      <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
        <Field className='gap-2'>
          <FieldLabel>{t('Editor mode')}</FieldLabel>
          <Select
            items={[
              { value: 'visual', label: t('Visual editor') },
              { value: 'raw', label: t('Expression editor') },
            ]}
            value={editorMode}
            onValueChange={(value) => handleModeChange(value as EditorMode)}
          >
            <SelectTrigger className='w-full sm:w-56' size='sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='visual'>{t('Visual editor')}</SelectItem>
                <SelectItem value='raw'>{t('Expression editor')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {editorMode === 'raw' && (
          <div className='sm:pb-0.5'>
            <LlmPromptHelper modelName={modelName} />
          </div>
        )}
      </div>

      <PresetSection applyPreset={applyPreset} />

      <div className='bg-muted/30 space-y-3 rounded-md border p-3'>
        {editorMode === 'visual' ? (
          <VisualEditor
            visualConfig={visualConfig}
            onChange={handleVisualChange}
          />
        ) : (
          <RawExprEditor exprString={rawExpr} onChange={handleRawChange} />
        )}

        {editorMode === 'visual' && (
          <div className='space-y-3 border-t pt-3'>
            <div className='space-y-1'>
              <h4 className='text-sm font-medium'>
                {t('Request rule pricing')}
              </h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'When conditions match, the final price is multiplied by X. Multiple matches multiply together; values < 1 act as discounts.'
                )}
              </p>
            </div>

            {currentRequestRuleExpr && !canUseVisualRules ? (
              <Alert>
                <AlertDescription className='text-xs'>
                  {t(
                    'This expression is too complex for the visual editor. Please switch to expression mode to edit.'
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {requestRuleGroups.map((group, groupIndex) => (
                  <RuleGroupCard
                    // eslint-disable-next-line react/no-array-index-key -- Rule groups retain their expression order while edited.
                    key={groupIndex}
                    group={group}
                    index={groupIndex}
                    onChange={(next) => {
                      const updated = [...requestRuleGroups]
                      updated[groupIndex] = next
                      handleRuleGroupsChange(updated)
                    }}
                    onRemove={() =>
                      handleRuleGroupsChange(
                        requestRuleGroups.filter((_, i) => i !== groupIndex)
                      )
                    }
                  />
                ))}
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 w-36 justify-center'
                  onClick={() =>
                    handleRuleGroupsChange([
                      ...requestRuleGroups,
                      createEmptyRuleGroup(),
                    ])
                  }
                >
                  <Plus className='mr-2 h-4 w-4' />
                  {t('Add rule group')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <CostEstimator effectiveExpr={effectiveExpr} />
    </div>
  )
})
