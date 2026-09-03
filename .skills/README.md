# مهارات المشروع — .skills

هذا المجلد يحتوي مهارات وقواعد المشروع الإلزامية. تُقرأ هذه الملفات بالتزامن مع
`.cursorrules` في جذر المشروع قبل أي تغيير في الكود.

## قائمة المهارات

| الملف | الوصف | المصدر |
| --- | --- | --- |
| `ui-standards.md` | معايير التصميم، Tailwind، shadcn، و KaTeX | محلي |
| `solver-engine.md` | بناء المحركات الحسابية وفصلها عن React | محلي |
| `engineering-math.md` | ثابت 60fps، الاستقرار العددي، حدود التعقيد $O(N)$، تنسيق KaTeX | محلي |
| `vitest-testing.md` | اختبارات المشروع ومعايير الدقة الرياضية | محلي |
| `react-vite-2026.md` | معمارية React 19 + Vite 7 + TypeScript + Tailwind v4 | [cursor.directory/plugins/react-vite-2026](https://cursor.directory/plugins/react-vite-2026) |
| `react-typescript-vite.md` | قواعد TypeScript مع Node.js و React و Vite | [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) |
| `tailwind-shadcn-ui.md` | تكامل Tailwind مع shadcn/ui | [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) |
| `vitest-unit-testing.md` | اختبارات وحدة Vitest مع TypeScript | [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) |
| `playwright-e2e-testing.md` | اختبارات End-to-End بـ Playwright | [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) |
| `playwright-mcp.md` | خادم Playwright MCP — أتمتة المتصفح | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) + [claudedirectory](https://www.claudedirectory.org/mcp-servers/playwright) |
| `cursor-rules-reference.md` | مرجع قواعد Cursor: RULE.md، AGENTS.md، الاستيراد | [sanjeed5/awesome-cursor-rules-mdc](https://github.com/sanjeed5/awesome-cursor-rules-mdc/blob/main/cursor-rules-reference.md) |

## كيفية الاستخدام
1. قبل تعديل الواجهة: اقرأ `ui-standards.md` + `react-vite-2026.md` + `tailwind-shadcn-ui.md`.
2. قبل تعديل محرك حسابي: اقرأ `solver-engine.md` + `vitest-testing.md`.
3. قبل كتابة اختبارات: اقرأ `vitest-unit-testing.md` (وحدة) أو `playwright-e2e-testing.md` (E2E).
4. لأتمتة المتصفح عبر MCP: اقرأ `playwright-mcp.md`.
5. لفهم بنية القواعد نفسها: اقرأ `cursor-rules-reference.md`.

## ملاحظة حول المصادر
- [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) — مجموعة
  قواعد Cursor بصيغة `.mdc` الحديثة (40k+ نجمة). استوردنا منها القواعد الأكثر صلة بهذا
  المشروع فقط؛ يمكن استيراد المزيد من `rules/` عند الحاجة.
- [sanjeed5/awesome-cursor-rules-mdc](https://github.com/sanjeed5/awesome-cursor-rules-mdc) —
  مرجع شامل لصيغة RULE.md وأفضل الممارسات.
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) — خادم MCP رسمي
  لأتمتة المتصفح عبر شجرة إمكانية الوصول.
