# SkinWISE — Full Analysis Pipeline (Next.js + FastAPI)

SkinWISE uses a **Next.js frontend**, a **FastAPI inference service**, and
Supabase for authentication and scan history. ONNX models run on the FastAPI
server using ONNX Runtime; scan images are sent to that service for analysis
and are not stored by it.

1. **Face detection** (`face_detector.onnx`, Ultra-Light-Fast-Generic-Face-Detector-1MB) → confirms a real face is present before running any analysis
2. **Facial landmarks** (`landmark_detector.onnx`, PIPNet 68-point) → splits detected lesions left/right for Hayashi grading (user-editable review screen)
3. **Skin type CNN** (`skinwise_model.onnx`) → Dry / Normal / Oily
4. **Acne lesion detection** (`acne_detector.onnx`, YOLO11m) → comedone, nodules, papules, pustules ke bounding boxes
5. **Severity grading** → Hayashi (2008) and NICE NG198 (2021) are used internally with user-confirmed counts; only the combined Clear/Mild/Moderate/Severe Overall Severity is shown and saved
6. **Live weather** (Open-Meteo, koi API key nahi chahiye) → temperature, humidity, UV index
7. **Routine engine** → skin type + detected lesion pattern + NICE category + weather ko combine kar ke personalised routine + har choice ki explanation
8. **Login / Signup** (email+password aur Google) + **database** (Supabase/Postgres) → har scan save hota hai, `/history` page par progress track hoti hai
9. **Safety Profile** → contraindication flags (pregnancy, isotretinoin, open wound, allergy, under-15) — set hone par poori personalised routine (cleanser/moisturizer/sunscreen/acne-care) pause ho jati hai, analysis normal chalta hai

All four ONNX models (face, skin type, acne, and landmarks) are stored in
`backend/models/` and loaded by the FastAPI service. The existing Supabase
project is still used for authentication and scan history (Step 4.5).

---

## 📁 A to Z Setup — VS Code mein

### 1. Zaroori software install karein (agar pehle se nahi hain)

- **Node.js (LTS version, 18 ya usse upar)** — https://nodejs.org se download karein
- **VS Code** — https://code.visualstudio.com

Install hone ke baad terminal mein confirm karein:

```bash
node -v
npm -v
```

### 2. Project folder VS Code mein kholein

- Is poore `skinwise-app` folder ko kisi jagah extract/copy karein
  (e.g. `C:\Users\YourName\Projects\skinwise-app`)
- VS Code kholein → **File → Open Folder** → `skinwise-app` select karein

### 3. Terminal kholein (VS Code ke andar)

Menu se: **Terminal → New Terminal** (ya shortcut `Ctrl + ~`)

### 4. Dependencies install karein

```bash
npm install
```

The frontend does not download or execute model files. The AI service must
be running separately for scans.

### 4.1. FastAPI AI service set up karein

Use Python 3.10 or newer. From the project root, create a virtual environment,
activate it, and install the backend dependencies:

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

The ONNX files should be in `backend/models/` (they are included in this
project). Start the inference API in its own terminal:

```powershell
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Wait for model startup to finish, then check `http://127.0.0.1:8000/health`.
The default frontend API address is `http://127.0.0.1:8000`. To use a
different address, add this to `.env.local` and restart Next.js:

```text
SKINWISE_API_URL=http://127.0.0.1:8000
```

The Next.js server proxies authenticated inference requests to FastAPI. Keep
the FastAPI port private in production; do not expose the model service
directly to the public internet.

### 4.5. Supabase project set up karein (login + database ke liye)

1. **Account banayein**: https://supabase.com par jaayein → "Start your project" → GitHub/Google se sign up (free)
2. **Naya project banayein**: "New Project" → naam dein (e.g. `skinwise`) → database password set karein → region select karein → "Create new project" (1-2 minute lagega provision hone mein)
3. **Schema install karein**: project khulne ke baad, left sidebar mein **SQL Editor** par click karein → "New query" → is project ke `supabase/schema.sql` file ka **poora content copy-paste** karein → "Run" dabayein. Ye aapki `profiles` aur `scans` tables bana dega, security rules (RLS) ke saath.
4. **Consultation tables install karein**: `supabase/migration_add_consultations.sql` ka poora content SQL Editor mein run karein. RLS doctors aur appointments ki access control karta hai.
5. **API keys copy karein**: left sidebar mein **Project Settings → API** par jaayein. Wahan se `Project URL` aur `anon public` key copy karein.
6. **`.env.local` file banayein**: project root mein `.env.local.example` ko copy kar ke `.env.local` banayein, aur upar wali values paste karein:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   ```
7. **Google sign-in enable karein (optional lekin recommended)**:
   - Supabase dashboard mein **Authentication → Providers → Google** kholein, enable karein
   - Google Cloud Console (https://console.cloud.google.com) mein ek OAuth Client ID banayein (Web application type), aur authorized redirect URI mein Supabase ka diya hua callback URL paste karein (Supabase provider settings page par khud dikh jata hai)
   - Client ID aur Client Secret wapas Supabase ke Google provider settings mein paste kar ke save karein
   - Agar Google sign-in skip karna hai, koi baat nahi — email/password wala login bina kisi extra setup ke kaam karega

### 5. Next.js development server chalayein

```bash
npm run dev
```

Terminal mein ye output aayega:

```
- Local: http://localhost:3000
```

Browser mein `http://localhost:3000` kholein — app khul jayega.

