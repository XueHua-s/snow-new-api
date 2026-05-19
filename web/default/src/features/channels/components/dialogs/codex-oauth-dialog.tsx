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
import { completeCodexOAuth, startCodexOAuth } from '../../api'
import { OAuthCredentialDialog } from './oauth-credential-dialog'

type CodexOAuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onKeyGenerated: (key: string) => void
}

export function CodexOAuthDialog(props: CodexOAuthDialogProps) {
  return (
    <OAuthCredentialDialog
      {...props}
      title='Codex Authorization'
      description='Generate a Codex OAuth credential and paste it into the channel key field.'
      instructions='1) Click "Open authorization page" and complete login. 2) Your browser may redirect to localhost (it is OK if the page does not load). 3) Copy the full URL from the address bar and paste it below. 4) Click "Generate credential".'
      inputLabel='Callback URL'
      inputPlaceholder='Paste the full callback URL (includes code & state)'
      tip='Tip: The generated key is a JSON credential including access_token / refresh_token / account_id.'
      startOAuth={startCodexOAuth}
      completeOAuth={completeCodexOAuth}
    />
  )
}
