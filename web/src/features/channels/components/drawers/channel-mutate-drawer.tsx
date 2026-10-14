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
import { Loader2, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerSectionClassName,
} from '@/components/drawer-layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
} from '@/components/ui/sheet'

import { FIELD_PASSTHROUGH_TYPES, MODEL_FETCHABLE_TYPES } from '../../constants'
import { ChannelCredentialFields } from './channel-credentials-fields'
import { ChannelTypeLogo, CardHeading } from './channel-editor-controls'
import { ChannelEditorDialogs } from './channel-editor-dialogs'
import { ChannelEditorHeader } from './channel-editor-header'
import { ChannelEditorNav } from './channel-editor-navigation'
import { CHANNEL_EDITOR_SECTION_IDS } from './channel-editor-state'
import { ChannelTransportFields } from './channel-extra-settings-fields'
import { ChannelPassthroughFields } from './channel-field-passthrough-fields'
import { ChannelIdentityFields } from './channel-identity-fields'
import { ChannelNotesFields } from './channel-internal-notes-fields'
import { ChannelModelDetectionFields } from './channel-model-detection-fields'
import { ChannelModelFields } from './channel-models-fields'
import { ChannelOverrideFields } from './channel-override-rules-fields'
import { ChannelRoutingFields } from './channel-routing-strategy-fields'
import { ChannelAdvancedSection, ChannelEditorLoadingState } from './sections'
import {
  type ChannelMutateDrawerProps,
  useChannelEditor,
} from './use-channel-editor'