Admin setup ke liye app mein admin account register karein. Phir Supabase SQL Editor mein migration ke top par diya `admin_users` insert query run karein aur `admin@example.com` ko us account ke email se replace karein. Admin access alag table mein provision hota hai; user apne account se admin role nahi bana sakta. Ab `/admin` kholein.

### 6. Test karein

- Browser mein `http://localhost:3000` khulte hi **login page** par redirect ho jayenge (kyunki abhi tak account nahi hai)
- **"Sign up"** par click karein → naam, email, password dein → **"Create account"**
- Agar email confirmation on hai (Supabase default), apna inbox check karein aur confirmation link par click karein, phir login karein
- Login hone ke baad asal app khulegi:
- **Upload photo** tab: koi bhi face photo (JPG/PNG) drag-drop karein ya click kar ke browse karein
- **Use camera** tab: browser camera permission allow karein, phir "Capture photo" dabayein
- Do stages mein scan hoga (skin type, phir acne detection), phir poora dashboard aayega:
  skin type + confidence, annotated photo (bounding boxes), Overall Severity, lesion-count review screen,
  weather (location permission maangega), aur personalised routine
- Browser location permission bhi maangega — allow karne par weather-adjusted routine milega,
  decline karne par bhi routine ban jayega (bas weather adjustment ke bina)
- Scan confirm karne ke baad **save** ho jata hai — header mein **"History"** par click kar ke apne purane scans aur total-lesion trend dekh sakte hain

---

## 📦 Project Structure

```
skinwise-app/
├── app/
│   ├── layout.tsx          → fonts and shared page layout
│   ├── page.tsx            → server component: fetches user, renders ScannerApp
│   ├── globals.css         → global styles
│   ├── login/page.tsx      → login page
│   ├── signup/page.tsx     → signup page
│   ├── history/page.tsx    → past scans + total-lesion trend chart
│   ├── admin/page.tsx      → admin-only management panel
│   ├── consultations/page.tsx → dermatologist booking and appointment list
│   ├── safety-profile/page.tsx → editable contraindication flags form
│   └── auth/
│       ├── callback/route.ts → handles Google OAuth redirect
│       └── signout/route.ts  → logs the user out
├── middleware.ts            → redirects unauthenticated requests to /login
├── backend/
│   ├── app/main.py        → FastAPI image validation and ONNX inference endpoints
│   ├── app/landmarks_data.py → PIPNet neighbour decoding constants
│   ├── models/            → face, skin, acne, and landmark ONNX models
│   └── requirements.txt   → Python dependencies
├── components/
│   ├── ScannerApp.tsx     → the scan flow (upload/camera → results)
│   ├── ConfirmSkinType.tsx→ confirm/override skin type stage (with quiz option)
│   ├── SkinTypeQuiz.tsx   → 4-question self-assessment quiz widget
│   ├── AuthForm.tsx       → shared login/signup form (email+password + Google)
│   ├── UserMenu.tsx       → header: history link, user name, logout
│   ├── SafetyProfileForm.tsx → editable contraindication flags
│   ├── UploadPanel.tsx    → drag-and-drop upload
│   ├── CameraCapture.tsx  → live webcam capture
│   ├── ScanningState.tsx  → loading animation (reused for both scan stages)
│   ├── Dashboard.tsx      → assembles the full results view + saves scan to DB
│   ├── ResultPanel.tsx    → skin type verdict + confidence bars
│   ├── SpectrumMeter.tsx  → dry-normal-oily gradient indicator
│   ├── AcneCanvas.tsx     → draws photo + acne bounding boxes
│   ├── SeverityMeter.tsx  → segmented Clear/Mild/Moderate/Severe overall severity meter
│   ├── AnalysisSummaryCard.tsx → top-of-dashboard at-a-glance summary
│   ├── ConfidenceBadge.tsx     → High/Medium/Low confidence pill (reused in several places)
│   ├── ImprovementInsights.tsx → compares current scan to the previous one
│   ├── TechnicalDetailsCard.tsx → collapsible model/inference-time/resolution details
│   ├── AnalysisPipeline.tsx    → top-of-dashboard pipeline-stage checklist
│   ├── Tooltip.tsx             → reusable (ⓘ) info tooltip for calculated metrics
│   ├── AdminPanel.tsx          → admin dashboard and consultation management
│   ├── ConsultationHub.tsx     → doctor directory, booking and patient appointments
│   ├── HealthScoreRing.tsx→ 0–100 circular score
│   ├── HistoryChart.tsx   → SVG line chart of total lesions over time
│   ├── WeatherCard.tsx    → geolocation + live weather fetch
│   └── RoutineCard.tsx    → generated routine + explanations
├── lib/
│   ├── supabase/
│   │   ├── client.ts      → Supabase client for Client Components (browser)
│   │   ├── server.ts      → Supabase client for Server Components/routes
│   │   └── admin.ts       → server-side admin membership check
│   ├── inferenceApi.ts    → typed client for authenticated Next.js inference routes
│   ├── model.ts           → skin prediction response types and confidence helpers
│   ├── acneModel.ts       → acne detection response types
│   ├── landmarks.ts       → left/right midline split for Hayashi
│   ├── hayashi.ts          → Hayashi (2008) half-face severity grading
│   ├── nice.ts             → NICE NG198 (2021) clinical escalation category
│   ├── acnePattern.ts      → dominant lesion pattern (drives acne-care ingredient choice)
│   ├── overallSeverity.ts  → Overall Severity = max(Hayashi, nodule tier), NICE floor (drives routine)
│   ├── reviewCounts.ts     → user-confirmed lesion counts (single source of truth for severity)
│   ├── weather.ts         → Open-Meteo fetch (no API key needed)
│   ├── routineEngine.ts   → rule-based routine decision engine
│   ├── skinQuiz.ts        → self-assessment quiz questions + scoring
│   └── constants.ts       → class labels, colors, thresholds
├── supabase/
│   ├── schema.sql          → paste into Supabase SQL Editor once (tables + RLS)
│   ├── migration_add_consultations.sql → doctors, appointments, admin access + RLS
│   ├── migration_simplify_severity.sql → drops method-specific scan columns; run on existing databases
│   ├── migration_add_safety_profile.sql → run only if you set up Supabase before this update
│   └── migration_add_onboarding.sql → run only if you set up Supabase before this update
└── package.json
```

