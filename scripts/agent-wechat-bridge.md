# ChatAdmission on Agent WeChat

Use the Agent WeChat demo profile that already passed the manual send and receive test. Keep its `wx serve` terminal open.

In PowerShell, from the repository root, run `npm.cmd ci`. In the same PowerShell set:

```powershell
$env:FASTGPT_APP_ID = '6ac1f9a7cae21ffd87826c8b'
$env:FASTGPT_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'FastGPT API Key' -AsSecureString)).Password
node scripts/agent-wechat-bridge.js
```

The default Agent WeChat profile alias is `chatadmission`. Set `WECHAT_ACCOUNT` in this PowerShell if your alias differs.

After the bridge says it is waiting, send a normal text question from a friend of the demo account. It replies in the same private conversation. Newly added friends can ask once Agent WeChat has synced the friend relationship. Each conversation has separate FastGPT history. Use the dedicated demo account because private questions from its friends are sent to FastGPT.

Keep both terminals open. Stop the bridge with Ctrl+C. To remove the key from this PowerShell afterward, run `Remove-Item Env:FASTGPT_API_KEY`.
