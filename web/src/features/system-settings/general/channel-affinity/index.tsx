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
import { Edit, FileText, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { JsonCodeEditor } from '@/components/json-code-editor'
import { StatusBadge, StatusBadgeList } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

import { StaticDataTable } from '../../../../components/data-table/static/static-data-table'
import { SettingsSwitchField } from '../../components/settings-form-layout'
import { SettingsPageActionsPortal } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { RuleEditorDialog } from './rule-editor-dialog'
import { type Props, useChannelAffinity } from './use-channel-affinity'

function RuleBadgeList(props: { items: string[] }) {
  return (
    <StatusBadgeList
      items={props.items}
      max={2}
      getKey={(item) => item}
      renderItem={(item) => (
        <StatusBadge
          label={item}
          variant='neutral'
          size='sm'
          copyable={false}
        />
      )}
    />
  )
}

function ChannelAffinityConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  desc: ReactNode
  handleConfirm: () => void
  destructive?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      bodyClassName='flex items-start'
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant={props.destructive ? 'destructive' : 'default'}
            onClick={props.handleConfirm}
          >
            {t('Continue')}
          </Button>
        </>
      }
    >
      <div className='text-muted-foreground text-sm'>{props.desc}</div>
    </Dialog>
  )
}

export function ChannelAffinitySection(props: Props) {
  const { t } = useTranslation()
  const {
    enabled,
    setEnabled,
    switchOnSuccess,
    setSwitchOnSuccess,
    keepOnChannelDisabled,
    setKeepOnChannelDisabled,
    maxEntries,
    setMaxEntries,
    defaultTtl,
    setDefaultTtl,
    rules,
    editMode,
    jsonText,
    setJsonText,
    cacheStats,
    cacheLoading,
    saving,
    ruleEditorOpen,
    setRuleEditorOpen,
    editingRule,
    setEditingRule,
    ruleTemplateKey,
    setRuleTemplateKey,
    clearAllDialogOpen,
    setClearAllDialogOpen,
    clearRuleName,
    setClearRuleName,
    fillTemplateDialogOpen,
    setFillTemplateDialogOpen,
    refreshCache,
    appendCliTemplates,
    handleFillTemplates,
    handleSave,
    handleRuleSave,
    handleDeleteRule,
    handleClearAll,
    handleClearRule,
    switchToJsonMode,
    switchToVisualMode,
  } = useChannelAffinity(props)
  return (
    <>
      <SettingsSection title={t('Channel Affinity')}>
        <Alert>
          <AlertDescription className='text-xs'>
            {t(
              'Channel affinity reuses the last successful channel based on keys extracted from the request context or JSON body.'
            )}
          </AlertDescription>
        </Alert>

        {/* Basic Settings */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <SettingsSwitchField
            checked={enabled}
            onCheckedChange={setEnabled}
            label={t('Enable')}
            className='py-0'
          />
          <div className='grid gap-1.5'>
            <Label>{t('Max Entries')}</Label>
            <Input
              type='number'
              min={0}
              value={maxEntries}
              onChange={(e) => setMaxEntries(Number(e.target.value))}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Default TTL (seconds)')}</Label>
            <Input
              type='number'
              min={0}
              value={defaultTtl}
              onChange={(e) => setDefaultTtl(Number(e.target.value))}
            />
          </div>
        </div>

        <SettingsSwitchField
          checked={switchOnSuccess}
          onCheckedChange={setSwitchOnSuccess}
          label={t('Switch affinity on success')}
          description={t(
            'If the affinity channel fails and retry succeeds on another channel, update affinity to the successful channel.'
          )}
        />
        <SettingsSwitchField
          checked={keepOnChannelDisabled}
          onCheckedChange={setKeepOnChannelDisabled}
          label={t('Keep affinity when channel is disabled')}
          description={t(
            'When enabled, keep the affinity entry even if the affinity channel is disabled or no longer usable for the current group/model. Leave it off to delete the entry and select another channel.'
          )}
        />

        <Separator />

        <SettingsPageActionsPortal>
          <Button
            variant={editMode === 'visual' ? 'default' : 'outline'}
            size='sm'
            onClick={editMode === 'json' ? switchToVisualMode : undefined}
          >
            {t('Visual')}
          </Button>
          <Button
            variant={editMode === 'json' ? 'default' : 'outline'}
            size='sm'
            onClick={editMode === 'visual' ? switchToJsonMode : undefined}
          >
            JSON
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant='outline' size='sm' />}
            >
              <Plus className='mr-1 h-3 w-3' />
              {t('Add Rule')}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  setEditingRule(null)
                  setRuleTemplateKey(null)
                  setRuleEditorOpen(true)
                }}
              >
                {t('Blank Rule')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setEditingRule(null)
                  setRuleTemplateKey('codexCli')
                  setRuleEditorOpen(true)
                }}
              >
                Codex CLI
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setEditingRule(null)
                  setRuleTemplateKey('claudeCli')
                  setRuleEditorOpen(true)
                }}
              >
                Claude CLI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant='outline' size='sm' onClick={handleFillTemplates}>
            <FileText className='mr-1 h-3 w-3' />
            {t('Fill Templates')}
          </Button>
          <Button size='sm' onClick={handleSave} disabled={saving}>
            {saving ? t('Saving...') : t('Save')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={refreshCache}
            disabled={cacheLoading}
          >
            <RefreshCw
              className={`mr-1 h-3 w-3 ${cacheLoading ? 'animate-spin' : ''}`}
            />
            {t('Refresh Cache')}
          </Button>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setClearAllDialogOpen(true)}
          >
            {t('Clear All Cache')}
          </Button>
          {cacheStats && (
            <span className='text-muted-foreground text-xs'>
              {t('Cache Entries')}: {cacheStats.total} /{' '}
              {cacheStats.cache_capacity}
            </span>
          )}
        </SettingsPageActionsPortal>

        {/* Rules Table or JSON Editor */}
        {editMode === 'visual' ? (
          <StaticDataTable
            tableClassName='min-w-max'
            data={rules}
            emptyClassName='text-muted-foreground py-8'
            emptyContent={t('No rules yet')}
            columns={[
              {
                id: 'name',
                header: t('Name'),
                cellClassName: 'font-medium',
                cell: (rule) => rule.name || '-',
              },
              {
                id: 'model-regex',
                header: t('Model Regex'),
                cell: (rule) => (
                  <RuleBadgeList items={rule.model_regex || []} />
                ),
              },
              {
                id: 'key-sources',
                header: t('Key Sources'),
                cell: (rule) => (
                  <RuleBadgeList
                    items={(rule.key_sources || []).map(
                      (src) =>
                        `${src.type}:${src.type === 'gjson' ? src.path : src.key}`
                    )}
                  />
                ),
              },
              {
                id: 'ttl',
                header: t('TTL'),
                cell: (rule) => rule.ttl_seconds || '-',
              },
              {
                id: 'retry',
                header: t('Retry'),
                cell: (rule) => (
                  <StatusBadge
                    label={
                      rule.skip_retry_on_failure ? t('No Retry') : t('Retry')
                    }
                    variant={rule.skip_retry_on_failure ? 'danger' : 'neutral'}
                    copyable={false}
                  />
                ),
              },
              {
                id: 'scope',
                header: t('Scope'),
                cell: (rule) => {
                  const scopeItems = [
                    rule.include_using_group && t('Group'),
                    rule.include_model_name && t('Model'),
                    rule.include_rule_name && t('Rule'),
                  ].filter(Boolean) as string[]
                  if (scopeItems.length === 0) return '-'
                  return <RuleBadgeList items={scopeItems} />
                },
              },
              {
                id: 'cache',
                header: t('Cache'),
                cell: (rule) =>
                  rule.include_rule_name && cacheStats?.by_rule_name
                    ? cacheStats.by_rule_name[rule.name] || 0
                    : 'N/A',
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'text-right',
                cellClassName: 'text-right',
                cell: (rule, idx) => (
                  <div className='flex justify-end gap-1'>
                    {rule.include_rule_name && (
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        onClick={() => setClearRuleName(rule.name)}
                        title={t('Clear cache for this rule')}
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    )}
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7'
                      onClick={() => {
                        setEditingRule(rule)
                        setRuleTemplateKey(null)
                        setRuleEditorOpen(true)
                      }}
                    >
                      <Edit className='h-3 w-3' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7'
                      onClick={() => handleDeleteRule(idx)}
                    >
                      <Trash2 className='h-3 w-3' />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className='grid gap-1.5'>
            <Label htmlFor='channel-affinity-rules-json'>
              {t('Rules JSON')}
            </Label>
            <JsonCodeEditor
              id='channel-affinity-rules-json'
              value={jsonText}
              onChange={setJsonText}
              heightClassName='h-[300px] min-h-[300px] max-h-[300px]'
            />
          </div>
        )}
      </SettingsSection>

      <RuleEditorDialog
        open={ruleEditorOpen}
        onOpenChange={setRuleEditorOpen}
        rule={editingRule}
        onSave={handleRuleSave}
        templateKey={ruleTemplateKey}
      />

      <ChannelAffinityConfirmDialog
        open={clearAllDialogOpen}
        onOpenChange={setClearAllDialogOpen}
        title={t('Confirm clearing all channel affinity cache')}
        desc={t(
          'This will delete all channel affinity cache entries still in memory.'
        )}
        handleConfirm={handleClearAll}
        destructive
      />

      {clearRuleName !== null && (
        <ChannelAffinityConfirmDialog
          open
          onOpenChange={(v) => !v && setClearRuleName(null)}
          title={t('Confirm clearing cache for this rule')}
          desc={`${t('Rule')}: ${clearRuleName}`}
          handleConfirm={handleClearRule}
          destructive
        />
      )}

      <ChannelAffinityConfirmDialog
        open={fillTemplateDialogOpen}
        onOpenChange={setFillTemplateDialogOpen}
        title={t('Fill Codex CLI / Claude CLI Templates')}
        desc={t(
          'This will append 2 template rules (Codex CLI and Claude CLI) to the existing rule list.'
        )}
        handleConfirm={appendCliTemplates}
      />
    </>
  )
}
