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
import { SecureVerificationDialog } from '@/features/auth/secure-verification'

import { channelsQueryKeys, formatModelsArray } from '../../lib'
import { AdvancedCustomEditorDialog } from '../dialogs/advanced-custom-editor-dialog'
import { ClaudeOAuthDialog } from '../dialogs/claude-oauth-dialog'
import { CodexOAuthDialog } from '../dialogs/codex-oauth-dialog'
import { FetchModelsDialog } from '../dialogs/fetch-models-dialog'
import { MissingModelsConfirmationDialog } from '../dialogs/missing-models-confirmation-dialog'
import { ParamOverrideEditorDialog } from '../dialogs/param-override-editor-dialog'
import { StatusCodeRiskDialog } from '../dialogs/status-code-risk-dialog'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelEditorDialogs({
  paramOverrideEditorOpen,
  sensitiveLocked,
  form,
  setParamOverrideEditorOpen,
  advancedCustomEditorOpen,
  setAdvancedCustomEditorOpen,
  fetchModelsDialogOpen,
  setFetchModelsDialogOpen,
  redirectModelList,
  redirectModelKeyList,
  shouldPreviewUnsavedModels,
  formPreviewFetcher,
  currentName,
  currentModelsArray,
  isEditing,
  channelId,
  codexOAuthDialogOpen,
  setCodexOAuthDialogOpen,
  queryClient,
  claudeOAuthDialogOpen,
  setClaudeOAuthDialogOpen,
  verificationOpen,
  cancelVerification,
  verificationMethods,
  verificationState,
  executeVerification,
  setVerificationCode,
  switchVerificationMethod,
  missingModelsDialogOpen,
  missingModelsList,
  handleMissingModelsAction,
  setMissingModelsDialogOpen,
  statusCodeRiskOpen,
  handleStatusCodeRiskAction,
  statusCodeRiskDetailItems,
}: {
  paramOverrideEditorOpen: ReturnType<
    typeof useChannelEditor
  >['paramOverrideEditorOpen']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  form: ReturnType<typeof useChannelEditor>['form']
  setParamOverrideEditorOpen: ReturnType<
    typeof useChannelEditor
  >['setParamOverrideEditorOpen']
  advancedCustomEditorOpen: ReturnType<
    typeof useChannelEditor
  >['advancedCustomEditorOpen']
  setAdvancedCustomEditorOpen: ReturnType<
    typeof useChannelEditor
  >['setAdvancedCustomEditorOpen']
  fetchModelsDialogOpen: ReturnType<
    typeof useChannelEditor
  >['fetchModelsDialogOpen']
  setFetchModelsDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setFetchModelsDialogOpen']
  redirectModelList: ReturnType<typeof useChannelEditor>['redirectModelList']
  redirectModelKeyList: ReturnType<
    typeof useChannelEditor
  >['redirectModelKeyList']
  shouldPreviewUnsavedModels: ReturnType<
    typeof useChannelEditor
  >['shouldPreviewUnsavedModels']
  formPreviewFetcher: ReturnType<typeof useChannelEditor>['formPreviewFetcher']
  currentName: ReturnType<typeof useChannelEditor>['currentName']
  currentModelsArray: ReturnType<typeof useChannelEditor>['currentModelsArray']
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  channelId: ReturnType<typeof useChannelEditor>['channelId']
  codexOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['codexOAuthDialogOpen']
  setCodexOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setCodexOAuthDialogOpen']
  queryClient: ReturnType<typeof useChannelEditor>['queryClient']
  claudeOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['claudeOAuthDialogOpen']
  setClaudeOAuthDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setClaudeOAuthDialogOpen']
  verificationOpen: ReturnType<typeof useChannelEditor>['verificationOpen']
  cancelVerification: ReturnType<typeof useChannelEditor>['cancelVerification']
  verificationMethods: ReturnType<
    typeof useChannelEditor
  >['verificationMethods']
  verificationState: ReturnType<typeof useChannelEditor>['verificationState']
  executeVerification: ReturnType<
    typeof useChannelEditor
  >['executeVerification']
  setVerificationCode: ReturnType<
    typeof useChannelEditor
  >['setVerificationCode']
  switchVerificationMethod: ReturnType<
    typeof useChannelEditor
  >['switchVerificationMethod']
  missingModelsDialogOpen: ReturnType<
    typeof useChannelEditor
  >['missingModelsDialogOpen']
  missingModelsList: ReturnType<typeof useChannelEditor>['missingModelsList']
  handleMissingModelsAction: ReturnType<
    typeof useChannelEditor
  >['handleMissingModelsAction']
  setMissingModelsDialogOpen: ReturnType<
    typeof useChannelEditor
  >['setMissingModelsDialogOpen']
  statusCodeRiskOpen: ReturnType<typeof useChannelEditor>['statusCodeRiskOpen']
  handleStatusCodeRiskAction: ReturnType<
    typeof useChannelEditor
  >['handleStatusCodeRiskAction']
  statusCodeRiskDetailItems: ReturnType<
    typeof useChannelEditor
  >['statusCodeRiskDetailItems']
}) {
  return (
    <>
      {paramOverrideEditorOpen && !sensitiveLocked && (
        <ParamOverrideEditorDialog
          open={paramOverrideEditorOpen}
          value={form.watch('param_override') || ''}
          onOpenChange={setParamOverrideEditorOpen}
          onSave={(nextValue) => {
            form.setValue('param_override', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }}
        />
      )}

      {advancedCustomEditorOpen && !sensitiveLocked && (
        <AdvancedCustomEditorDialog
          open={advancedCustomEditorOpen}
          value={form.watch('advanced_custom') || ''}
          onOpenChange={setAdvancedCustomEditorOpen}
          onSave={(nextValue) => {
            form.setValue('advanced_custom', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }}
        />
      )}

      {/* Fetch Models Dialog */}
      <FetchModelsDialog
        open={fetchModelsDialogOpen}
        onOpenChange={setFetchModelsDialogOpen}
        onModelsSelected={(models) => {
          form.setValue('models', formatModelsArray(models))
        }}
        redirectModels={redirectModelList}
        redirectSourceModels={redirectModelKeyList}
        customFetcher={
          shouldPreviewUnsavedModels ? formPreviewFetcher : undefined
        }
        channelName={
          shouldPreviewUnsavedModels ? currentName?.trim() : undefined
        }
        existingModelsOverride={currentModelsArray}
      />

      <CodexOAuthDialog
        channelId={isEditing ? channelId : null}
        open={codexOAuthDialogOpen}
        onOpenChange={setCodexOAuthDialogOpen}
        onKeyGenerated={(key) => {
          if (key) form.setValue('key', key, { shouldDirty: true })
          else if (channelId) {
            queryClient.invalidateQueries({
              queryKey: channelsQueryKeys.detail(channelId),
            })
          }
        }}
      />

      <ClaudeOAuthDialog
        open={claudeOAuthDialogOpen}
        onOpenChange={setClaudeOAuthDialogOpen}
        onKeyGenerated={(key) => {
          if (key) form.setValue('key', key, { shouldDirty: true })
        }}
        channelId={isEditing ? channelId : null}
      />

      <SecureVerificationDialog
        open={verificationOpen}
        onOpenChange={(open) => {
          if (!open) {
            cancelVerification()
          }
        }}
        methods={verificationMethods}
        state={verificationState}
        onVerify={async (method, code) => {
          await executeVerification(method, code).catch(() => undefined)
        }}
        onCancel={cancelVerification}
        onCodeChange={setVerificationCode}
        onMethodChange={switchVerificationMethod}
      />

      {/* Missing Models Confirmation Dialog */}
      <MissingModelsConfirmationDialog
        open={missingModelsDialogOpen}
        missingModels={missingModelsList}
        onConfirm={handleMissingModelsAction}
        onOpenChange={setMissingModelsDialogOpen}
      />

      <StatusCodeRiskDialog
        open={statusCodeRiskOpen}
        onOpenChange={(v) => {
          if (!v) handleStatusCodeRiskAction(false)
        }}
        detailItems={statusCodeRiskDetailItems}
        onConfirm={() => handleStatusCodeRiskAction(true)}
      />
    </>
  )
}
