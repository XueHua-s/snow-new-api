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

const CodexOAuthModal = (props) => (
  <OAuthCredentialModal
    {...props}
    title='Codex 授权'
    startPath='/api/channel/codex/oauth/start'
    completePath='/api/channel/codex/oauth/complete'
    instructions='1) 点击「打开授权页面」完成登录；2) 浏览器会跳转到 localhost（页面打不开也没关系）；3) 复制地址栏完整 URL 粘贴到下方；4) 点击「生成并填入」。'
    inputPlaceholder='请粘贴完整回调 URL（包含 code 与 state）'
    tip='说明：生成结果是可直接粘贴到渠道密钥里的 JSON（包含 access_token / refresh_token / account_id）。'
  />
);

export default CodexOAuthModal;
