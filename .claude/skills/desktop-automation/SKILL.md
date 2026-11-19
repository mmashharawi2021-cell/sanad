---
name: desktop-automation
description: أتمتة وتنظيم سطح المكتب والتنزيلات وفرز الملفات وتجهيز بيئات العمل في سند
---

# مهارة أتمتة سطح المكتب والملفات (Desktop Automation Skill)

تتيح هذه المهارة لـ Claude Code فهم وتطوير محرك تنظيم الملفات الذكي في «سند».

## القواعد الأساسية لفرز الملفات:
1. **الأمان المطلق:** لا تحذف أي ملف أبداً أثناء التنظيم.
2. **استثناء الملفات الحساسة:**
   - ملفات الاختصارات (`.lnk`, `.url`)
   - ملفات النظام (`desktop.ini`, `thumbs.db`, `.git`)
   - مجلدات النظام ومجلدات العمل الرئيسية
3. **التصنيفات المعتمدة:**
   - `مشاريع وخرائط GIS`: `.aprx`, `.mxd`, `.gpkg`, `.shp`, `.geojson`, `.kml`
   - `المستندات والتقارير`: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.pptx`, `.txt`
   - `الصور والتصاميم`: `.png`, `.jpg`, `.jpeg`, `.svg`, `.psd`, `.ai`
   - `الفيديو والصوتيات`: `.mp4`, `.mkv`, `.mp3`, `.wav`
   - `الملفات المضغوطة`: `.zip`, `.rar`, `.7z`, `.tar`
   - `أكواد وبرمجيات`: `.py`, `.js`, `.ts`, `.html`, `.css`, `.json`
   - `برامج التثبيت`: `.exe`, `.msi`, `.apk`

## الملف المسؤول:
- `src/desktopAutomation.ts`
- الـ API: `POST /api/desktop/organize`, `GET /api/desktop/status`, `POST /api/desktop/preset`
