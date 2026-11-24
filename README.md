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
