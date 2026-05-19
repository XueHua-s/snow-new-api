/*
Copyright (C) 2025 QuantumNous

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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Button,
  Typography,
  Spin,
  Tag,
  Descriptions,
  Collapse,
} from '@douyinfe/semi-ui';
import { API, copy, showError, showSuccess } from '../../../../helpers';
import { MOBILE_BREAKPOINT } from '../../../../hooks/common/useIsMobile';

const { Text } = Typography;

const getText = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

const AccountInfoValue = ({ t, value, onCopy, monospace = false }) => {
  const tt = typeof t === 'function' ? t : (v) => v;
  const text = getText(value);
  const hasValue = text !== '-';

  return (
    <div className='flex min-w-0 items-start justify-between gap-2'>
      <div
        className={`min-w-0 flex-1 break-all text-xs leading-5 text-semi-color-text-1 ${
          monospace ? 'font-mono' : ''
        }`}
      >
        {hasValue ? text : '-'}
      </div>
      <Button
        size='small'
        type='tertiary'
        theme='borderless'
        className='shrink-0 px-1 text-xs'
        disabled={!hasValue}
        onClick={() => onCopy?.(text)}
      >
        {tt('复制')}
      </Button>
    </div>
  );
};

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

const getClaudeAccountModalLayout = () => {
  if (isMobileViewport()) {
    return {
      width: 'calc(100vw - 16px)',
      style: {
        top: 8,
        maxWidth: 'calc(100vw - 16px)',
        margin: '0 auto',
      },
      bodyStyle: {
        maxHeight: 'calc(100vh - 148px)',
        overflowY: 'auto',
        padding: '16px 16px 12px',
      },
    };
  }

  return {
    width: 900,
    style: {
      top: 24,
      maxWidth: 'min(900px, 92vw)',
    },
    bodyStyle: {
      maxHeight: 'calc(100vh - 172px)',
      overflowY: 'auto',
      padding: '20px 24px 16px',
    },
  };
};

const ClaudeAccountView = ({ t, record, payload, onRefresh }) => {
  const tt = typeof t === 'function' ? t : (v) => v;
  const [showRawJson, setShowRawJson] = useState(false);
  const data = payload?.data?.data ?? payload?.data ?? {};
  const isLoggedIn = Boolean(data?.loggedIn);
  const upstreamStatus = payload?.upstream_status;
  const providerLabel = data?.apiProvider || 'Claude(OAuth)';
  const displayMessage = payload?.message ? getText(payload.message) : '';
  const errorMessage =
    payload?.success === false ? displayMessage || tt('获取账号信息失败') : '';
  const rawText =
    typeof data === 'string' ? data : JSON.stringify(data ?? payload, null, 2);

  const handleCopy = async (text) => {
    if (!text) return;
    const ok = await copy(text);
    if (ok) showSuccess(tt('已复制'));
  };

  return (
    <div className='flex flex-col gap-4'>
      {errorMessage && (
        <div className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          {errorMessage}
        </div>
      )}

      <div className='rounded-xl border border-semi-color-border bg-semi-color-bg-0 p-3'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div className='min-w-0'>
            <div className='text-xs font-medium text-semi-color-text-2'>
              {tt('Claude 帐号')}
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              <Tag
                color={isLoggedIn ? 'green' : 'grey'}
                type='light'
                shape='circle'
                size='large'
                className='font-semibold'
              >
                {isLoggedIn ? tt('已授权') : tt('未授权')}
              </Tag>
              <Tag color='blue' type='light' shape='circle'>
                {getText(providerLabel)}
              </Tag>
              <Tag color='grey' type='light' shape='circle'>
                {tt('上游状态码：')}
                {upstreamStatus ?? '-'}
              </Tag>
            </div>
          </div>
          <Button
            size='small'
            type='tertiary'
            theme='outline'
            onClick={onRefresh}
          >
            {tt('刷新')}
          </Button>
        </div>

        <div className='mt-2 rounded-lg bg-semi-color-fill-0 px-3 py-2'>
          <Descriptions>
            <Descriptions.Item itemKey={tt('邮箱')}>
              <AccountInfoValue
                t={tt}
                value={data?.email}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('组织')}>
              <AccountInfoValue
                t={tt}
                value={data?.orgName}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey='Org ID'>
              <AccountInfoValue
                t={tt}
                value={data?.orgId}
                onCopy={handleCopy}
                monospace
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('认证方式')}>
              <AccountInfoValue
                t={tt}
                value={data?.authMethod}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('订阅类型')}>
              <AccountInfoValue
                t={tt}
                value={data?.subscriptionType}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('过期时间')}>
              <AccountInfoValue
                t={tt}
                value={data?.expiresAt}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('上次刷新')}>
              <AccountInfoValue
                t={tt}
                value={data?.lastRefresh}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
            <Descriptions.Item itemKey={tt('速率层级')}>
              <AccountInfoValue
                t={tt}
                value={data?.rateLimitTier}
                onCopy={handleCopy}
              />
            </Descriptions.Item>
          </Descriptions>
        </div>

        <div className='mt-2 text-xs text-semi-color-text-2'>
          {tt('渠道：')}
          {record?.name || '-'} ({tt('编号：')}
          {record?.id || '-'})
        </div>
      </div>

      <div className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
        {data?.usageMessage ||
          tt('Claude OAuth 可以显示授权状态，但协议未暴露订阅额度用量窗口。')}
      </div>

      <Collapse
        activeKey={showRawJson ? ['raw-json'] : []}
        onChange={(activeKey) => {
          const keys = Array.isArray(activeKey) ? activeKey : [activeKey];
          setShowRawJson(keys.includes('raw-json'));
        }}
      >
        <Collapse.Panel header={tt('原始 JSON')} itemKey='raw-json'>
          <div className='mb-2 flex justify-end'>
            <Button
              size='small'
              type='primary'
              theme='outline'
              onClick={() => handleCopy(rawText)}
              disabled={!rawText}
            >
              {tt('复制')}
            </Button>
          </div>
          <pre className='max-h-[50vh] overflow-y-auto rounded-lg bg-semi-color-fill-0 p-3 text-xs text-semi-color-text-0'>
            {rawText}
          </pre>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
};

const ClaudeAccountLoader = ({ t, record }) => {
  const tt = typeof t === 'function' ? t : (v) => v;
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const mountedRef = useRef(true);
  const recordId = record?.id;

  const fetchAccount = useCallback(async () => {
    if (!recordId) return;
    if (mountedRef.current) setLoading(true);
    try {
      const res = await API.get(`/api/channel/${recordId}/claude/usage`, {
        skipErrorHandler: true,
      });
      if (!mountedRef.current) return;
      setPayload(res?.data ?? null);
      if (!res?.data?.success) {
        showError(res?.data?.message || tt('获取账号信息失败'));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      showError(tt('获取账号信息失败'));
      setPayload({ success: false, message: String(error) });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [recordId, tt]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAccount().catch(() => {});
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAccount]);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-10'>
        <Spin spinning={true} size='large' tip={tt('加载中...')} />
      </div>
    );
  }

  return (
    <ClaudeAccountView
      t={tt}
      record={record}
      payload={payload}
      onRefresh={fetchAccount}
    />
  );
};

export const openClaudeAccountModal = ({ t, record }) => {
  const tt = typeof t === 'function' ? t : (v) => v;
  const layout = getClaudeAccountModalLayout();

  Modal.info({
    title: tt('Claude 帐号与订阅'),
    centered: false,
    width: layout.width,
    style: layout.style,
    bodyStyle: layout.bodyStyle,
    content: <ClaudeAccountLoader t={tt} record={record} />,
    footer: (
      <div className='flex justify-end gap-2'>
        <Button type='primary' theme='solid' onClick={() => Modal.destroyAll()}>
          {tt('关闭')}
        </Button>
      </div>
    ),
  });
};
