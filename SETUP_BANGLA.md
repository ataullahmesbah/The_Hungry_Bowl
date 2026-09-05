# The Hungry Bowl — সেটআপ গাইড (বাংলা + English)

এই ফাইলে দুইটা জিনিস আছে, যেটা আপনি চেয়েছিলেন:

1. **`.env` ফাইলে কী কী লিখতে হবে** — প্রতিটা লাইন কী, কোথা থেকে পাবেন
2. **টার্মিনালে কোন কোন কমান্ড চালাতে হবে** — ধাপে ধাপে

---

## অংশ ১ — যা যা লাগবে (Prerequisites)

| জিনিস | কেন লাগবে | কোথায় পাবেন |
|---|---|---|
| **Node.js 20 বা তার উপরে** | প্রজেক্ট চালাতে | https://nodejs.org (LTS ভার্সন) |
| **PostgreSQL ডাটাবেজ** | সব ডেটা এখানে জমা হবে | Neon (ফ্রি) / Supabase / নিজের VPS |
| **Cloudinary অ্যাকাউন্ট** | ছবি–ভিডিও রাখার জন্য | https://cloudinary.com (ফ্রি প্ল্যান যথেষ্ট) |

চেক করুন Node ঠিক আছে কিনা:

```bash
node -v      # v20.x বা তার বেশি দেখাতে হবে
npm -v
```

---

## অংশ ২ — `.env` ফাইলে কী কী লিখবেন

প্রজেক্ট ফোল্ডারে `.env.example` নামে একটা ফাইল আছে। ওটা কপি করে `.env` নামে
সেভ করুন:

```bash
cp .env.example .env
```

এখন `.env` ফাইলটা খুলে নিচের মানগুলো বসান।

### ২.১ অবশ্যই লাগবে (Required — এগুলো ছাড়া অ্যাপ চলবে না)

```env
DATABASE_URL="postgresql://user:password@host:5432/hungry_bowl?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/hungry_bowl?sslmode=require"
AUTH_SECRET="এখানে-লম্বা-র‍্যান্ডম-স্ট্রিং-কমপক্ষে-৩২-অক্ষর"
APP_URL="https://your-domain.com"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

| ভেরিয়েবল | ব্যাখ্যা |
|---|---|
| `DATABASE_URL` | অ্যাপ চলার সময় যে কানেকশন ব্যবহার হবে। **Vercel-এ দিলে অবশ্যই pooled URL** দেবেন (Neon/Supabase-এর ড্যাশবোর্ডে "Pooled connection" লেখা থাকে)। কারণ serverless-এ অনেক function একসাথে চালু হয়, direct connection হলে ডাটাবেজের connection limit শেষ হয়ে যাবে। |
| `DIRECT_URL` | শুধু `prisma migrate` চালানোর সময় লাগে (pooler দিয়ে migration চলে না)। নিজের VPS-এ PostgreSQL হলে এটা `DATABASE_URL`-এর মতোই হবে — একই লাইন দুইবার লিখবেন। |
| `AUTH_SECRET` | সেশন সাইন করার গোপন চাবি। **কমপক্ষে ৩২ অক্ষর।** নিচের কমান্ড দিয়ে বানান: `openssl rand -base64 48` |
| `APP_URL` | সাইটের পূর্ণ ঠিকানা, শেষে `/` দেবেন না। লোকালে: `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | ব্রাউজারের কোডেও এটা লাগে, তাই আলাদা করে একই মান লিখতে হয়। |

> ⚠️ `AUTH_SECRET` পরে বদলালে সবাই লগআউট হয়ে যাবে। একবার সেট করে রেখে দিন।

### ২.২ Cloudinary (ছবি আপলোড)

```env
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="123456789012345"
CLOUDINARY_API_SECRET="abcdefg..."
CLOUDINARY_ROOT_FOLDER="the-hungry-bowl"
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloud-name"
```

কোথায় পাবেন: cloudinary.com-এ লগইন → **Dashboard** → উপরে Cloud name, API Key,
API Secret তিনটাই একসাথে দেখাবে।

