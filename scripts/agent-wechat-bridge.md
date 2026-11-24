# ChatAdmission on Agent WeChat

Use the Agent WeChat demo profile that already passed the manual send and receive test. Keep its `wx serve` terminal open.

In PowerShell, from the repository root, run `npm.cmd ci`. In the same PowerShell set:

```powershell
$env:WECHAT_TEST_CHAT_ID = 'CHAT_ID_FROM_WX_CHATS_LIST'
$env:FASTGPT_APP_ID = '6ac1f9a7cae21ffd87826c8b'
$env:FASTGPT_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'FastGPT API Key' -AsSecureString)).Password
node scripts/agent-wechat-bridge.js
```

The default Agent WeChat profile alias is `chatadmission`. Set `WECHAT_ACCOUNT` in this PowerShell if your alias differs.

After the bridge says it is waiting, use the selected contact's WeChat account to send `AI What AI master's programmes does EdUHK offer?` to the demo account. The bridge processes new incoming text from that one private conversation and sends the FastGPT answer back to it. Keep both terminals open. Stop the bridge with Ctrl+C. To remove the key from this PowerShell afterward, run `Remove-Item Env:FASTGPT_API_KEY`.
