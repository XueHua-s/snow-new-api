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
import { completeClaudeOAuth, startClaudeOAuth } from '../../api'
import { OAuthCredentialDialog } from './oauth-credential-dialog'

type ClaudeOAuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onKeyGenerated: (key: string) => void
}

export function ClaudeOAuthDialog(props: ClaudeOAuthDialogProps) {
  return (
    <OAuthCredentialDialog
      {...props}
      title='Claude OAuth Authorization'
      description='Connect a Claude subscription and insert the OAuth JSON credential into the channel key field.'
      instructions='1) Open the authorization page and log in to Claude; 2) copy the redirected URL or code; 3) paste it here; 4) generate the credential.'
      inputLabel='Authorization code'
      inputPlaceholder='Paste redirected URL or authorization code'
      tip='The result is a JSON credential containing access_token and refresh_token. It is used directly against Anthropic OAuth endpoints, not through a local CLI bridge.'
      startOAuth={startClaudeOAuth}
      completeOAuth={completeClaudeOAuth}
      completeButtonLabel='Generate and insert'
    />
  )
}
