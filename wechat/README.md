# ChatAdmission on WeChat

This process runs separately from the Vercel webhooks. Use a dedicated WeChat demo account and a PadLocal token.

1. Run `npm ci` from the repository root, then run `npm ci` inside this folder.
2. Set `FASTGPT_API_KEY`, `FASTGPT_APP_ID` and `WECHATY_PUPPET_PADLOCAL_TOKEN` in the process environment.
3. Run `npm start` from this folder. Scan the terminal login QR using the demo account.
4. Share the demo account's add-friend QR with participants. After adding the account, send a private message like `AI What are the MEd entry requirements?`.

The bot handles private text messages starting with `AI `. The rest of the message goes to FastGPT. Each participant has a separate WeChat chat history.