`backend/models/` contains the four ONNX deployment models; the inference
service never writes uploaded images to disk or stores them in Supabase.

---

## 🧠 Model ke baare mein zaroori baatein

- Input shape: `[1, 224, 224, 3]` (RGB, 224×224)
- Preprocessing: `pixel / 127.5 - 1.0` using the FastAPI preprocessing path
- Class mapping: `{"dry": 0, "normal": 1, "oily": 2}` — ye `lib/constants.ts` mein hardcoded hai,
  bilkul aapki `class_indices.json` ke mutabiq

Agar future mein aap model dobara train karein aur naya `.onnx` file banayein, to bas:

1. Naye file ko `backend/models/skinwise_model.onnx` (isi naam se) replace kar dein
2. Agar class order badle to `lib/constants.ts` mein `CLASS_ORDER` update kar dein

---

## 🗑️ History management

`/history` page ke top par ab **do alag buttons** hain:

- **"View Last Scan"** — is page par hi, sabse recent scan card ko automatically
  open kar ke uske paas smooth-scroll kar deta hai (koi navigation nahi, same
  page par)
- **"New Scan"** — seedha home page (`/`) par le jata hai, fresh upload screen
  ke saath — session cookie mein already login hai, dobara kuch enter karne
  ki zaroorat nahi

Aur:

- **"Delete all history"** — chart ke neeche, right-aligned. Confirm/cancel
  step ke saath (accidental delete se bachne ke liye). Ye `user_id` filter
  ke saath delete karta hai, aur Supabase ki RLS policy already ensure
  karti hai ke sirf current user ke apne scans delete ho sakein

---

## 📋 Dashboard polish (summary card, confidence badges, improvement insights)

Ye features do independent UI/UX reviews ke suggestions se aaye (dono ne
alag-alag ek hi cheezein flag ki thin — ek achhi validation signal):

- **AnalysisSummaryCard** — sabse top par ek at-a-glance summary (skin type,
  severity, total lesions, confidence, analysis time) taake user ko scroll
  na karna pare
- **ConfidenceBadge** — High/Medium/Low label (75%+ / 50-75% / &lt;50%)
  raw percentage ke saath, samajhne mein aasan
- **ImprovementInsights** — current scan ko **pichle scan** se compare karta
  hai (lesion count delta, Hayashi count delta) — Supabase se previous scan
  fetch karta hai
- **TechnicalDetailsCard** — collapsible card: model names, real inference
  time (`performance.now()` se measure hoti hai), image resolutions

