# 學生手冊資料檢查流程

## 目的

本文件說明修改 `data/*.json` 前後，如何使用只讀檢查腳本確認資料格式、必要欄位與基本安全風險。

這個流程只檢查資料，不會修改 JSON，不會 deploy，也不會執行 `git add`、commit 或 push。

## 執行方式

```powershell
node scripts/check-data.mjs
```

建議在專案根目錄執行：

```powershell
cd "C:\Users\small\OneDrive\文件\學生手冊"
node scripts/check-data.mjs
```

## 目前檢查範圍

目前腳本會檢查以下資料檔：

- `data/categories.json`
- `data/handbook-items.json`
- `data/sources.json`
- `data/contacts.json`

## 目前基準結果

目前可接受基準：

```text
Errors: 0
Warnings: 20
ExitCode: 0
```

## 修改前檢查

修改 `data/*.json` 前先執行：

```powershell
git status -sb
node scripts/check-data.mjs
```

確認事項：

- 工作區狀態是否符合預期。
- 檢查腳本是否可正常執行。
- 目前 error 數量是否為 0。
- warning 是否為已知提醒，且沒有新增未知風險。

## 修改後檢查

修改 `data/*.json` 後執行：

```powershell
node scripts/check-data.mjs
git diff --check
git status -sb
```

若準備進入 commit 前稽核，需再確認：

- 只修改本次任務允許的檔案。
- 沒有新增非預期檔案。
- 沒有把 token、secret、email、金鑰、完整 URL 或帳號資訊寫入資料。

## 檢查結果判讀

`Errors` 代表阻擋項目，應先修正後再進入 commit 或 push。

常見 error 類型：

- JSON 無法 parse。
- top-level 不是 array。
- `handbook-items.json` 缺 `id`、`title`、`category` 或 `source_checked_at`。
- `id` 重複。
- `category` 無法對應 `categories.json` 的 `label`。
- `source_checked_at` 不是 `YYYY-MM-DD`。
- `links`、`source_urls` 或 `tags` 型態不正確。
- 偵測到疑似敏感資訊。

`Warnings` 是提醒項目，現階段不阻擋 commit 或 push，但需要在回報中說明。

目前已知 warning 類型：

- 6 筆 `handbook-items` 的 `id` 使用底線。
- 7 筆 `sources` 的 `url` 空白。
- 7 筆 `contacts` 缺穩定 `id`。

## 安全邊界

- 不輸出卡片正文。
- 不輸出完整 URL。
- 不輸出聯絡資訊全文。
- 不輸出或寫入 token、secret、email、金鑰或帳號資訊。
- 不將 GAS 部署 URL、API URL 或任何憑證寫入 repo、log、文件或聊天。

## 收工確認

每次資料調整完成後，至少執行：

```powershell
node scripts/check-data.mjs
git diff --check
git status -sb
```

未經確認，不得執行：

- `git add`
- commit
- push
- deploy
- `secret put`
