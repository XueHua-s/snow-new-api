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
import { Modal, Button, Typography, Spin, Tag, Descriptions } from '@douyinfe/semi-ui';
import { API, showError } from '../../../../helpers';
import { MOBILE_BREAKPOINT } from '../../../../hooks/common/useIsMobile';

const { Text } = Typography;

const getText = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
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
    width: 720,
    style: {
      top: 24,
      maxWidth: 'min(720px, 92vw)',
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
  const data = payload?.data?.data ?? payload?.data ?? {};
  const isLoggedIn = Boolean(data?.loggedIn);

  return (
    <div className='flex flex-col gap-4'>
      {payload?.success === false && (
        <Text type='danger'>{payload?.message || tt('获取账号信息失败')}</Text>
      )}

      <div className='rounded-lg border border-gray-100 bg-gray-50 p-3'>
        <div className='mb-3 flex flex-wrap items-center gap-2'>
          <Tag color={isLoggedIn ? 'green' : 'grey'}>
            {isLoggedIn ? tt('已登录') : tt('未登录')}
          </Tag>
          <Tag color='blue'>{getText(data?.subscriptionType)}</Tag>
          {payload?.upstream_status && (
            <Tag color='white'>HTTP {payload.upstream_status}</Tag>
          )}
        </div>
        <Descriptions>
          <Descriptions.Item itemKey={tt('邮箱')}>
            {getText(data?.email)}
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('组织')}>
            {getText(data?.orgName)}
          </Descriptions.Item>
          <Descriptions.Item itemKey='Org ID'>
            <Text code copyable>
              {getText(data?.orgId)}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('认证方式')}>
            {getText(data?.authMethod)}
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('供应商')}>
            {getText(data?.apiProvider)}
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('过期时间')}>
            {getText(data?.expiresAt)}
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('上次刷新')}>
            {getText(data?.lastRefresh)}
          </Descriptions.Item>
          <Descriptions.Item itemKey={tt('速率层级')}>
            {getText(data?.rateLimitTier)}
          </Descriptions.Item>
        </Descriptions>
      </div>

      <div className='rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>
        {data?.usageMessage ||
          tt('Claude OAuth 可以显示授权状态，但协议未暴露订阅额度用量窗口。')}
      </div>

      <div className='flex justify-end'>
        <Button size='small' type='primary' theme='outline' onClick={onRefresh}>
          {tt('刷新')}
        </Button>
      </div>
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