export function ChannelMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: ChannelMutateDrawerProps) {
  const { t } = useTranslation()
  const {
    queryClient,
    canEditSensitive,
    canRevealChannelKey,
    fetchModelsDialogOpen,
    setFetchModelsDialogOpen,
    channelKey,
    isChannelKeyLoading,
    codexOAuthDialogOpen,
    setCodexOAuthDialogOpen,
    claudeOAuthDialogOpen,
    setClaudeOAuthDialogOpen,
    isCodexCredentialRefreshing,
    statusCodeRiskOpen,
    statusCodeRiskDetailItems,
    missingModelsDialogOpen,
    setMissingModelsDialogOpen,
    missingModelsList,
    channelFormRef,
    activeEditorSectionId,
    expandedEditorNavItemId,
    advancedSettingsOpen,
    paramOverrideEditorOpen,
    setParamOverrideEditorOpen,
    advancedCustomEditorOpen,
    setAdvancedCustomEditorOpen,
    clipboardConnectionInfo,
    setClipboardConnectionInfo,
    isEditing,
    channelId,
    sensitiveLocked,
    isLoadingGroups,
    copyToClipboard,
    verificationOpen,
    verificationMethods,
    verificationState,
    executeVerification,
    cancelVerification,
    setVerificationCode,
    switchVerificationMethod,
    isMultiKeyChannel,
    form,
    multiKeyMode,
    multiKeyType,
    keyMode,
    currentType,
    currentName,
    awsKeyType,
    vertexKeyType,
    upstreamModelUpdateCheckEnabled,
    currentHttpProtocol,
    shouldPreviewUnsavedModels,
    doubaoApiEditUnlocked,
    handleApiConfigSecretClick,
    applyConnectionInfo,
    pasteConnectionInfoFromClipboard,
    isBatchMode,
    isChannelDetailLoading,
    addModeOptions,
    advancedCustomStats,
    advancedCustomRouteTypeLabels,
    hiddenAdvancedCustomRouteTypeCount,
    advancedCustomRouteTypeTitle,
    allModelsList,
    basicModels,
    prefillGroups,
    groupOptions,
    currentModelsArray,
    currentTypeLabel,
    channelTypeOptions,
    currentStatusLabel,
    progressLabel,
    advancedSummary,
    routingStrategyConfigured,
    internalNotesConfigured,
    overrideRulesConfigured,
    extraSettingsConfigured,
    fieldPassthroughConfigured,
    upstreamModelDetectionConfigured,
    editorNavItems,
    redirectModelList,
    redirectModelKeyList,
    modelOptions,
    modelMappingGuardrail,
    mappingPreviewPairs,
    remainingMappingCount,
    upstreamUpdateMeta,
    upstreamDetectedModelsPreview,
    upstreamDetectedModelsOmittedCount,
    handleDeduplicateKeys,
    handleRevealKey,
    handleRefreshCodexCredential,
    updateModels,
    handleFetchModels,
    formPreviewFetcher,
    handleFillRelatedModels,
    handleFillAllModels,
    handleClearModels,
    handleCopyModels,
    handleAddPrefillGroup,
    handleModelsChange,
    handleMissingModelsAction,
    handleStatusCodeRiskAction,
    isSubmitting,
    onSubmit,
    handleAdvancedSettingsOpenChange,
    handleEditorNavNavigate,
    onInvalid,
    handleOpenChange,
  } = useChannelEditor({ open, onOpenChange, currentRow })
  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className={sideDrawerContentClassName('sm:max-w-5xl')}>
          <ChannelEditorHeader
            currentType={currentType}
            isEditing={isEditing}
            currentTypeLabel={currentTypeLabel}
            pasteConnectionInfoFromClipboard={pasteConnectionInfoFromClipboard}
          />

          {sensitiveLocked && (
            <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
              <AlertDescription>
                {t(
                  'Sensitive channel settings are read-only for your account.'
                )}{' '}
                {t(
                  'You can still edit non-sensitive operations fields such as models, groups, priority, and weight.'
                )}
              </AlertDescription>
            </Alert>
          )}

          {!isEditing && clipboardConnectionInfo && (
            <Alert>
              <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <span>{t('Connection info detected in clipboard')}</span>
                <span className='flex shrink-0 gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    onClick={() => applyConnectionInfo(clipboardConnectionInfo)}
                  >
                    {t('Fill in')}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => setClipboardConnectionInfo(null)}
                  >
                    {t('Ignore')}
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form
              id='channel-form'
              ref={channelFormRef}
              onSubmit={form.handleSubmit(onSubmit, onInvalid)}
              className={sideDrawerFormClassName('gap-5')}
            >
              {isChannelDetailLoading ? (
                <ChannelEditorLoadingState />
              ) : (
                <div className='grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start'>
                  <ChannelEditorNav
                    providerLogo={
                      <ChannelTypeLogo type={currentType} size={18} />
                    }
                    providerLabel={t(currentTypeLabel)}
                    statusLabel={t(currentStatusLabel)}
                    progressLabel={progressLabel}
                    navigationLabel={t('Channels')}
                    items={editorNavItems}
                    activeItemId={activeEditorSectionId}
                    expandedItemId={expandedEditorNavItemId}
                    onNavigate={handleEditorNavNavigate}
                  />
                  <div className='flex min-w-0 flex-col gap-5'>
                    {/* ── Basic Information ── */}
                    <ChannelIdentityFields
                      sensitiveLocked={sensitiveLocked}
                      form={form}
                      channelTypeOptions={channelTypeOptions}
                      isEditing={isEditing}
                      currentType={currentType}
                    />

                    {/* ── API Access ── */}
                    <ChannelCredentialFields
                      currentType={currentType}
                      sensitiveLocked={sensitiveLocked}
                      form={form}
                      vertexKeyType={vertexKeyType}
                      isBatchMode={isBatchMode}
                      doubaoApiEditUnlocked={doubaoApiEditUnlocked}
                      handleApiConfigSecretClick={handleApiConfigSecretClick}
                      advancedCustomStats={advancedCustomStats}
                      advancedCustomRouteTypeLabels={
                        advancedCustomRouteTypeLabels
                      }
                      hiddenAdvancedCustomRouteTypeCount={
                        hiddenAdvancedCustomRouteTypeCount
                      }
                      advancedCustomRouteTypeTitle={
                        advancedCustomRouteTypeTitle
                      }
                      setAdvancedCustomEditorOpen={setAdvancedCustomEditorOpen}
                      isEditing={isEditing}
                      addModeOptions={addModeOptions}
                      awsKeyType={awsKeyType}
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
                      channelId={channelId}
                      handleRefreshCodexCredential={
                        handleRefreshCodexCredential
                      }
                      isCodexCredentialRefreshing={isCodexCredentialRefreshing}
                      setClaudeOAuthDialogOpen={setClaudeOAuthDialogOpen}
                      multiKeyMode={multiKeyMode}
                      multiKeyType={multiKeyType}
                    />

                    {/* ── Models & Groups ── */}
                    <ChannelModelFields
                      form={form}
                      currentModelsArray={currentModelsArray}
                      modelOptions={modelOptions}
                      handleModelsChange={handleModelsChange}
                      modelMappingGuardrail={modelMappingGuardrail}
                      updateModels={updateModels}
                      handleFillRelatedModels={handleFillRelatedModels}
                      basicModels={basicModels}
                      handleFillAllModels={handleFillAllModels}
                      allModelsList={allModelsList}
                      currentType={currentType}
                      handleFetchModels={handleFetchModels}
                      isEditing={isEditing}
                      canEditSensitive={canEditSensitive}
                      handleCopyModels={handleCopyModels}
                      handleClearModels={handleClearModels}
                      prefillGroups={prefillGroups}
                      handleAddPrefillGroup={handleAddPrefillGroup}
                      mappingPreviewPairs={mappingPreviewPairs}
                      remainingMappingCount={remainingMappingCount}
                      isSubmitting={isSubmitting}
                      isLoadingGroups={isLoadingGroups}
                      groupOptions={groupOptions}
                    />

                    <div
                      id={CHANNEL_EDITOR_SECTION_IDS.advanced}
                      className='scroll-mt-4'
                    >
                      <ChannelAdvancedSection
                        open={advancedSettingsOpen}
                        onOpenChange={handleAdvancedSettingsOpenChange}
                        summary={advancedSummary}
                      >
                        {/* ── Routing & Overrides ── */}
                        <div className={sideDrawerSectionClassName()}>
                          <CardHeading
                            title={t('Routing & Overrides')}
                            icon={<Route className='h-4 w-4' />}
                            iconTone='info'
                          />
                          <ChannelRoutingFields
                            routingStrategyConfigured={
                              routingStrategyConfigured
                            }
                            form={form}
                          />

                          <ChannelNotesFields
                            internalNotesConfigured={internalNotesConfigured}
                            form={form}
                          />

                          <ChannelOverrideFields
                            overrideRulesConfigured={overrideRulesConfigured}
                            form={form}
                            isSubmitting={isSubmitting}
                            sensitiveLocked={sensitiveLocked}
                            setParamOverrideEditorOpen={
                              setParamOverrideEditorOpen
                            }
                          />
                        </div>

                        {/* ── Extra Settings ── */}
                        <ChannelTransportFields
                          extraSettingsConfigured={extraSettingsConfigured}
                          sensitiveLocked={sensitiveLocked}
                          currentType={currentType}
                          isSubmitting={isSubmitting}
                          form={form}
                          currentHttpProtocol={currentHttpProtocol}
                        />

                        {FIELD_PASSTHROUGH_TYPES.has(currentType) && (
                          <ChannelPassthroughFields
                            fieldPassthroughConfigured={
                              fieldPassthroughConfigured
                            }
                            sensitiveLocked={sensitiveLocked}
                            form={form}
                            currentType={currentType}
                          />
                        )}

                        {MODEL_FETCHABLE_TYPES.has(currentType) && (
                          <ChannelModelDetectionFields
                            upstreamModelDetectionConfigured={
                              upstreamModelDetectionConfigured
                            }
                            sensitiveLocked={sensitiveLocked}
                            form={form}
                            upstreamModelUpdateCheckEnabled={
                              upstreamModelUpdateCheckEnabled
                            }
                            upstreamUpdateMeta={upstreamUpdateMeta}
                            upstreamDetectedModelsPreview={
                              upstreamDetectedModelsPreview
                            }
                            upstreamDetectedModelsOmittedCount={
                              upstreamDetectedModelsOmittedCount
                            }
                          />
                        )}
                      </ChannelAdvancedSection>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </Form>

          <SheetFooter className={sideDrawerFooterClassName()}>
            <SheetClose
              render={<Button variant='outline' disabled={isSubmitting} />}
            >
              {t('Cancel')}
            </SheetClose>
            <Button form='channel-form' type='submit' disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              {isEditing ? t('Update Channel') : t('Save changes')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ChannelEditorDialogs
        paramOverrideEditorOpen={paramOverrideEditorOpen}
        sensitiveLocked={sensitiveLocked}
        form={form}
        setParamOverrideEditorOpen={setParamOverrideEditorOpen}
        advancedCustomEditorOpen={advancedCustomEditorOpen}
        setAdvancedCustomEditorOpen={setAdvancedCustomEditorOpen}
        fetchModelsDialogOpen={fetchModelsDialogOpen}
        setFetchModelsDialogOpen={setFetchModelsDialogOpen}
        redirectModelList={redirectModelList}
        redirectModelKeyList={redirectModelKeyList}
        shouldPreviewUnsavedModels={shouldPreviewUnsavedModels}
        formPreviewFetcher={formPreviewFetcher}
        currentName={currentName}
        currentModelsArray={currentModelsArray}
        isEditing={isEditing}
        channelId={channelId}
        codexOAuthDialogOpen={codexOAuthDialogOpen}
        setCodexOAuthDialogOpen={setCodexOAuthDialogOpen}
        queryClient={queryClient}
        claudeOAuthDialogOpen={claudeOAuthDialogOpen}
        setClaudeOAuthDialogOpen={setClaudeOAuthDialogOpen}
        verificationOpen={verificationOpen}
        cancelVerification={cancelVerification}
        verificationMethods={verificationMethods}
        verificationState={verificationState}
        executeVerification={executeVerification}
        setVerificationCode={setVerificationCode}
        switchVerificationMethod={switchVerificationMethod}
        missingModelsDialogOpen={missingModelsDialogOpen}
        missingModelsList={missingModelsList}
        handleMissingModelsAction={handleMissingModelsAction}
        setMissingModelsDialogOpen={setMissingModelsDialogOpen}
        statusCodeRiskOpen={statusCodeRiskOpen}
        handleStatusCodeRiskAction={handleStatusCodeRiskAction}
        statusCodeRiskDetailItems={statusCodeRiskDetailItems}
      />
    </>
  )
}
