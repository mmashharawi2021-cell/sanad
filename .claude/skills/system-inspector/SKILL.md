---
name: system-inspector
description: فحص أداء النظام، تحرير الذاكرة العشوائية (RAM Boost)، واكتشاف أضخم الملفات وتنظيف القرص
---

# مهارة فحص النظام ومساعد القرص (System Inspector & RAM Optimizer Skill)

تُمكّن هذه المهارة Claude Code من مراقبة صحة لابتوب المستخدم وتحسين موارده فورياً.

## العمليات الأساسية:
1. **فاحص الأقراص (`getDrivesInfo`):**
   - استعلام WMI عن جميع الأقراص الثابتة (`Win32_LogicalDisk -Filter "DriveType=3"`).
   - استخراج المساحة الكلية والمستخدمة والحرة بدقة.
2. **تحرير وتسريع الرام (`optimizeRam`):**
   - استدعاء دالة `EmptyWorkingSet` من `psapi.dll` عبر PowerShell C# Interop.
   - تفريغ مساحات العمل للبرامج الخاملة بأمان، وتحرير 500-1500 ميجابايت من الذاكرة فورياً دون التسبب بإغلاق أي تطبيق.
3. **فاحص أكبر الملفات (`findLargeFiles`):**
   - مسح ذكي للمجلدات الشخصية (سطح المكتب، التنزيلات، المستندات، الفيديوهات) للبحث عن الملفات التي تتجاوز حجماً محدداً (مثل 30MB أو 100MB).
   - توفير مسار الملف وزر إظهاره فوراً في مستكشف الويندوز عبر `explorer.exe /select,"<path>"`.
4. **التنظيف الآمن للملفات المؤقتة (`safeDeepCleanDisk`):**
   - تفريغ ملفات `%TEMP%` وملفات CrashDumps بأمان دون المساس بملفات المستخدم الشخصية أو النظام.

## الملف المسؤول:
- `src/diskInspector.ts`
- الـ API: `GET /api/system/disks`, `GET /api/system/health`, `POST /api/system/optimize-ram`, `POST /api/system/clean-disk`, `POST /api/system/large-files`, `POST /api/system/reveal-file`
