---
description: "Reference for Cursor Rules — project rules, RULE.md format, team rules, AGENTS.md, best practices, and how to import rules."
globs: **/*
alwaysApply: false
---
# مرجع قواعد Cursor (Cursor Rules Reference)

> المصدر: https://github.com/sanjeed5/awesome-cursor-rules-mdc/blob/main/cursor-rules-reference.md

## كيف تعمل القواعد (How rules work)
نماذج اللغة الكبيرة لا تحتفظ بالذاكرة بين الجلسات. القواعد توفّر سياقاً دائماً قابلاً
لإعادة الاستخدام على مستوى الـ prompt. عند تطبيق قاعدة، يُضمَّن محتواها في بداية سياق
النموذج، مما يمنح الذكاء الاصطناعي توجيهاً ثابتاً لتوليد الكود وتفسير التعديلات.

## أنواع القواعد (Rule types)
Cursor يدعم أربعة أنواع من القواعد:

### 1) قواعد المشروع (Project Rules)
مخزّنة في `.cursor/rules`، مُدارة بالتحكم بالنسخ (version-controlled) ومقيّدة بالكود.

**هيكل مجلد القاعدة:**
```
.cursor/rules/
  my-rule/
    RULE.md           # ملف القاعدة الرئيسي مع frontmatter والتعليمات
    scripts/          # سكربتات مساعدة (اختياري)
```

**تشريح القاعدة (Rule anatomy):**
| النوع | السلوك |
| --- | --- |
| Always Apply | تُطبَّق على كل جلسة محادثة |
| Apply Intelligently | عندما يقرر الوكيل ملاءمتها بناءً على الوصف |
| Apply to Specific Files | عندما يطابق الملف نمطاً محدداً |
| Apply Manually | عند ذكرها في المحادثة (مثل `@my-rule`) |

### 2) قواعد الفريق (Team Rules)
- للخطط Team و Enterprise؛ تُدار من لوحة Cursor dashboard.
- نص حر (plain text) — بدون frontmatter أو globs أو alwaysApply.
- الترتيب: Team Rules → Project Rules → User Rules. عند التعارض، الأسبقية للمصادر الأقدم.

### 3) قواعد المستخدم (User Rules)
تفضيلات عامة في Cursor Settings → Rules تُطبَّق عبر كل المشاريع، مثل:
> "Please reply in a concise style. Avoid unnecessary repetition or filler language."

### 4) AGENTS.md
- ملف Markdown بسيط لتعريف تعليمات الوكيل في جذر المشروع — بديل مباشر عن `.cursor/rules`.
- بدون metadata أو إعدادات معقدة.
- يدعم التداخل في المجلدات الفرعية (الأكثر تحديداً له الأولوية):

```
project/
  AGENTS.md              # تعليمات عامة
  frontend/
    AGENTS.md            # تعليمات خاصة بالواجهة
    components/
      AGENTS.md          # تعليمات خاصة بالمكونات
```

## تنسيق ملف RULE.md
ملف Markdown مع frontmatter metadata والمحتوى:

```markdown
---
description: "This rule provides standards for frontend components and API validation"
alwaysApply: false
---

...rest of the rule content
```

- إذا كان `alwaysApply: true` تُطبَّق القاعدة على كل جلسة.
- وإلا يُعرض الوصف على وكيل Cursor ليقرر مدى ملاءمتها.

## أفضل الممارسات (Best practices)
القواعد الجيدة مركّزة، قابلة للتنفيذ، ومقيّدة النطاق:
- أبقِ القواعد أقل من 500 سطر.
- قسّم القواعد الكبيرة إلى قواعد متعددة قابلة للتركيب.
- قدّم أمثلة ملموسة أو ملفات مرجعية.
- تجنّب التوجيه الغامض — اكتب القواعد كتوثيق داخلي واضح.
- أعد استخدام القواعد عند تكرار الـ prompts في المحادثة.

## أمثلة عملية

### قواعد الواجهة الأمامية
```markdown
When working in components directory:
- Always use Tailwind for styling
- Use Framer Motion for animations
- Follow component naming conventions
```

### قواعد التحقق من الـ API
```markdown
In API directory:
- Use zod for all validation
- Define return types with zod schemas
- Export types generated from schemas
```

### قوالب React
```markdown
React components should follow this layout:
- Props interface at top
- Component as named export
- Styles at bottom

@component-template.tsx
```

### تحليل التطبيق
```markdown
When asked to analyze the app:
1. Run dev server with `npm run dev`
2. Fetch logs from console
3. Suggest performance improvements
```

## استيراد القواعد (Importing Rules)

### قواعد عن بُعد عبر GitHub
1. افتح Cursor Settings → Rules, Commands
2. اضغط `+ Add Rule` بجانب Project Rules ثم اختر Remote Rule (Github)
3. الصق رابط مستودع GitHub الذي يحتوي القاعدة
4. يبقى Cursor متزامناً مع المصدر — تُحدَّث القاعدة تلقائياً عند تحديثها عن بُعد

### مهارات وإضافات Claude
Cursor يمكنه تحميل القواعد من نظام مهارات وإضافات Claude، وتُعامَل دائماً كقواعد
يقررها الوكيل (agent-decided) — أي يحدد Cursor وقت ملاءمتها حسب السياق.

## القواعد القديمة (Legacy)
- `.cursorrules` في جذر المشروع ما زال مدعوماً لكنه سيُهمَل — يُنصح بالترحيل إلى
  Project Rules أو AGENTS.md. (هذا المشروع يستخدم `.cursorrules` حالياً).
- `.mdc` cursor rules ما زالت تعمل، لكن القواعد الجديدة تُنشأ كمجلدات في `.cursor/rules`.

## FAQ
- **هل يمكن تضمين ملفات؟** نعم، استخدم `@filename.ts` لتضمين ملفات في سياق القاعدة.
- **هل يمكن ذكر القواعد يدوياً؟** نعم، عبر `@mention` في المحادثة.
- **هل تؤثر القواعد على Cursor Tab أو Inline Edit؟** لا، تُستخدم فقط في Agent (Chat).
- **هل تُطبَّق User Rules على Inline Edit؟** لا، فقط في Agent (Chat).
