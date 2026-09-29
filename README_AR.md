## ما يعمل فعليًا
- Firebase Authentication (Email/Password)
- Cloud Firestore
- My Trips
- Smart Planner وManual Planner
- Live Trip progress
- Jordan Passport / Visited Places
- Stories
- العربية والإنجليزية
- صفحات Petra / Wadi Rum / Dead Sea
- Scan & Learn على الهاتف

## التشغيل على Windows
افتح المجلد في VS Code ثم افتح Terminal واكتب:

```powershell
npm.cmd install
npm.cmd run dev
```

ثم افتح:

```text
http://localhost:5173/
```

أو من VS Code افتح **Run and Debug** واختر:

```text
Tourism Compass — Run
```

## Firebase
Firebase Project:

```text
tourism-compass-91bd6
```

ملفات Firebase Hosting جاهزة داخل المشروع:
- `firebase.json`
- `.firebaserc`

بعد تثبيت Firebase CLI وتسجيل الدخول يمكن النشر باستخدام:

```powershell
npm.cmd run firebase:deploy
```

سيتم تشغيل `vite build` أولًا ثم نشر مجلد `dist` على Firebase Hosting.

## ملاحظة PowerShell
على هذا الجهاز استخدم `npm.cmd` بدل `npm` بسبب سياسة PowerShell السابقة.


## تحديث V26 — اللوقو الرسمي
تم استبدال اللوقو القديم باللوقو الجديد **Tourism Compass** بصيغة PNG شفافة بدون خلفية، وربطه مباشرة بالـHeader في نسختي Desktop وMobile.


## تحديث V27
تمت إزالة أسماء خدمات البنية الخلفية من واجهة المستخدم. تستمر المصادقة والمزامنة السحابية بالعمل في الخلفية مع عرض رسائل عامة وآمنة للمستخدم.


## V28 — Community Stories
أصبحت القصص المنشورة مشتركة بين المستخدمين عبر Cloud Firestore مع قواعد وصول تحمي التعديل والحذف لصاحب القصة. راجع `V28_NOTES_AR.md` قبل النشر.
