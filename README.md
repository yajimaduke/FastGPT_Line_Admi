# FastGPT LINE Bot

LINE Messaging API 將訊息送到 Vercel 嘅 `/api/webhook`。Webhook 驗證 LINE 簽名，再用 FastGPT 產生文字回覆。

## 部署

1. 將此 GitHub repo 匯入 Vercel。Framework Preset 選 **Other**。
2. 喺 **Settings → Environment Variables** 下為 **Production** 加入以下變數。

   | 變數 | 來源 | 類型 |
   | --- | --- | --- |
   | `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings → Channel secret | Secret |
   | `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API → Channel access token | Secret |
   | `FASTGPT_API_KEY` | FastGPT 應用 → 發布渠道 → API 訪問 | Secret |
   | `FASTGPT_APP_ID` | FastGPT 應用 ID | Config |

3. 部署後，喺 LINE Developers 嘅 **Messaging API → Webhook settings** 輸入 `https://<你的正式網域>/api/webhook`。
4. 按 **Verify**，然後打開 **Use webhook**。用 LINE 傳一則文字訊息測試回覆。

程式預設使用 FastGPT Cloud。如使用自架 FastGPT，請修改 `api/webhook.js` 入面嘅 `FASTGPT_URL`。

## ChatAdmission 個人微信 Bot（Windows）

喺 Windows 365 或 Windows VPS 安裝 Node.js LTS 同 Agent WeChat。喺本分支嘅 repo 根目錄執行 `npm.cmd ci`。

1. 喺第一個 PowerShell 視窗執行 `wx serve`，見到 `Daemon ready` 後保持視窗開住。
2. 喺第二個 PowerShell 視窗設定 `FASTGPT_APP_ID` 同 `FASTGPT_API_KEY`，再喺 repo 根目錄執行 `node scripts/agent-wechat-bridge.js`。預設 Agent WeChat 帳號 alias 係 `chatadmission`。
3. 見到 `Waiting for private text messages from WeChat friends`，用原本嘅微信號向示範號發一條新私訊，確認手機收到 FastGPT 答案。

### 重啟後微信冇回覆

即使 Windows 微信 App 已登入，Agent WeChat 嗰邊仍可能顯示 `disconnected`。保持 daemon 同 bridge 開住，喺第三個 PowerShell 視窗查狀態：

```powershell
wx --account chatadmission auth status
```

如果顯示 `disconnected`，重新連線：

```powershell
wx --account chatadmission auth login
```

如果出 QR Code，用示範微信號掃碼。登入後再查狀態，並由原本嘅微信號發一條新私訊測試。

- [Windows 365 重開速查表](https://ai-explainer-vercel.vercel.app/chatadmission-wechat/#restart)
- [新 Windows VPS 重裝速查表](https://ai-explainer-vercel.vercel.app/chatadmission-wechat/#reinstall)
