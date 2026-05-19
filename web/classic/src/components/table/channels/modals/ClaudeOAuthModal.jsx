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

const ClaudeOAuthModal = (props) => (
  <OAuthCredentialModal
    {...props}
    title='Claude OAuth 授权'
    startPath='/api/channel/claude/oauth/start'
    completePath='/api/channel/claude/oauth/complete'
    instructions='1) 点击「打开授权页面」登录 Claude；2) 复制跳转后的 URL 或授权码；3) 粘贴到下方；4) 点击「生成并填入」。'
    inputPlaceholder='请粘贴完整回调 URL 或授权码（包含 state）'
    tip='生成结果是可直接粘贴到渠道密钥里的 JSON（包含 access_token / refresh_token），请求会直连 Anthropic OAuth 协议，不使用本地 Claude CLI 桥接。'
  />
);

export default ClaudeOAuthModal;
