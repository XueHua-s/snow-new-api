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
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'

import { CHANNEL_TYPE_WARNINGS } from '../../constants'
import { ChannelAuthenticationFields } from './channel-authentication-fields'
import { CHANNEL_EDITOR_SECTION_IDS } from './channel-editor-state'
import { ChannelProviderFields } from './channel-provider-fields'
import { ChannelApiAccessSection } from './sections'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelCredentialFields({
  currentType,
  sensitiveLocked,
  form,
  vertexKeyType,
  isBatchMode,
  doubaoApiEditUnlocked,
  handleApiConfigSecretClick,
  advancedCustomStats,
  advancedCustomRouteTypeLabels,
  hiddenAdvancedCustomRouteTypeCount,
  advancedCustomRouteTypeTitle,
  setAdvancedCustomEditorOpen,
  isEditing,
  addModeOptions,
  awsKeyType,
  keyMode,
  isMultiKeyChannel,
  handleDeduplicateKeys,
  canRevealChannelKey,
  handleRevealKey,
  isChannelKeyLoading,
  verificationState,
  channelKey,
  copyToClipboard,
  setCodexOAuthDialogOpen,
  channelId,
  handleRefreshCodexCredential,
  isCodexCredentialRefreshing,
  setClaudeOAuthDialogOpen,
  multiKeyMode,
  multiKeyType,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  form: ReturnType<typeof useChannelEditor>['form']
  vertexKeyType: ReturnType<typeof useChannelEditor>['vertexKeyType']
  isBatchMode: ReturnType<typeof useChannelEditor>['isBatchMode']
  doubaoApiEditUnlocked: ReturnType<
    typeof useChannelEditor
  >['doubaoApiEditUnlocked']
  handleApiConfigSecretClick: ReturnType<
    typeof useChannelEditor
  >['handleApiConfigSecretClick']
  advancedCustomStats: ReturnType<
    typeof useChannelEditor
  >['advancedCustomStats']
  advancedCustomRouteTypeLabels: ReturnType<
    typeof useChannelEditor
  >['advancedCustomRouteTypeLabels']
  hiddenAdvancedCustomRouteTypeCount: ReturnType<
    typeof useChannelEditor
  >['hiddenAdvancedCustomRouteTypeCount']
  advancedCustomRouteTypeTitle: ReturnType<
    typeof useChannelEditor
  >['advancedCustomRouteTypeTitle']
  setAdvancedCustomEditorOpen: ReturnType<
    typeof useChannelEditor
  >['setAdvancedCustomEditorOpen']
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  addModeOptions: ReturnType<typeof useChannelEditor>['addModeOptions']
  awsKeyType: ReturnType<typeof useChannelEditor>['awsKeyType']
  keyMode: ReturnType<typeof useChannelEditor>['keyMode']
  isMultiKeyChannel: ReturnType<typeof useChannelEditor>['isMultiKeyChannel']
  handleDeduplicateKeys: ReturnType<
    typeof useChannelEditor
  >['handleDeduplicateKeys']
  canRevealChannelKey: ReturnType<
    typeof useChannelEditor
  >['canRevealChannelKey']
  handleRevealKey: ReturnType<typeof useChannelEditor>['handleRevealKey']
  isChannelKeyLoading: ReturnType<
    typeof useChannelEditor
  >['isChannelKeyLoading']
  verificationState: ReturnType<typeof useChannelEditor>['verificationState']
  channelKey: ReturnType<typeof useChannelEditor>['channelKey']
  copyToClipboard: ReturnType<typeof useChannelEditor>['copyToClipboard']
  setCodexOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setCodexOAuthDialogOpen']
  channelId: ReturnType<typeof useChannelEditor>['channelId']
  handleRefreshCodexCredential: ReturnType<
    typeof useChannelEditor
  >['handleRefreshCodexCredential']
  isCodexCredentialRefreshing: ReturnType<
    typeof useChannelEditor
  >['isCodexCredentialRefreshing']
  setClaudeOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setClaudeOAuthDialogOpen']
  multiKeyMode: ReturnType<typeof useChannelEditor>['multiKeyMode']
  multiKeyType: ReturnType<typeof useChannelEditor>['multiKeyType']
}) {
  const { t } = useTranslation()
  return (
    <div id={CHANNEL_EDITOR_SECTION_IDS.credentials} className='scroll-mt-4'>
      <ChannelApiAccessSection>
        {CHANNEL_TYPE_WARNINGS[currentType] && (
          <Alert>
            <AlertDescription>
              {t(CHANNEL_TYPE_WARNINGS[currentType])}
            </AlertDescription>
          </Alert>
        )}

        {sensitiveLocked && (
          <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
            <AlertDescription>
              {t('No permission to perform this action')}
            </AlertDescription>
          </Alert>
        )}

        <div className='border-border/60 bg-muted/10 rounded-lg border p-4'>
          <fieldset
            disabled={sensitiveLocked}
            className='space-y-4 disabled:opacity-60'
          >
            <ChannelProviderFields
              currentType={currentType}
              form={form}
              vertexKeyType={vertexKeyType}
              isBatchMode={isBatchMode}
              doubaoApiEditUnlocked={doubaoApiEditUnlocked}
              handleApiConfigSecretClick={handleApiConfigSecretClick}
              advancedCustomStats={advancedCustomStats}
              advancedCustomRouteTypeLabels={advancedCustomRouteTypeLabels}
              hiddenAdvancedCustomRouteTypeCount={
                hiddenAdvancedCustomRouteTypeCount
              }
              advancedCustomRouteTypeTitle={advancedCustomRouteTypeTitle}
              setAdvancedCustomEditorOpen={setAdvancedCustomEditorOpen}
            />
            <ChannelAuthenticationFields
              isEditing={isEditing}
              form={form}
              addModeOptions={addModeOptions}
              currentType={currentType}
              awsKeyType={awsKeyType}
              isBatchMode={isBatchMode}
              keyMode={keyMode}
              isMultiKeyChannel={isMultiKeyChannel}
              handleDeduplicateKeys={handleDeduplicateKeys}
              canRevealChannelKey={canRevealChannelKey}
              handleRevealKey={handleRevealKey}
              isChannelKeyLoading={isChannelKeyLoading}
              verificationState={verificationState}
              channelKey={channelKey}
              copyToClipboard={copyToClipboard}
              setCodexOAuthDialogOpen={setCodexOAuthDialogOpen}
              sensitiveLocked={sensitiveLocked}
              channelId={channelId}
              handleRefreshCodexCredential={handleRefreshCodexCredential}
              isCodexCredentialRefreshing={isCodexCredentialRefreshing}
              setClaudeOAuthDialogOpen={setClaudeOAuthDialogOpen}
              multiKeyMode={multiKeyMode}
              multiKeyType={multiKeyType}
            />
          </fieldset>
        </div>
      </ChannelApiAccessSection>
    </div>
  )
}
