# 远程更新 API 调用契约（2026-02-24）

## 变更摘要
- 不再支持灰度发布参数。
- `POST /api/v1/apps/:appId/update/check` 现在要求请求体必须包含 `licenseKey`。
- `GET /api/v1/apps/:appId/update/package/:version` 现在要求查询参数必须包含 `licenseKey`。

## 1) 更新检查

### 请求
- 方法：`POST`
- 路径：`/api/v1/apps/:appId/update/check`
- Body(JSON)：

```json
{
  "currentVersion": "1.2.3",
  "licenseKey": "LIC-XXXXXXXXXXXXXXXX"
}
```

### 响应（示例）

```json
{
  "hasUpdate": true,
  "currentVersion": "1.2.3",
  "targetVersion": "1.3.0",
  "strategy": "OPTIONAL",
  "note": "修复若干问题",
  "offlineTtlSeconds": 900
}
```

## 2) 更新包获取

### 请求
- 方法：`GET`
- 路径：`/api/v1/apps/:appId/update/package/:version`
- Query：
  - `licenseKey=LIC-XXXXXXXXXXXXXXXX`

示例：

```text
/api/v1/apps/<appId>/update/package/1.3.0?licenseKey=LIC-XXXXXXXXXXXXXXXX
```

### 响应（示例）

```json
{
  "appId": "app_xxx",
  "version": "1.3.0",
  "downloadUrl": "https://example.com/download/app-1.3.0.zip",
  "releaseNote": "修复若干问题",
  "signature": "hex_hmac_sha256_signature",
  "legacySignature": "hex_hmac_sha256_signature_or_null",
  "signatureGraceExpiresAt": "2026-02-25T10:20:00.000Z",
  "publishedAt": "2026-02-24T10:20:00.000Z"
}
```

说明：
- `signature` 始终使用当前 `updateSignSecret` 生成。
- 当密钥轮换后处于 24 小时过渡窗口内时，会额外返回：
  - `legacySignature`：使用旧 `updateSignSecret` 生成。
  - `signatureGraceExpiresAt`：旧签名过渡截止时间。

## 3) JS 客户端示例

```ts
const checkRes = await fetch(`/api/v1/apps/${appId}/update/check`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    currentVersion: "1.2.3",
    licenseKey,
  }),
});

const checkData = await checkRes.json();
if (!checkRes.ok) throw new Error(checkData.message ?? "更新检查失败");

if (checkData.hasUpdate) {
  const pkgRes = await fetch(
    `/api/v1/apps/${appId}/update/package/${checkData.targetVersion}?licenseKey=${encodeURIComponent(licenseKey)}`
  );
  const pkgData = await pkgRes.json();
  if (!pkgRes.ok) throw new Error(pkgData.message ?? "获取更新包失败");
}
```

## 4) PHP 客户端示例

```php
<?php
$appId = "your-app-id";
$licenseKey = "LIC-XXXXXXXXXXXXXXXX";
$currentVersion = "1.2.3";
$baseUrl = "https://your-domain.com";

$checkUrl = $baseUrl . "/api/v1/apps/{$appId}/update/check";
$checkBody = json_encode([
  "currentVersion" => $currentVersion,
  "licenseKey" => $licenseKey,
], JSON_UNESCAPED_UNICODE);

$checkOptions = [
  "http" => [
    "method"  => "POST",
    "header"  => "Content-Type: application/json\r\n",
    "content" => $checkBody,
    "timeout" => 10,
  ],
];

$checkResp = file_get_contents($checkUrl, false, stream_context_create($checkOptions));
$checkData = json_decode($checkResp, true);

if (!empty($checkData["hasUpdate"])) {
  $targetVersion = $checkData["targetVersion"];
  $pkgUrl = $baseUrl . "/api/v1/apps/{$appId}/update/package/{$targetVersion}?licenseKey=" . urlencode($licenseKey);
  $pkgResp = file_get_contents($pkgUrl);
  $pkgData = json_decode($pkgResp, true);
}
```