- `CLOUDINARY_API_SECRET` **কখনো** `NEXT_PUBLIC_` দিয়ে লিখবেন না — তাহলে সেটা
  ব্রাউজারে চলে যাবে। সার্ভার নিজে সাইন করে দেয়, ব্রাউজার শুধু সাইন করা
  আপলোড পাঠায়।
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` শুধু cloud name — এটা গোপন কিছু না।

### ২.৩ রিয়েলটাইম (কিচেন স্ক্রিন লাইভ আপডেট)

```env
REALTIME_DRIVER="poll"
REALTIME_POLL_MS="5000"
```

| মান | কখন ব্যবহার করবেন |
|---|---|
| `poll` | **Vercel-এ এটাই দেবেন।** সব জায়গায় কাজ করে। |
| `sse` | শুধু নিজের VPS/Docker-এ, যেখানে সার্ভার সবসময় চালু থাকে। |

`REALTIME_POLL_MS` = কত মিলিসেকেন্ড পর পর নতুন ইভেন্ট খুঁজবে। ৫০০০ = ৫ সেকেন্ড।
ব্যস্ত রেস্টুরেন্টে `3000` দিতে পারেন (ডাটাবেজে একটু বেশি চাপ পড়বে)।

### ২.৪ সেশন ও সিকিউরিটি

```env
SESSION_MAX_AGE_DAYS="7"
RATE_LIMIT_ENABLED="true"
```

- `SESSION_MAX_AGE_DAYS` — কত দিন পর স্টাফকে আবার লগইন করতে হবে।
- `RATE_LIMIT_ENABLED` — `true` রাখুন। এটা বন্ধ করলে কেউ পাসওয়ার্ড brute-force
  করার সুযোগ পাবে।

### ২.৫ প্রথমবারের মালিক অ্যাকাউন্ট (Seed)

```env
SEED_OWNER_EMAIL="owner@yourdomain.com"
SEED_OWNER_PASSWORD="খুব-শক্ত-একটা-পাসওয়ার্ড#2026"
SEED_OWNER_NAME="Restaurant Owner"
```

এটা শুধু **একবার**, `npm run db:seed` চালানোর সময় ব্যবহার হয়। প্রথম লগইনের পর
ড্যাশবোর্ড থেকে পাসওয়ার্ড বদলে ফেলুন, তারপর এই তিনটা লাইন `.env` থেকে মুছে
দিতে পারেন।

### ২.৬ ঐচ্ছিক (Optional)

```env
# BUILD_STANDALONE="true"     # শুধু Docker/VPS বিল্ডের জন্য
```

---

## অংশ ৩ — টার্মিনালে যে কমান্ডগুলো চালাবেন

### ৩.১ লোকালি প্রথমবার চালানো

```bash
# ১) ফোল্ডারে ঢুকুন
cd the-hungry-bowl

# ২) সব প্যাকেজ ইনস্টল
npm install

# ৩) .env বানান আর উপরের মানগুলো বসান
cp .env.example .env

# ৪) AUTH_SECRET বানিয়ে .env-এ বসান
openssl rand -base64 48

# ৫) ডাটাবেজে টেবিল বানান
npm run db:deploy

# ৬) রোল, পারমিশন, সেটিংস আর মালিক অ্যাকাউন্ট ঢোকান
npm run db:seed

