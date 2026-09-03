---
description: "Playwright MCP server — browser automation via structured accessibility snapshots. Setup, configuration, and usage."
globs: **/*
alwaysApply: false
---
# Playwright MCP — أتمتة المتصفح

> المصدر: https://github.com/microsoft/playwright-mcp و https://www.claudedirectory.org/mcp-servers/playwright

## ما هو؟
خادم Model Context Protocol (MCP) يوفر قدرات أتمتة المتصفح باستخدام Playwright.
يتيح للذكاء الاصطناعي التفاعل مع صفحات الويب عبر لقطات accessibility منظمة (structured
accessibility snapshots)، متجاوزاً الحاجة للصور أو النماذج المدربة بصرياً.

## المزايا الرئيسية
- سريع وخفيف — يستخدم شجرة إمكانية الوصول في Playwright، لا المدخلات القائمة على البكسل.
- ملائم للـ LLM — لا حاجة لنماذج رؤية؛ يعمل على بيانات منظمة فقط.
- تطبيق أدوات حتمي — يتجنب الغموض الشائع مع النهج القائمة على لقطات الشاشة.

## المتطلبات
- Node.js 18 أو أحدث
- أي MCP client: VS Code, Cursor, Windsurf, Claude Desktop, Goose, Grok, Junie...

## التثبيت والإعداد
### التثبيت العمومي
```bash
npm install -g @playwright/mcp
```

### الإعداد القياسي (يعمل في معظم الأدوات)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### في VS Code (سطر الأوامر)
```bash
code --add-mcp '{"name":"playwright","command":"npx","args":["@playwright/mcp@latest"]}'
```

### في Claude Code
```bash
claude mcp add playwright npx @playwright/mcp@latest
```

### خادم MCP مستقل (Standalone) عبر HTTP
```bash
npx @playwright/mcp@latest --port 8931
```
ثم في إعداد الـ client:
```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

## خيارات التهيئة المهمة (Configuration Flags)
| الخيار | الوصف |
| --- | --- |
| `--browser <chrome\|firefox\|webkit\|msedge>` | المتصفح المستخدم |
| `--headless` | تشغيل بدون واجهة |
| `--isolated` | إبقاء ملف المتصفح في الذاكرة، بدون حفظ على القرص |
| `--user-data-dir <path>` | مجلد بيانات المستخدم (ملف تعريف دائم) |
| `--storage-state <path>` | تحميل cookies و local storage من ملف |
| `--viewport-size <WxH>` | حجم إطار العرض (مثل `1280x720`) |
| `--device "<اسم الجهاز>"` | محاكاة جهاز (مثل `"iPhone 15"`) |
| `--mobile` | محاكاة جهاز جوال عام (أخف للـ tokens) |
| `--allowed-hosts <hosts...>` | قائمة المضيفات المسموح الخدمة منها (الافتراضي: مضيف الربط) |
| `--blocked-origins <origins...>` | قائمة الأصول المحظورة (تُقيَّم قبل القائمة البيضاء) |
| `--output-dir <path>` | مجلد ملفات المخرجات |
| `--save-session` | حفظ جلسة MCP في مجلد المخرجات |
| `--timeout-action <ms>` | مهلة الإجراء (افتراضي 5000ms) |
| `--timeout-navigation <ms>` | مهلة التنقل (افتراضي 60000ms) |
| `--timeout-settle <ms>` | الانتظار بعد كل إجراء (افتراضي 500ms) |
| `--test-id-attribute <attr>` | السمة المستخدمة لـ test ids (افتراضي `data-testid`) |
| `--caps <caps...>` | قدرات إضافية: `vision, pdf, devtools, config, network, storage, testing` |
| `--codegen <lang>` | لغة توليد الكود: `typescript, python, java, csharp, none` |

## الحالة الأولية (Initial State)
- **ملف تعريف دائم:** `--user-data-dir` — يحفظ كل بيانات المتصفح بين الجلسات
  (الموقع: `~/Library/Caches/ms-playwright/mcp-{channel}-{workspace-hash}` على macOS).
- **معزول:** `--isolated` — كل جلسة تبدأ بملف تعريف معزول، وتُفقد حالة التخزين عند إغلاق المتصفح.
- **حالة صفحة مبدئية:** `--init-page` لملف TypeScript يُقيَّم على كائن الصفحة:

```ts
// init-page.ts
export default async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
  await page.setViewportSize({ width: 1280, height: 720 });
};
```

- **سكربت تهيئة:** `--init-script` لملف JavaScript يُقيَّم في كل صفحة قبل سكربتاتها:
```js
// init-script.js
window.isPlaywrightMCP = true;
```

## الأمان
- Playwright MCP ليس حاجزاً أمنياً (security boundary).
- الافتراضي يقصر الوصول لنظام الملفات على جذور الـ workspace فقط، ويحظر التنقل إلى
  `file://` URLs. استخدم `--allow-unrestricted-file-access` فقط عند الحاجة الواضحة.
- استخدم `--secrets <file>` لتمرير الأسرار بصيغة dotenv بدلاً من تضمينها في الإعداد.

## Playwright MCP مقابل Playwright CLI
- **CLI + SKILLS** (https://github.com/microsoft/playwright-cli): الأفضل للوكلاء عالية الإنتاجية
  لأنه أكثر كفاءة في الـ tokens (أوامر موجزة بدل schemas ضخمة وأشجار وصول مطوّلة).
- **MCP:** مناسب للحلقات المتخصصة التي تستفيد من حالة دائمة واستبطان غني وتفكير متكرر
  فوق بنية الصفحة — مثل الاستكشاف الآلي أو الاختبارات ذاتية الإصلاح أو سير العمل الطويل.

## الاستخدام في هذا المشروع
- لاختبار تدفقات UI الحرجة في `client/`، راجع `.skills/playwright-e2e-testing.md`.
- يمكنك استخدام المتصفح المدمج في VS Code مباشرةً للتحقق البصري من الواجهات أثناء التطوير.
