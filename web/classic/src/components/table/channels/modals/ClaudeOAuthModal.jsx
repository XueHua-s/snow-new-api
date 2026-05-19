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

import React from 'react';
import OAuthCredentialModal from './OAuthCredentialModal';

const ClaudeOAuthModal = ({ channelId, ...props }) => {
  const channelPathPrefix = channelId
    ? `/api/channel/${channelId}`
    : '/api/channel';
  const saveToChannel = Boolean(channelId);

  return (
    <OAuthCredentialModal
      {...props}
      title='Claude OAuth 授权'
      startPath={`${channelPathPrefix}/claude/oauth/start`}
      completePath={`${channelPathPrefix}/claude/oauth/complete`}
      instructions='1) 点击「打开授权页面」登录 Claude；2) 复制跳转后的 URL 或授权码；3) 粘贴到下方；4) 点击确认授权。'
      inputPlaceholder='请粘贴完整回调 URL 或授权码（包含 state）'
      tip='授权结果会作为 Claude(OAuth) 凭据保存；请求会直连 Anthropic OAuth 协议，不使用本地 Claude CLI 桥接。'
      completeButtonText={saveToChannel ? '授权并保存' : '生成授权凭据'}
      successText={
        saveToChannel ? 'Claude OAuth 凭据已保存' : 'Claude OAuth 凭据已生成'
      }
      requiresKeyResult={!saveToChannel}
    />
  );
};

export default ClaudeOAuthModal;
