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
import * as React from 'react'
import type { SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { removeTrailingSlash } from './utils'
import {
  type CatalogStore,
  type PairOrphanError,
  type PairResult,
  createWaffoPancakePair,
  listWaffoPancakeCatalog,
} from './waffo-pancake-api'

export type WaffoPancakeSettingsValues = {
  WaffoPancakeMerchantID: string
  WaffoPancakePrivateKey: string
  WaffoPancakeReturnURL: string
}

export interface WaffoPancakeBinding {
  storeID: string
  productID: string
}

export interface Props {
  defaultValues: WaffoPancakeSettingsValues
  values: WaffoPancakeSettingsValues
  onValueChange: <K extends keyof WaffoPancakeSettingsValues>(
    key: K,
    value: WaffoPancakeSettingsValues[K]
  ) => void
  selectedBinding: WaffoPancakeBinding
  savedBinding: WaffoPancakeBinding
  onSelectedBindingChange: (value: SetStateAction<WaffoPancakeBinding>) => void
}

export const PANCAKE_DASHBOARD_URL =
  'https://pancake.waffo.ai/merchant/dashboard'

const DEFAULT_NEW_STORE_NAME = 'new-api-store'

const DEFAULT_NEW_PRODUCT_NAME = 'new-api-charge-product'

export const DEFAULT_NEW_PAIR_NAME = `${DEFAULT_NEW_STORE_NAME} + ${DEFAULT_NEW_PRODUCT_NAME}`

export function useWaffoPancake({
  defaultValues,
  values,
  selectedBinding,
  savedBinding,
  onSelectedBindingChange,
}: Props) {
  const { t } = useTranslation()

  const [phase, setPhase] = React.useState<'idle' | 'verifying'>('idle')
  const [catalog, setCatalog] = React.useState<CatalogStore[]>([])
  const [creatingPair, setCreatingPair] = React.useState(false)
  const chosenStoreID = selectedBinding.storeID
  const chosenProductID = selectedBinding.productID
  const storeID = savedBinding.storeID
  const productID = savedBinding.productID
  const returnURL = values.WaffoPancakeReturnURL

  const initialRef = React.useRef(defaultValues)
  const defaultsSignature = React.useMemo(
    () => JSON.stringify(defaultValues),
    [defaultValues]
  )

  // "merchantID|privateKey" of the last verified pair; debounced verify
  // skips when nothing changed.
  const lastVerifiedSignature = React.useRef('')
  const fetchSerialRef = React.useRef(0)

  // Mount-only — never re-sync from props after the first render. The
  // backend strips PrivateKey from GET /api/option/, so a re-sync would
  // wipe whatever the operator just typed.
  const didMountRef = React.useRef(false)
  React.useEffect(() => {
    const parsed = JSON.parse(defaultsSignature) as WaffoPancakeSettingsValues
    initialRef.current = parsed
    if (didMountRef.current) return
    didMountRef.current = true
    lastVerifiedSignature.current = `${parsed.WaffoPancakeMerchantID.trim()}|${parsed.WaffoPancakePrivateKey.trim()}`
  }, [defaultsSignature])

  const productsForChosenStore = React.useMemo(() => {
    if (!chosenStoreID) return []
    return catalog.find((s) => s.id === chosenStoreID)?.onetimeProducts ?? []
  }, [catalog, chosenStoreID])

  // Raw-ID fallback items render the trigger before the catalog loads or
  // when the saved entity has been deleted upstream.
  const storeSelectItems = React.useMemo(() => {
    const items = catalog.map((s) => ({
      value: s.id,
      label: `${s.name} (${s.id})`,
    }))
    if (chosenStoreID && !catalog.some((s) => s.id === chosenStoreID)) {
      items.push({ value: chosenStoreID, label: chosenStoreID })
    }
    return items
  }, [catalog, chosenStoreID])
  const productSelectItems = React.useMemo(() => {
    const items = productsForChosenStore.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.id})`,
    }))
    if (
      chosenProductID &&
      !productsForChosenStore.some((p) => p.id === chosenProductID)
    ) {
      items.push({ value: chosenProductID, label: chosenProductID })
    }
    return items
  }, [productsForChosenStore, chosenProductID])

  // Verifies typed creds against Pancake (via /catalog) and refreshes the
  // dropdown options. `preselect` overrides the post-load anchor selection;
  // omitting it defaults to: saved binding → first store with products.
  const verifyAndFetchCatalog = React.useCallback(
    async (
      merchantID: string,
      privateKey: string,
      preselect?: { storeID?: string; productID?: string }
    ) => {
      const serial = ++fetchSerialRef.current
      let stores: CatalogStore[]
      try {
        const body = await listWaffoPancakeCatalog(merchantID, privateKey)
        if (serial !== fetchSerialRef.current) return
        if (
          body?.message === 'success' &&
          typeof body.data === 'object' &&
          body.data
        ) {
          stores = (body.data as { stores: CatalogStore[] }).stores ?? []
        } else {
          const reason = typeof body?.data === 'string' ? body.data : undefined
          toast.error(
            reason
              ? `${t('Credentials verification failed')}: ${reason}`
              : t(
                  'Credentials verification failed — double-check Merchant ID and API private key.'
                )
          )
          setPhase('idle')
          return
        }
      } catch (err) {
        if (serial !== fetchSerialRef.current) return
        toast.error(
          `${t('Credentials verification failed')}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
        setPhase('idle')
        return
      }
      if (serial !== fetchSerialRef.current) return

      setCatalog(stores)
      if (preselect) {
        onSelectedBindingChange({
          storeID: preselect.storeID ?? '',
          productID: preselect.productID ?? '',
        })
      } else {
        // Default anchor: bound product if found, else first product of
        // the first store with any — saves a click for new operators.
        const boundStore = stores.find((s) =>
          s.onetimeProducts.some((p) => p.id === productID)
        )
        if (boundStore && productID) {
          onSelectedBindingChange({
            storeID: boundStore.id,
            productID,
          })
        } else {
          const storeWithProducts = stores.find(
            (s) => s.onetimeProducts.length > 0
          )
          if (storeWithProducts) {
            onSelectedBindingChange({
              storeID: storeWithProducts.id,
              productID: storeWithProducts.onetimeProducts[0].id,
            })
          } else {
            onSelectedBindingChange({ storeID: '', productID: '' })
          }
        }
      }
      setPhase('idle')
    },
    [onSelectedBindingChange, productID, t]
  )

  const watchedMerchantID = values.WaffoPancakeMerchantID || ''
  const watchedPrivateKey = values.WaffoPancakePrivateKey || ''
  React.useEffect(() => {
    const m = watchedMerchantID.trim()
    const k = watchedPrivateKey.trim()
    if (!m || !k) return
    const signature = `${m}|${k}`
    if (signature === lastVerifiedSignature.current) return
    const timer = setTimeout(() => {
      lastVerifiedSignature.current = signature
      setPhase('verifying')
      void verifyAndFetchCatalog(m, k)
    }, 800)
    return () => clearTimeout(timer)
  }, [watchedMerchantID, watchedPrivateKey, verifyAndFetchCatalog])

  // Initial-load verify: GET /api/option/ strips PrivateKey so a returning
  // admin opens the page with empty key. Send blank creds in the body —
  // the catalog controller falls back to the persisted OptionMap creds.
  const initialLoadRef = React.useRef(false)
  React.useEffect(() => {
    if (initialLoadRef.current) return
    if (!defaultValues.WaffoPancakeMerchantID.trim()) return
    initialLoadRef.current = true
    const timer = window.setTimeout(() => {
      setPhase('verifying')
      void verifyAndFetchCatalog('', '')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [defaultValues.WaffoPancakeMerchantID, verifyAndFetchCatalog])

  // Returns typed creds when the operator edited either field; otherwise
  // blanks so the backend falls back to persisted creds. Without this,
  // returning admins (saved merchant ID but empty key field) would send
  // a mixed-state body that the backend rejects.
  const readCreds = () => {
    const formMerchant = (values.WaffoPancakeMerchantID || '').trim()
    const formKey = (values.WaffoPancakePrivateKey || '').trim()
    const saved = (defaultValues.WaffoPancakeMerchantID || '').trim()
    const edited = formMerchant !== saved || formKey.length > 0
    if (!edited) return { merchantID: '', privateKey: '' }
    return { merchantID: formMerchant, privateKey: formKey }
  }

  // The minted product's SuccessURL is pinned to the current Return URL
  // field, so we prompt before creating when that field is empty.
  const handleCreatePair = async () => {
    if (!credsReady) {
      toast.error(
        t('Fill in both Merchant ID and API Private Key before creating.')
      )
      return
    }
    const { merchantID, privateKey } = readCreds()
    const trimmedReturn = removeTrailingSlash(returnURL.trim())
    if (!trimmedReturn) {
      if (
        !window.confirm(
          t(
            'Payment return URL is empty. Create the product without a SuccessURL redirect?'
          )
        )
      ) {
        return
      }
    }
    setCreatingPair(true)
    try {
      const body = await createWaffoPancakePair({
        merchantID,
        privateKey,
        returnURL: trimmedReturn,
      })
      if (
        body?.message === 'success' &&
        typeof body.data === 'object' &&
        body.data
      ) {
        const created = body.data as PairResult
        // Refetch from GraphQL rather than trusting the response body so the
        // dropdowns reflect authoritative state, then anchor on minted IDs.
        setPhase('verifying')
        await verifyAndFetchCatalog(merchantID, privateKey, {
          storeID: created.store_id,
          productID: created.product_id,
        })
        toast.success(
          `${t('Store + product created')}: ${created.store_id} / ${created.product_id}`
        )
        return
      }
      const errData =
        body && typeof body.data === 'object' && body.data !== null
          ? (body.data as PairOrphanError)
          : null
      if (errData?.orphan_store && errData.store_id) {
        setPhase('verifying')
        await verifyAndFetchCatalog(merchantID, privateKey, {
          storeID: errData.store_id,
          productID: '',
        })
      }
      const reason =
        errData?.error ??
        (typeof body?.data === 'string' ? body.data : undefined)
      toast.error(
        reason ? `${t('Creation failed')}: ${reason}` : t('Creation failed')
      )
    } catch (err) {
      toast.error(
        `${t('Creation failed')}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setCreatingPair(false)
    }
  }

  const verifying = phase === 'verifying'

  // "Not edited" = MerchantID unchanged AND PrivateKey field blank, in
  // which case the backend falls back to persisted creds. Otherwise we
  // require both fields filled (mixed states would fail signature check).
  const savedMerchantID = (defaultValues.WaffoPancakeMerchantID || '').trim()
  const formMerchantID = watchedMerchantID.trim()
  const formPrivateKey = watchedPrivateKey.trim()
  const credsEdited =
    formMerchantID !== savedMerchantID || formPrivateKey.length > 0
  const hasSavedCreds = savedMerchantID.length > 0
  const credsReady = credsEdited
    ? formMerchantID.length > 0 && formPrivateKey.length > 0
    : hasSavedCreds
  const hasCatalog = catalog.length > 0

  let bindStatusMessage: string
  if (!credsReady) {
    bindStatusMessage = t('Fill in the credentials above to begin.')
  } else if (verifying) {
    bindStatusMessage = t(
      'Verifying credentials and pulling stores from your Pancake account...'
    )
  } else if (hasCatalog) {
    bindStatusMessage = t(
      'Mint a fresh pair below — or pick an existing one further down. Click Save when ready.'
    )
  } else {
    bindStatusMessage = t(
      'No stores on this merchant yet. Set a return URL and click Create to mint your first pair.'
    )
  }

  return {
    creatingPair,
    chosenStoreID,
    chosenProductID,
    storeID,
    productID,
    returnURL,
    storeSelectItems,
    productSelectItems,
    handleCreatePair,
    verifying,
    credsReady,
    hasCatalog,
    bindStatusMessage,
  }
}
