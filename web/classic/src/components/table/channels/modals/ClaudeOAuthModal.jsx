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

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Space,
  Typography,
  Input,
  Banner,
} from '@douyinfe/semi-ui';
import { API, copy, showError, showSuccess } from '../../../../helpers';

const { Text } = Typography;

const ClaudeOAuthModal = ({ visible, onCancel, onSuccess }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState('');
  const [input, setInput] = useState('');

  const startOAuth = async () => {
    setLoading(true);
    try {
      const res = await API.post(
        '/api/channel/claude/oauth/start',
        {},
        { skipErrorHandler: true },
      );
      if (!res?.data?.success) {
        throw new Error(t('启动授权失败'));
      }
      const url = res?.data?.data?.authorize_url || '';
      if (!url) {
        throw new Error(t('响应缺少授权链接'));
      }
      setAuthorizeUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      showSuccess(t('已打开授权页面'));
    } catch (error) {
      showError(error?.message || t('启动授权失败'));
    } finally {
      setLoading(false);
    }
  };

  const completeOAuth = async () => {
    if (!input || !input.trim()) {
      showError(t('请先粘贴回调 URL 或授权码'));
      return;
    }

    setLoading(true);
    try {
      const res = await API.post(
        '/api/channel/claude/oauth/complete',
        { input },
        { skipErrorHandler: true },
      );
      if (!res?.data?.success) {
        throw new Error(t('授权失败'));
      }

      const key = res?.data?.data?.key || '';
      if (!key) {
        throw new Error(t('响应缺少凭据'));
      }

      onSuccess && onSuccess(key);
      showSuccess(t('已生成授权凭据'));
      onCancel && onCancel();
    } catch (error) {
      showError(error?.message || t('授权失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setAuthorizeUrl('');
    setInput('');
  }, [visible]);

  return (
    <Modal
      title={t('Claude OAuth 授权')}
      visible={visible}
      onCancel={onCancel}
      maskClosable={false}
      closeOnEsc
      width={720}
      footer={
        <Space>
          <Button theme='borderless' onClick={onCancel} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            theme='solid'
            type='primary'
            onClick={completeOAuth}
            loading={loading}
          >
            {t('生成并填入')}
          </Button>
        </Space>
      }
    >
      <Space vertical spacing='tight' style={{ width: '100%' }}>
        <Banner
          type='info'
          description={t(
            '1) 点击「打开授权页面」登录 Claude；2) 复制跳转后的 URL 或授权码；3) 粘贴到下方；4) 点击「生成并填入」。',
          )}
        />

        <Space wrap>
          <Button type='primary' onClick={startOAuth} loading={loading}>
            {t('打开授权页面')}
          </Button>
          <Button
            theme='outline'
            disabled={!authorizeUrl || loading}
            onClick={() => copy(authorizeUrl)}
          >
            {t('复制授权链接')}
          </Button>
        </Space>

        <Input
          value={input}
          onChange={(value) => setInput(value)}
          placeholder={t('请粘贴完整回调 URL 或授权码（包含 state）')}
          showClear
        />

        <Text type='tertiary' size='small'>
          {t(
            '生成结果是可直接粘贴到渠道密钥里的 JSON（包含 access_token / refresh_token），请求会直连 Anthropic OAuth 协议，不使用本地 Claude CLI 桥接。',
          )}
        </Text>
      </Space>
    </Modal>
  );
};

export default ClaudeOAuthModal;
