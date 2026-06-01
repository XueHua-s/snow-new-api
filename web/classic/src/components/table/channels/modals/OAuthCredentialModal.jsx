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

const OAuthCredentialModal = ({
  visible,
  onCancel,
  onSuccess,
  title,
  startPath,
  completePath,
  instructions,
  inputPlaceholder,
  tip,
  completeButtonText = '生成并填入',
  successText = '已生成授权凭据',
  requiresKeyResult = true,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState('');
  const [flowToken, setFlowToken] = useState('');
  const [input, setInput] = useState('');

  const startOAuth = async () => {
    setLoading(true);
    try {
      const res = await API.post(startPath, {}, { skipErrorHandler: true });
      if (!res?.data?.success) {
        throw new Error(res?.data?.message || t('启动授权失败'));
      }
      const url = res?.data?.data?.authorize_url || '';
      if (!url) {
        throw new Error(t('响应缺少授权链接'));
      }
      setAuthorizeUrl(url);
      setFlowToken(res?.data?.data?.flow_token || '');
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
        completePath,
        { input, flow_token: flowToken || undefined },
        { skipErrorHandler: true },
      );
      if (!res?.data?.success) {
        throw new Error(res?.data?.message || t('授权失败'));
      }

      const key = res?.data?.data?.key || '';
      if (requiresKeyResult && !key) {
        throw new Error(t('响应缺少凭据'));
      }

      onSuccess && onSuccess(requiresKeyResult ? key : res?.data?.data);
      showSuccess(t(successText));
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
    setFlowToken('');
    setInput('');
  }, [visible]);

  return (
    <Modal
      title={t(title)}
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
            {t(completeButtonText)}
          </Button>
        </Space>
      }
    >
      <Space vertical spacing='tight' style={{ width: '100%' }}>
        <Banner type='info' description={t(instructions)} />

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
          placeholder={t(inputPlaceholder)}
          showClear
        />

        <Text type='tertiary' size='small'>
          {t(tip)}
        </Text>
      </Space>
    </Modal>
  );
};

export default OAuthCredentialModal;