# ৭) সার্ভার চালু
npm run dev
```

ব্রাউজারে খুলুন **http://localhost:3000** — ওয়েবসাইট দেখা যাবে।
স্টাফ লগইন: **http://localhost:3000/login**

> ধাপ ৫ আর ৬ একসাথে করতে চাইলে: `npm run setup`

### ৩.২ প্রোডাকশনে চালানো (নিজের সার্ভারে)

```bash
npm ci                 # লক-ফাইল ধরে ঠিক একই ভার্সন ইনস্টল
npm run db:deploy      # migration চালান
npm run build          # প্রোডাকশন বিল্ড
npm start              # সার্ভার চালু (ডিফল্ট পোর্ট 3000)
```

### ৩.৩ দরকারি অন্যান্য কমান্ড

| কমান্ড | কাজ |
|---|---|
| `npm run typecheck` | কোডে টাইপ এরর আছে কিনা দেখে |
| `npm run db:studio` | ব্রাউজারে ডাটাবেজের ডেটা দেখা/এডিট করা |
| `npm run db:migrate` | নতুন migration বানানো (শুধু ডেভেলপমেন্টে) |
| `npm run db:generate` | Prisma client আবার তৈরি করা |

---

## অংশ ৪ — Vercel-এ ডিপ্লয় (সংক্ষেপে)

1. কোড GitHub-এ পুশ করুন।
2. vercel.com → **Add New → Project** → রিপো সিলেক্ট করুন।
3. **Settings → Environment Variables**-এ `.env`-এর সব লাইন পেস্ট করুন
   (`APP_URL` আর `NEXT_PUBLIC_APP_URL`-এ Vercel-এর দেওয়া ডোমেইন দিন)।
   `REALTIME_DRIVER` অবশ্যই `poll` রাখবেন।
4. Deploy চাপুন।
5. প্রথম ডিপ্লয়ের পর **একবার** নিজের কম্পিউটার থেকে চালান:

   ```bash
   npm run db:deploy
   npm run db:seed
   ```

   (`.env`-এ প্রোডাকশনের `DATABASE_URL`/`DIRECT_URL` বসিয়ে নিয়ে।)

বিস্তারিত — VPS, Docker, Nginx, ব্যাকআপ সহ — আছে [`DEPLOYMENT.md`](./DEPLOYMENT.md) ফাইলে।

---

## অংশ ৫ — লগইনের পর প্রথমে যা করবেন

ধাপে ধাপে, ড্যাশবোর্ড থেকেই — **কোডে হাত দিতে হবে না**:

1. **Account → Password** — সিড পাসওয়ার্ড বদলান।
2. **Settings → Restaurant** — নাম, ঠিকানা, ফোন, **country / currency /
   timezone / tax** ঠিক করুন। (দেশের বাইরে বিক্রি করলে এখানেই সব বদলাবে।)
3. **Payments → Methods** — যেগুলো লাগবে না (যেমন দেশের বাইরে bKash/Nagad)
   বন্ধ করে দিন, নতুন মেথড যোগ করুন।
4. **Users** — স্টাফ অ্যাকাউন্ট খুলুন, রোল দিন।
5. **Tables** — ফ্লোর/এরিয়া আর টেবিল সাজান।
6. **Menu** — ক্যাটাগরি, আইটেম, ভ্যারিয়েন্ট, অ্যাড-অন, দাম।
7. **Inventory → Warehouses** ও আইটেম, তারপর **Recipes** — তাহলে অর্ডার শেষ
   হলে স্টক নিজে থেকেই কমবে আর ফুড কস্ট বের হবে।
8. **Website** — হোমপেজের সেকশন, অফার, ইভেন্ট, গ্যালারি, পেজ।
9. **SEO** — টাইটেল, ডেসক্রিপশন, OG ছবি, অ্যানালিটিক্স আইডি।

---

## অংশ ৬ — সমস্যা হলে

| সমস্যা | কারণ ও সমাধান |
|---|---|
| `Environment variable not found: DATABASE_URL` | `.env` ফাইল নাই বা ভুল ফোল্ডারে। প্রজেক্টের রুটে থাকতে হবে। |
| `AUTH_SECRET must be at least 32 characters` | ছোট সিক্রেট দিয়েছেন। `openssl rand -base64 48` দিয়ে নতুন বানান। |
| `Can't reach database server` | `DATABASE_URL` ভুল, অথবা ডাটাবেজে আপনার IP allow করা নাই। |
| Migration আটকে যাচ্ছে | `DIRECT_URL`-এ pooled URL দিয়েছেন। non-pooled (direct) URL দিন। |
| ছবি আপলোড হচ্ছে না | Cloudinary-র তিনটা মানই ঠিক আছে কিনা দেখুন; `CLOUDINARY_API_SECRET` অবশ্যই সার্ভার-সাইড ভেরিয়েবল। |
| কিচেন স্ক্রিন আপডেট হচ্ছে না | Vercel-এ `REALTIME_DRIVER=sse` দিয়েছেন। `poll` করে দিন। |
| লগইনের পর "No access" | ইউজারের রোলে দরকারি পারমিশন নাই। **Users → Roles** থেকে দিন। |