**Zaroori — jo hum ne jaan-boojh kar NAHI kiya:** Reviews mein ek suggestion
tha ke model ke decision ki "reasons" likhi jayen (jaise "Low oil production
detected", "Rough texture observed"). **Ye humne add nahi kiya** — kyunke
CNN classifier literally ye intermediate facts detect nahi karta, sirf
pixels se seedha probability nikalta hai. Aisi bullet points likhna ek
**fabricated explanation** hoti — agar viva mein poocha jata "model ne
'texture' kaise detect ki", jawab hota "nahi ki, hum ne text likh diya" —
jo project ki poori transparency-pitch ko undermine kar deta. Agar genuine
explainability chahiye, uska sahi tareeqa Grad-CAM heatmap hai (future
addition ke tor par discuss ho chuka hai, abhi implement nahi kiya).

Isi tarah, dono reviews ne suggest kiya ke **confidence percentages aur
spectrum meter ko hatana mat** — ye seedha model ka raw, honest output hai,
koi invention nahi, is liye ye jaisa hai waisa hi rakha gaya hai.

### Naya round of polish (3rd review ke baad)

- **Background redesign** — generic cream+serif look (jo AI-design ka
  well-known default hai) ko replace kiya gaya app ki apni dry/normal/oily
  identity colors ke ambient wash se, plus ek halka "scan grid" texture
  jo subject se related hai (photo-scan theme)
- **Cards ko `panel-elevated` class** — halka shadow, flat cards se zyada
  premium depth
- **Weather card mein advice bullets** — humidity/UV ke hisaab se 2 lines
  ki practical advice, sirf raw numbers nahi
- **RoutineCard poori tarah redesign** — custom minimal line-icons (emoji
  nahi, taake design language consistent rahe), har item ke neeche reason
  **directly visible** hai (collapsed nahi), aur skin-type/severity chips
  ke saath "Based on..." summary
- **Wording fix** — routine reasons ab *"Because the predicted skin type
  is X, Y is generally recommended"* pattern use karte hain, na ke *"AI
  detected tight barrier"* jaisi language jo galat impression deti thi ke
  CNN ne wo property khud detect ki
- **Tooltips (ⓘ)** — Severity Score aur Model Confidence
  teeno par ab hover/tap karne se formula/source dikhta hai, seedha app
  ke andar (sirf README mein nahi)
- **Analysis Pipeline checklist** — dashboard ke sabse top par, poori
  pipeline (Skin Type → Lesions → Severity → Weather → Routine) ek nazar
  mein
- **Technical Details mein thresholds** — confidence/IoU thresholds ab
  `lib/constants.ts` se seedha display hote hain (genuine values, koi
  invented number nahi)

---

## 🩹 Acne detection (YOLO11m)

`acne_detector.onnx` 640×640 input leta hai aur 4 classes detect karta hai:
`comedone`, `nodules`, `papules`, `pustules` — bilkul aapki training ke `data.yaml`
ke mutabiq. Model mein NMS baked-in nahi thi (`nms: False` export ke waqt), is
liye `lib/acneModel.ts` browser mein khud:

1. **Letterbox preprocessing** karta hai (aspect ratio maintain karte hue 640×640
   mein resize + gray padding) — bilkul Ultralytics jaisa
2. Raw output (`[1, 8, anchors]` — 4 box coords + 4 class scores) ko **decode**
   karta hai
3. Apna **Non-Max Suppression (NMS)** chalata hai, per-class, taake overlapping
   duplicate boxes hat jayein
4. Boxes ko wapas original photo ke pixel coordinates mein convert karta hai

Confidence aur IoU thresholds `lib/constants.ts` mein hain
(`ACNE_CONF_THRESHOLD`, `ACNE_IOU_THRESHOLD`) — agar boxes zyada strict ya loose
chahiye to yehi values adjust kar lein.

---

## 📊 Severity grading — Hayashi (2008) + NICE NG198 (2021), on user-confirmed counts

**GAGS has been fully removed.** Severity now comes from **two independent,
published, count-based methods**, applied only to lesion counts the user
has explicitly reviewed and confirmed — never raw YOLO output directly.

### How the internal signals produce one result

- **Hayashi (Hayashi N, Akamatsu H, Kawashima M. J Dermatol. 2008;35:255–260)**
  —   A lesion-count grading whose output is mapped to the app's supported Clear/Mild/Moderate/Severe range.
  The paper's own finding: dermatologists' severity impressions correlated
  with **papule + pustule count on HALF the face**, but **not** with
  comedone count — so comedones and nodules are never added to this count.
  Published thresholds (per half-face): 0–5 Mild, 6–20 Moderate, and
  21–50 Severe; counts above 50 map to the app's Severe tier. See `lib/hayashi.ts`.
- **NICE NG198 ("Acne vulgaris: management", NICE, 2021)** — an
  **independent clinical escalation category** (Mild-to-Moderate /
  Moderate-to-Severe), not a 4-level score. Verified against the
  committee's own wording: ≤34 whole-face inflammatory lesions
  (papules+pustules+nodules) **and** ≤2 nodules → Mild-to-Moderate; **35+**
  inflammatory lesions **or 3+** nodules → Moderate-to-Severe. See
  `lib/nice.ts`.

These signals answer different questions and are combined by the
application's documented rule to produce **one Overall Severity**. Only
Clear, Mild, Moderate, or Severe is shown in the interface and stored in
`overall_severity`; the component methods are not shown as separate badges
or saved in separate scan columns. The PDF keeps a small methodology note
for academic transparency.

### The pipeline

1. YOLO11m detects lesions as before (comedone/papule/pustule/nodule boxes)
2. `PIPNet` landmarks (unchanged model) locate the face's vertical midline
   (average x of the 4 nose-bridge points) — used to split detected
   papules/pustules into **left half / right half**, since Hayashi's
   grading is specifically a half-face count (`lib/landmarks.ts`,
   `suggestConfirmedCountsFromLandmarks`)
3. **Review screen** (`LesionReviewCard.tsx`) shows the annotated photo
   with editable count fields — comedones, nodules (whole-face), and
   papules/pustules split left/right — pre-filled from steps 1–2, but the
   user must review and correct them
4. A **mandatory checkbox** ("I've checked these counts against my photo")
   must be ticked before "Confirm & Save" is enabled, whenever any lesion
   was detected — the same never-silently-trust-automatic-detection
   pattern used throughout this project (skin-type quiz, the old GAGS
   calculator, landmark pre-fill)
5. Only the **confirmed** counts (`lib/reviewCounts.ts`, `ConfirmedCounts`)
   are ever passed into `computeHayashiSeverity()` and `computeNiceCategory()`

### Acne pattern — what drives the routine's ingredient choices

`lib/acnePattern.ts` classifies the confirmed counts into a dominant
**pattern** — Comedonal-dominant / Inflammatory-dominant / Mixed /
Clear — which the routine engine uses (together with Overall Severity and
skin type) to pick *which* acne-care ingredients to mention (e.g.
adapalene for comedonal, benzoyl peroxide or azelaic acid for
inflammatory). **This is an author-defined
classification, not from a named published source** — disclosed as such
in the code and here. **Nodules do NOT affect pattern classification** —
see the Overall Severity section below for why, and how nodules are
accounted for instead.

### Overall Severity — what actually drives the routine

Hayashi and NICE (above) are both shown to the user, but neither one
alone decides what ingredients the routine engine recommends. A third
value, **Overall Severity** (`lib/overallSeverity.ts`), does that job,
combining three signals so no single one can silently dominate:

```
NoduleTier   = 1 nodule → Mild | 2 nodules → Moderate | 3+ nodules → Severe
Overall      = max(HayashiSeverity, NoduleTier)
NICE floor   = if NICE = Moderate-to-Severe, Overall is raised to at least Severe
```

**Why not just use NICE, or just use nodule-presence, on its own?** An
earlier version of this logic let *any* nodule override the detected
lesion pattern entirely — so a case with 25 papules/pustules and 1
nodule lost its evidence-based inflammatory-acne ingredient guidance just
because one nodule was also present, even though NICE itself would still
call that case Mild-to-Moderate. The nodule tier now competes with (via
`max()`), rather than silently overrides, the genuine lesion-count
burden — a large papule/pustule count is never hidden by a small nodule
count, and vice versa. **`NoduleTier` (1→Mild, 2→Moderate, 3+→Severe) is
a SkinWISE application-design choice**, not from Hayashi or NICE
directly — disclosed as such. The "3+ nodules → Severe" edge does happen
to match NICE's own published nodule threshold, which is why the NICE
floor step above is close to redundant at that specific point, but it
still matters for the 35+-inflammatory-lesions half of NICE's rule, which
has no nodule-count equivalent otherwise.

A separate, severity-independent **nodule note** (1 nodule = a soft
"keep an eye on it"; 2 nodules = a stronger "consider a dermatologist
visit if not improving") is always shown alongside whatever ingredient
guidance Overall Severity produces, so the nodule signal is never lost
even when it isn't the thing driving the tier.

### Acne-care ingredient matrix — Overall Severity × Pattern × Skin Type

No single fixed ingredient list is ever shown for a given severity. The
routine engine (`lib/routineEngine.ts`, `acneCareForNonSevere()`) looks up
Overall Severity, the detected pattern, AND skin type together:

| Overall Severity | Pattern | Oily / Normal skin | Dry skin |
|---|---|---|---|
| Mild | Comedonal / Mixed | Adapalene (single agent) | Adapalene (single agent) |
| Mild | Inflammatory | Benzoyl peroxide (single agent) | Azelaic acid (single agent) |
| Moderate | Comedonal | Adapalene + Azelaic acid | Adapalene + Azelaic acid |
| Moderate | Inflammatory / Mixed | **Adapalene + Benzoyl peroxide** | Adapalene + Azelaic acid |
| Severe | any | *(no ingredients — professional evaluation)* | *(no ingredients — professional evaluation)* |

**Traceability, cell by cell:**

- **Mild = single agent, Moderate = combination** — AAD 2024's general
  severity-ladder principle (mild acne doesn't need combination therapy).
- **Adapalene + Benzoyl peroxide** (Moderate/Inflammatory-or-Mixed,
  non-dry skin) — this exact pairing is **NICE NG198's own literal
  first-line fixed-combination option for acne of any severity**,
  verified against the guideline's own recommended-options table — not
  invented.
- **Dry skin substitutes Azelaic acid for Benzoyl peroxide** — a
  **SkinWISE clinical-reasoning extension**, not a NICE-specified
  skin-type rule (NICE doesn't stratify by cosmetic skin type at all).
  Benzoyl peroxide's drying/irritant profile is well documented in
  dermatology, and NICE itself lists azelaic acid as a valid alternative
  option when a first-line choice isn't tolerated — so this substitution
  combines two real, sourced facts, but the *mapping* ("if dry, use this
  substitute") is SkinWISE's own design decision.
- **Salicylic acid is deliberately not used as a primary ingredient** — a
  Cochrane review found it a less effective comedolytic agent than
  topical retinoids, so it isn't given equal footing with Adapalene
  anywhere in this matrix.
- **Severe → no ingredients, ever** — supportive skincare
  (cleanser/moisturizer/sunscreen) only, plus a professional-evaluation
  recommendation. SkinWISE never auto-prescribes oral antibiotics,
  isotretinoin, or any systemic medication, regardless of severity.

### Why this replaces GAGS (viva-ready explanation)

GAGS's own well-documented limitation: it grades each region by its
*worst lesion type only* — a region with 1 pustule and a region with 20
pustules score identically. Hayashi fixes this by actually counting.
NICE adds a second, independent signal — a real clinical guideline's
answer to "should this go to a professional?" — that GAGS never provided
at all. Every number used (0–5/6–20/21–50/50+, 34/35, 2/3) is a literal
published threshold, not tuned or invented. Overall Severity and the
nodule tier are the two places SkinWISE adds its own, clearly-disclosed
combination logic on top of those published numbers.

### Honest limitations (zaroori viva ke liye)

- Hayashi's thresholds were published for a **half-face** count; the
  left/right split here comes from a **landmark-based midline**
  (nose-bridge average x) — a defensible but SkinWISE-chosen anatomical
  boundary, since neither Hayashi nor GAGS publish an exact pixel
  definition of "half the face" (they were designed for a clinician's eye).
- When landmarks fail (no face box, or an extreme close-up/angled photo
  confuses the model), the left/right split **cannot be auto-filled** —
  comedone/nodule counts still pre-fill (they're whole-face), but the
  user must enter the left/right papule/pustule split manually.
- **Clinical validation clarification:** Hayashi and NICE are each
  independently published, peer-reviewed/guideline-committee-approved
  methods. **SkinWISE's combination of them — Overall Severity's
  max()-and-floor logic, the nodule tier, and the ingredient matrix's
  skin-type substitutions — are SkinWISE application-design choices,
  applied to AI-detected, user-confirmed counts, and are not themselves
  independently clinically validated.** This is stated explicitly in the
  app's PDF report footer, not just here.
- SkinWISE never auto-prescribes oral antibiotics, isotretinoin, or other
  systemic medication. Once Overall Severity reaches Severe, the routine
  engine shows supportive skincare only (cleanser/moisturizer/sunscreen)
  plus a professional-evaluation recommendation — no acne-care ingredient
  list at all at that level.

**Saving:** Scoring depends on the user's confirmed counts, so a scan
**never saves automatically** — the "Confirm & Save" button on the
dashboard is what triggers it, exactly as before.

**Database migrations:** if your Supabase project was set up before this
update, run, in order:
- `supabase/migration_hayashi_nice_replace_gags.sql` — adds
  `confirmed_counts`, `hayashi_left_count`, `hayashi_right_count`,
  `hayashi_count`, `nice_category`, `nice_inflammatory_count`,
  `acne_pattern`, `professional_evaluation_recommended`; drops the
  old GAGS-era `severity_score`/`severity_max_score`/`region_scores`.
- `supabase/migration_add_overall_severity.sql` — adds `overall_severity`;
  removes the now-unused `nodule_present` value from `acne_pattern`.
- `supabase/migration_simplify_severity.sql` — removes the legacy method-specific
  severity/count columns. `overall_severity` is the only stored severity.

A fresh install of `schema.sql` already has all of the above. The older
`migration_add_gags_regions.sql` / `migration_remove_health_score.sql` /
`migration_add_very_severe.sql` files are kept as historical record of
this project's evolution, not needed for a fresh install.

## 🌦️ Weather integration

`lib/weather.ts` browser ki **geolocation** use kar ke user ki location leta hai,
phir **Open-Meteo API** (https://open-meteo.com) call karta hai — is API ko koi
key nahi chahiye. Ye jaan-boojh kar OpenWeatherMap ki bajaye chuna gaya hai:
chunke ye app poori tarah client-side hai, koi bhi API key jo frontend code mein
daali jaye woh browser dev-tools se dikh jayegi. Open-Meteo free hai aur bina
key ke kaam karta hai, is liye ye is architecture ke liye safe choice hai.

---

## 📄 PDF Report Export

Dashboard ke neeche ek **"Download PDF report"** button hai — `lib/generateReport.ts`
poori tarah client-side (jsPDF library se) ek professional PDF banata hai jisme
annotated photo, skin type, Overall Severity, weather, aur poori routine
aur explanations shamil hain. Methodology ka chhota sa footnote academic transparency ke liye hai.
Koi server-side rendering nahi — sab kuch browser mein hi generate hota hai,
taake photo kahin upload na ho.

---

## 🛡️ Safety Profile (contraindication screening)

`/safety-profile` page par user 4 self-reported flags set kar sakta hai:
pregnant/breastfeeding, currently on isotretinoin, open wound/active
infection, ya known allergy to common actives.

**Zaroori design decision — analysis kabhi block nahi hoti, sirf recommendation:**

```
Photo → Skin Type + Severity + Weather (hamesha chalta hai)
              ↓
     Safety Profile check
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
Flag set             No flag
    ↓                   ↓
Cleanser/Moisturizer/SPF   Cleanser/Moisturizer/SPF
   (normal)                   (normal)
    ↓                   ↓
Active treatments:      Active treatments:
"⚠ Paused" + reason      Normal recommendation
```

- Agar **koi bhi** flag set ho, to sirf **"Active treatments"** section pause
  hota hai — cleanser/moisturizer/SPF (jo low-risk hain) normal chalte rehte
  hain. Ye jaan-boojh kar simple rakha gaya hai — specific flag ko specific
  ingredient se match karna (jaise "pregnancy sirf retinoid block kare")
  clinically nuanced hota, jo hum defend nahi kar sakte
- UI mein **"Unsafe"** jaisi language nahi use ki — "Recommendation eligibility"
  wording use hoti hai (`AnalysisSummaryCard` mein "✓ Analysis: Completed" /
  "⚠ Recommendation: Paused"), taake system khud ko medically "safe/unsafe"
  determine karne wala na dikhaye, sirf apni recommendation-behavior describe
  kare
- Har scan ke saath `recommendation_paused` aur `paused_reasons` bhi
  database mein save hote hain, taake history/PDF report bhi consistent
  rahein
- **File:** `lib/routineEngine.ts` mein `generateRoutine()` ab optional
  `safetyFlags` parameter leta hai — agar diya jaye to actives override ho
  jate hain, warna normal behavior

### One-time onboarding gate

Naye account ke **pehle login** par, user seedha scan page ki bajaye
`/safety-profile?onboarding=true` par redirect hota hai:

- **"Save & continue"** — flags save kar ke seedha home/scan page par le jata hai
- **"Skip for now"** — bina kuch fill kiye bhi aage badh sakte hain (Safety
  Profile menu se baad mein kabhi bhi fill kar sakte hain)
- Dono cases mein `profiles.onboarding_completed = true` ho jata hai, is
  liye **dobara login karne par** ye screen dobara nahi dikhti — seedha
  scan page khulta hai
- Ye check `app/page.tsx` (server component) mein hai — `profiles` table se
  ek query se `onboarding_completed` check hota hai, agar `false` ho to
  redirect

**Naya database migration zaroori hai** agar aap ne pehle Supabase setup kar
rakha hai — `supabase/migration_add_onboarding.sql` bhi chalayein (SQL
Editor mein paste + Run), `migration_add_safety_profile.sql` ke ilawa. Naye
projects ke liye `schema.sql` mein already shamil hai.

**Naya database migration zaroori hai** agar aap ne pehle Supabase setup kar
rakha hai — `supabase/migration_add_safety_profile.sql` chalayein (SQL
Editor mein paste + Run). Naye projects ke liye `schema.sql` mein already
shamil hai.

---

## 💊 Routine engine

`lib/routineEngine.ts` ek pure rule-based decision table hai. **Base**
cleanser/moisturizer/sunscreen skin type + weather se aate hain.
**Acne-care ingredient information** teen cheezon se milkar aati hai —
**Overall Severity** (`lib/overallSeverity.ts`), detected **lesion
pattern** (`lib/acnePattern.ts`), aur **skin type** — ek fixed list
kabhi nahi (poori matrix upar "Acne-care ingredient matrix" section mein
hai). Har choice ke saath ek **reason** attach hoti hai ("Why these
choices?" section aur PDF mein dikhti hai) — koi bhi recommendation bina
reason ke nahi aati.

**Zaroori (viva ke liye):**

- **Mild = single agent, Moderate = combination, Severe = koi ingredient
  nahi** — AAD 2024 ki severity-ladder ke general principle ke mutabiq.
  Severe par sirf supportive skincare (cleanser/moisturizer/sunscreen) +
  ek explicit "professional evaluation recommended" banner. **Kabhi bhi
  oral antibiotic, isotretinoin, ya koi systemic medication auto-suggest
  nahi hoti.**
- **Moderate/Inflammatory-ya-Mixed (non-dry skin)** par
  **Adapalene + Benzoyl peroxide** — ye NICE NG198 ka apna literal,
  verified first-line fixed-combination option hai, invent nahi kiya gaya.
- **Dry skin par Benzoyl peroxide ki jagah Azelaic acid** — ye SkinWISE ka
  clinical-reasoning extension hai (BPO ka drying/irritant profile
  well-documented hai, aur NICE khud azelaic acid ko valid alternative
  list karta hai), lekin "dry ho to ye substitute" ka mapping NICE ne
  specify nahi kiya — README mein disclosed hai, NICE ke naam se claim
  nahi kiya jata.
- **Salicylic acid primary ingredient nahi** — Cochrane review ke mutabiq
  retinoids se kam effective comedolytic hai.
- **Nodule note** — severity se independent, hamesha add hota hai jab
  nodule >= 1 ho (1 nodule = soft "keep an eye on it", 2 = stronger
  "consider a dermatologist visit if not improving"), taake nodule ka
  signal kabhi gum na ho.
- **Cleanser / moisturizer / sunscreen choices** — ye kisi specific
  clinical paper se nahi hain. Ye general, commonly-accepted skincare
  heuristics hain (oily skin/humid weather ke liye lighter formula, dry
  skin/low humidity ke liye richer formula). Viva mein inhe "practical
  skincare reasoning" kahein, "evidence-based clinical rule" nahi.
- Wording hamesha "acne-care ingredient to look for" hai, "prescription"
  ya "take this medicine" kabhi nahi — SkinWISE khud ko ek
  recommendation/wellness-support system ke tor par frame karta hai,
  prescription generator nahi.

---

## ❓ Skin type confirmation quiz

Skin-type scan ke baad, acne detection shuru hone se pehle, ek naya
**"confirm" stage** hai (`components/ConfirmSkinType.tsx`). Ye zaroori tha
kyunke CNN kabhi kabhi borderline predictions deta hai (jaise Dry 53.5% vs
Oily 38.2% — dono close hain, model confident nahi tha). Is stage mein:

- Agar top do classes ka gap **20 percentage points se kam** ho, to app
  khud proactively ek banner dikhata hai: *"Model wasn't fully confident —
  take a quick quiz?"*
- User chahe to `lib/skinQuiz.ts` wala **4-question "Skin Type Assessment"**
  le sakta hai — Midday Skin Feel, Pore Visibility, After Cleansing, aur
  Moisturizer Feel. (Note: Q2 jaan-boojh kar "breakout frequency" nahi hai —
  acne alag se YOLO11m detect karta hai, is liye pore visibility ek zyada
  independent signal hai)
- Har option ka apna weight hai (2 points), aur teen possible outcomes:
  1. **Match** → "✓ Quiz confirms it"
  2. **Clear disagreement** (scan aur quiz alag result den, koi tie nahi)
     → user do options mein se choose karta hai
  3. **Tie** (jaise Normal aur Oily dono 4-4 points le lein) → app khud
     koi decision nahi leti, saaf batati hai "quiz tied between X and Y",
     aur scan result + tied types — sab candidates buttons ke tor par
     dikhati hai, user final choice karta hai

  Jo bhi final choice ho, wahi `confirmedSkinType` ban jata hai, jo aage
  severity/routine/database mein use hota hai — na ke seedha
  `skinResult.topClass` ya koi silent tie-break

**Zaroori (viva ke liye):** ye quiz koi clinical/validated instrument nahi
hai — ye generic self-report questions hain jo is project ke liye likhe
gaye hain, taake borderline CNN predictions ke liye ek dusra (weak) signal
mil sake. Ye replace nahi karta CNN ko, sirf ek confirmation/tie-breaker
step hai. Tie ka case bhi jaan-boojh kar system se silently resolve nahi
karaya gaya — ye is project ke "opaque decisions avoid karna" wale
principle se directly consistent hai.

## 🧑 Face-check + skin-tone check (double gate before analysis)

`lib/faceCheck.ts` ek **real, pretrained face-detection ONNX model**
(Ultra-Light-Fast-Generic-Face-Detector-1MB, "RFB-320" variant — MIT licensed,
~1.2MB) use karta hai jo CNN chalane se **pehle** check karta hai ke tasveer
mein koi face hai ya nahi:

- Photo ko 320×240 mein resize kar ke model ko diya jata hai
- Model **4420 candidate face-boxes + confidence scores** return karta hai
- Jo boxes 70% se zyada confident hain unhe rakha jata hai, phir duplicate/
  overlapping boxes ko **non-max suppression (NMS)** se hataya jata hai
- Agar koi box bach jaye → face maan liya jata hai; warna nahi

**Ek real bug mila testing mein (aur fix kiya gaya):** Ye shape-based detector
generic hai — kisi bhi **face-jaisi geometry** par trigger ho sakta hai,
insani face na ho tab bhi. Test kiya: ek **monkey (primate) photo** par
detector ne **99.8% confidence** di — itni high ke koi bhi reasonable
confidence-threshold isay reject nahi kar sakta. Iska hal **threshold
barhana nahi**, balke ek **poori tarah independent doosra signal** add
karna tha:

**`lib/skinToneCheck.ts`** — classic, published **Kovac, Peer & Solina
(2003)** RGB skin-colour rule (EUROCON 2003, "Human Skin Colour Clustering
for Face Detection") — face-box ke pixels ka color check karta hai:

```
Rule 1 (daylight): R>95, G>40, B>20, max-min>15, |R-G|>15, R>G, R>B
Rule 2 (flash/lateral): R>220, G>210, B>170, |R-G|<=15, B<R, B<G
```

**Empirically verified** (guess nahi):
- Monkey-face photo: sirf **12% pixels** skin-color classify hue
- Real human face photos (2 alag test images): **52% aur 86%** pixels
- Threshold **25%** rakha gaya hai — dono cases ko clearly separate karta hai

Ab **do independent signals** combine hote hain: **SHAPE** (face detector) +
**COLOR** (Kovac rule) — dono pass hone chahiye tabhi scan aage badhta hai.
Agar shape pass ho lekin color fail ho jaye, to app **"This doesn't look
like human skin"** dikhata hai — alag message "This isn't a face" se, taake
user ko sahi guidance mile.

**Bonus signal — skin-type classifier ka apna "confusion":** Is monkey photo
par skin-type CNN (Dry/Normal/Oily) bhi confused tha (Normal 49% vs Oily
51%, bilkul coin-flip). `ResultPanel.tsx` mein ab agar top-2 classes ke
beech gap **15 percentage points se kam** ho, to ek warning dikhti hai —
ye bhi koi naya model nahi, sirf existing classifier ke output ko behtar
istemal karna hai.

**Purana approach vs naya approach (poori history, viva ke liye):**
- **Shuru mein**: skin-tone color ka ek simple heuristic tha (YCbCr) —
  fast lekin easily fooled (hath, skin-colored objects)
- **Phir**: sirf real trained face-detection model (RFB-320) — bohat
  behtar shape-detection, lekin color ko poori tarah ignore karta tha
- **Ab**: **dono combine** — shape (RFB-320) + color (Kovac rule,
  published/citable) + skin-classifier confusion-check — teenon
  independent signals hain, ek dusre ki galti cover karte hain

Source/credit: https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB
(model file: `backend/models/face_detector.onnx`)

---

## 🚀 Production build (deploy karne ke liye)

```bash
npm run build
npm run start
```

Ye optimized frontend build banayega. Production scans ke liye FastAPI ko
separately run/deploy karein, `SKINWISE_API_URL` ko Next.js server par set
karein, aur FastAPI ko private network par rakhein.

---

## ❓ Common Issues

**"Camera access denied" aa raha hai:**
Browser settings mein site ke liye camera permission allow karein. HTTPS ya
`localhost` par hi camera kaam karta hai — plain IP address (e.g. `192.168.x.x`)
par kaam nahi karega jab tak HTTPS na ho.

**AI service unavailable dikha raha hai:**
FastAPI terminal mein model startup complete hone dein, `http://127.0.0.1:8000/health`
check karein, and confirm `SKINWISE_API_URL` points to that service.

**Weather card "location declined" dikha raha hai:**
Browser settings mein site ke liye location permission allow karein. Agar decline
kar dein to bhi app kaam karta hai — bas routine mein weather adjustment nahi hoga.

**Git mein commit karte waqt:**
`acne_detector.onnx` (~45MB) kaafi badi file hai. Agar aap is project ko GitHub
par push karna chahte hain, to [Git LFS](https://git-lfs.com) use karna behtar
rahega taake repo size control mein rahe:
```bash
git lfs install
git lfs track "*.onnx"
```
