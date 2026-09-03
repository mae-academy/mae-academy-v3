---
description: "Cursor rules for Vitest unit testing with TypeScript."
globs: client/src/**/*.{test,spec}.{ts,tsx}
alwaysApply: false
---
# Vitest Unit Testing

> المصدر: https://github.com/PatrickJS/awesome-cursorrules
> ملف: `rules/vitest-unit-testing-cursorrules-prompt-file.mdc`
> يُقرأ بالتكامل مع `.skills/vitest-testing.md` الخاص بالمشروع.

## الشخصية (Persona)
أنت مطور خبير لديه معرفة عميقة بـ Vitest و TypeScript، ومهمتك إنشاء اختبارات وحدة
(unit tests) لتطبيقات JavaScript/TypeScript.

## كشف استخدام TypeScript تلقائياً
افحص المشروع من خلال `tsconfig.json` أو اعتماديات `package.json` لتحديد استخدام TypeScript،
ثم اضبط الصيغة وامتدادات الملفات (.ts/.js) بناءً على ذلك.

## تركيز اختبار الوحدة
- أنشئ اختبارات تركز على الوظائف الحرجة (منطق الأعمال، الدوال المساعدة).
- قم بـ Mock للحدود الخارجية فقط (استدعاءات API، وحدات خارجية) قبل الاستيرادات باستخدام `vi.mock` — لا تmock الوحدة قيد الاختبار نفسها؛ الـ assertions تقيس السلوك الحقيقي لا استدعاءات الـ mocks.
- اختبر سيناريوهات بيانات متنوعة (مدخلات صالحة، غير صالحة، حالات حدية).
- اكتب اختبارات قابلة للصيانة بأسماء وصفية مجمّعة في كتل `describe`.

## أفضل الممارسات
1. **الوظائف الحرجة:** أعط الأولوية لاختبار منطق الأعمال والدوال المساعدة.
2. **Mock الحدود الخارجية فقط:** `vi.mock()` للاعتماديات الخارجية قبل الاستيرادات؛ الوحدة قيد الاختبار تُنفَّذ فعلياً دائماً (سلوك حقيقي).
3. **سيناريوهات البيانات:** اختبر المدخلات الصالحة، غير الصالحة، والحالات الحدية.
4. **التسمية الوصفية:** استخدم أسماء اختبارات واضحة تشير للسلوك المتوقع.
5. **تنظيم الاختبارات:** جمّع الاختبارات ذات الصلة في كتل `describe`/`context`.
6. **أنماط المشروع:** طابق اصطلاحات وأنماط الاختبار في الفريق.
7. **الحالات الحدية:** تضمين قيم `undefined`، عدم تطابق الأنواع، والمدخلات غير المتوقعة.
8. **كمية الاختبارات:** حدّد 3-5 اختبارات مركّزة لكل ملف للحفاظ على قابلية الصيانة.

## مثال Unit Test
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

// Mock الاعتماديات قبل الاستيرادات
vi.mock('../api/locale', () => ({
  getLocale: vi.fn(() => 'en-US'),
}));

// استيراد الوحدة قيد الاختبار
const { formatDate } = await import('../utils/formatDate');

describe('formatDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format date correctly', () => {
    const date = new Date('2023-10-15');
    expect(formatDate(date)).toBe('2023-10-15');
  });

  it('should handle invalid date', () => {
    expect(formatDate(new Date('invalid'))).toBe('Invalid Date');
  });

  it('should throw error for undefined input', () => {
    expect(() => formatDate(undefined)).toThrow('Input must be a Date object');
  });
});
```

## مثال TypeScript
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

// Mock الاعتماديات قبل الاستيرادات
vi.mock('../api/weatherService', () => ({
  getWeatherData: vi.fn(),
}));

import { getWeatherData } from '../api/weatherService';
import { getForecast } from '../utils/forecastUtils';

interface WeatherData {
  temperature: number;
  humidity: number;
  conditions: string;
}

describe('getForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return forecast when weather data is available', async () => {
    const mockWeather: WeatherData = { temperature: 25, humidity: 65, conditions: 'sunny' };
    (getWeatherData as any).mockResolvedValue(mockWeather);

    const result = await getForecast('New York');

    expect(getWeatherData).toHaveBeenCalledWith('New York');
    expect(result).toEqual({ prediction: 'Clear skies', severity: 'low' });
  });

  it('should handle missing data fields', async () => {
    (getWeatherData as any).mockResolvedValue({ temperature: 25 });
    await expect(getForecast('London')).rejects.toThrow('Incomplete weather data');
  });

  it('should handle API errors gracefully', async () => {
    (getWeatherData as any).mockRejectedValue(new Error('Service unavailable'));
    await expect(getForecast('Tokyo')).rejects.toThrow('Failed to get forecast: Service unavailable');
  });
});
```

## ملاحظة للمشروع
في mae-academy، الأولوية القصوى هي محركات الحسابات والتحليلات في `analysis/` والدوال
الرياضية داخل `client/src/utils` و `client/src/lib`. طبّق القواعد أعلاه مع الالتزام
بمعايير الدقة الرياضية في `.skills/vitest-testing.md`.
