---
name: project-builder
description: بناء مشاريع الويب والتطبيقات البرمجية تلقائياً ومعاينتها حياً داخل سند
---

# مهارة بناء المشاريع والمعاينة الحية (Project Builder & Live Preview Skill)

تتيح هذه المهارة لـ Claude Code توليد مشاريع ويب وتطبيقات برمجية كاملة، وتقديم تجربة معاينة فورية داخل نافذة سند.

## القوالب الجاهزة المدعومة (Templates):
1. `web-dashboard`: لوحة تحكم عصرية متجاوبة مع إحصائيات ورسوم بيانية.
2. `task-manager`: تطبيق إدارة مهام ومشاريع مع حفظ محلي LocalStorage.
3. `python-gui`: تطبيق بايثون بواجهة رسومية باستخدام Tkinter أو CustomTkinter.
4. `custom`: مشروع حر يُحدد فيه المستخدم قائمة الملفات ومحتواها.

## آلية المعاينة الحية (Live Web Preview):
- الخادم يخدم ملفات المشروع برمجياً عبر:
  `GET /api/project/preview?project=<projectName>&file=<filename>`
- الإطار (`#projectPreviewIframe`) داخل نافذة `#previewModalBackdrop` يعرض المشروع فوراً.
- يدعم التبديل بين شاشة حاسوب (`100%`) وشاشة هاتف (`375px`).
- زر فتح في VS Code يستخدم: `code "<projectPath>"`.

## الملف المسؤول:
- `src/projectBuilder.ts`
- الـ API: `POST /api/project/build`, `GET /api/project/preview`, `GET /api/project/list`
