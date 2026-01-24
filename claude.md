# Packing Planner - Web Aplikacija za Načrtovanje Pakiranja

## 🎯 PREGLED PROJEKTA

### Namen aplikacije
Spletna aplikacija za vizualno načrtovanje pakiranja opreme na prevozna sredstva (motor, kolo, nahrbtnik). Uporabniki ustvarjajo virtualne torbe na podlagi (slika vozila), dodajajo artikle in spremljajo težo ter porazdelitev.

### Tehnološki Stack
- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Drag & Drop**: dnd-kit + react-rnd
- **Plačila**: Stripe (+ Stripe Sync Engine)
- **Hosting**: Vercel
- **Storage**: Supabase Storage (za slike podlag)

### Ključne funkcionalnosti MVP
1. ✅ Prijava/registracija uporabnikov (Supabase Auth)
2. ✅ Izbira predloge podlage (motor, kolo, nahrbtnik)
3. ✅ Vizualno ustvarjanje torb (drag kvadrat na podlagi)
4. ✅ Spreminjanje velikosti, barve in imena torb
5. ✅ Dodajanje artiklov v torbe (ime, opis, teža)
6. ✅ Izračun skupne teže (torba + artikli)
7. ✅ Zaklepanje torb (preprečitev premikanja)
8. ✅ Shranjevanje v Supabase
9. ✅ Stripe integracija za članstvo
10. ✅ Izvoz v PDF/CSV

---

## 📊 PODATKOVNA STRUKTURA

### Database Schema (PostgreSQL/Supabase)

```sql
-- =====================================================
-- USERS (razširitev Supabase Auth)
-- =====================================================
-- Supabase Auth ustvari 'auth.users' tabelo
-- Dodamo public.profiles za dodatne podatke

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'user', -- 'user', 'admin'
  is_active BOOLEAN DEFAULT true,
  stripe_customer_id TEXT,
  trial_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- BACKGROUNDS (predloge podlag)
-- =====================================================
CREATE TABLE backgrounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL za globalne predloge
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'motorcycle', 'bicycle', 'backpack', 'custom'
  image_url TEXT NOT NULL, -- URL v Supabase Storage
  width INTEGER NOT NULL, -- širina slike v px
  height INTEGER NOT NULL, -- višina slike v px
  is_public BOOLEAN DEFAULT false, -- true za globalne predloge
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- BAGS (torbe na podlagi)
-- =====================================================
CREATE TABLE bags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  background_id UUID NOT NULL REFERENCES backgrounds(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Bag',
  color TEXT NOT NULL DEFAULT '#3B82F6', -- HEX barva
  x NUMERIC(5,2) NOT NULL, -- pozicija X v % (0-100)
  y NUMERIC(5,2) NOT NULL, -- pozicija Y v % (0-100)
  width NUMERIC(5,2) NOT NULL, -- širina v % (0-100)
  height NUMERIC(5,2) NOT NULL, -- višina v % (0-100)
  bag_weight NUMERIC(10,2) DEFAULT 0, -- teža prazne torbe (kg)
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ITEMS (artikli v torbah)
-- =====================================================
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bag_id UUID NOT NULL REFERENCES bags(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC(10,2) NOT NULL, -- teža v kg
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SUBSCRIPTIONS (članstvo)
-- =====================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL, -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_bags_user_id ON bags(user_id);
CREATE INDEX idx_bags_background_id ON bags(background_id);
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_bag_id ON items(bag_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bags_updated_at
  BEFORE UPDATE ON bags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE backgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- BACKGROUNDS
CREATE POLICY "Anyone can view public backgrounds"
  ON backgrounds FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can create own backgrounds"
  ON backgrounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backgrounds"
  ON backgrounds FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own backgrounds"
  ON backgrounds FOR DELETE
  USING (auth.uid() = user_id);

-- BAGS
CREATE POLICY "Users can view own bags"
  ON bags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bags"
  ON bags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bags"
  ON bags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bags"
  ON bags FOR DELETE
  USING (auth.uid() = user_id);

-- ITEMS
CREATE POLICY "Users can view own items"
  ON items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own items"
  ON items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON items FOR DELETE
  USING (auth.uid() = user_id);

-- SUBSCRIPTIONS
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Funkcija za izračun skupne teže torbe
CREATE OR REPLACE FUNCTION get_bag_total_weight(p_bag_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_bag_weight NUMERIC;
  v_items_weight NUMERIC;
BEGIN
  -- Dobi težo torbe
  SELECT bag_weight INTO v_bag_weight
  FROM bags
  WHERE id = p_bag_id;
  
  -- Seštej težo vseh artiklov
  SELECT COALESCE(SUM(weight), 0) INTO v_items_weight
  FROM items
  WHERE bag_id = p_bag_id;
  
  RETURN COALESCE(v_bag_weight, 0) + v_items_weight;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funkcija za statistiko uporabnika
CREATE OR REPLACE FUNCTION get_user_packing_stats(p_user_id UUID)
RETURNS TABLE (
  total_bags BIGINT,
  total_items BIGINT,
  total_weight NUMERIC,
  backgrounds_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM bags WHERE user_id = p_user_id),
    (SELECT COUNT(*) FROM items WHERE user_id = p_user_id),
    (SELECT COALESCE(SUM(get_bag_total_weight(id)), 0) FROM bags WHERE user_id = p_user_id),
    (SELECT COUNT(*) FROM backgrounds WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funkcija za preverjanje aktivne naročnine
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_subscription BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end > NOW()
  ) INTO v_has_subscription;
  
  RETURN v_has_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🏗️ ARHITEKTURA APLIKACIJE

### Struktura Projekta

```
packing-planner/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Izbira podlage
│   │   ├── planner/
│   │   │   └── [backgroundId]/
│   │   │       └── page.tsx          # Glavni canvas
│   │   └── settings/
│   │       └── page.tsx              # Uporabniške nastavitve
│   ├── api/
│   │   ├── backgrounds/
│   │   │   ├── route.ts              # GET, POST backgrounds
│   │   │   └── [id]/route.ts         # GET, PATCH, DELETE
│   │   ├── bags/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── items/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── stripe/
│   │   │   ├── create-checkout/route.ts
│   │   │   ├── webhook/route.ts
│   │   │   └── portal/route.ts
│   │   └── export/
│   │       ├── pdf/route.ts
│   │       └── csv/route.ts
│   ├── layout.tsx
│   ├── page.tsx                      # Landing page
│   └── globals.css
├── components/
│   ├── canvas/
│   │   ├── PlannerCanvas.tsx         # Glavni canvas z podlago
│   │   ├── DraggableBag.tsx          # Torba komponenta
│   │   └── BackgroundImage.tsx       # Podlaga
│   ├── modals/
│   │   ├── AddBagModal.tsx
│   │   ├── EditBagModal.tsx
│   │   ├── AddItemModal.tsx
│   │   └── SubscriptionModal.tsx
│   ├── ui/                           # shadcn/ui komponente
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   └── ...
│   ├── BagsList.tsx                  # Seznam torb (sidebar)
│   ├── ItemsList.tsx                 # Seznam artiklov
│   ├── WeightIndicator.tsx           # Prikaz teže
│   ├── Header.tsx
│   └── Sidebar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Client-side client
│   │   ├── server.ts                 # Server-side client
│   │   └── types.ts                  # Generated types
│   ├── stripe/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── utils/
│   │   ├── calculations.ts           # Izračuni teže, balansa
│   │   ├── export.ts                 # PDF/CSV export
│   │   └── validators.ts             # Validacije
│   └── hooks/
│       ├── useAuth.ts
│       ├── useBags.ts
│       ├── useItems.ts
│       └── useSubscription.ts
├── types/
│   └── index.ts                      # TypeScript types
├── public/
│   ├── backgrounds/                  # Predloge podlag
│   │   ├── motorcycle.png
│   │   ├── bicycle.png
│   │   └── backpack.png
│   └── icons/
├── .env.local
├── .env.example
├── middleware.ts                     # Auth middleware
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 🎨 UI/UX SPECIFIKACIJE

### Glavne strani

#### 1. Landing Page (/)
- Hero sekcija z vizualnim primerom
- Features (vizualno ustvarjanje, teža, izvoz)
- Pricing (Free trial, Yearly subscription)
- CTA gumbi (Sign Up, Login)

#### 2. Login/Signup (/login, /signup)
- Email + Password
- Google OAuth (opcijsko)
- "Forgot password" link
- Redirect na dashboard po prijavi

#### 3. Dashboard (/dashboard)
- Grid predlog podlag (motor, kolo, nahrbtnik)
- "Upload Custom Background" gumb
- Zadnji projekti (recent backgrounds)
- User stats (število torb, artiklov, skupna teža)

#### 4. Planner Canvas (/planner/[backgroundId])
**Layout:**
```
┌─────────────────────────────────────────────┐
│ Header (Logo, User Menu, Save, Export)     │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ Sidebar  │     Canvas (Background Image)    │
│          │                                  │
│ - Bags   │     [Draggable Bags zde]        │
│ - Items  │                                  │
│ - Weight │                                  │
│          │                                  │
│ [+Bag]   │                                  │
│ [+Item]  │                                  │
└──────────┴──────────────────────────────────┘
```

**Canvas funkcionalnosti:**
- Podlaga (slika) kot ozadje
- Drag & drop za ustvarjanje novih torb (klikni in povleci kvadrat)
- Resize handles na vogalih torb (react-rnd)
- Drag torb po podlagi (dnd-kit)
- Click na torbo → odpre EditBagModal
- Lock ikona na torbi (onemogoči drag/resize)
- Barve torb vidne na canvas-u
- Prikaz teže na vsaki torbi

**Sidebar:**
- Seznam vseh torb (ime, barva, teža)
- Seznam artiklov v izbrani torbi
- Weight indicator (leva/desna stran)
- Gumbi: "+ Add Bag", "+ Add Item"

#### 5. Settings (/settings)
- Email, Role (display only)
- Subscription status
- "Manage Subscription" (Stripe Customer Portal)
- Danger zone (Delete account)

---

## 🔐 VARNOST IN AVTENTIKACIJA

### Supabase Auth Setup
1. Email/Password authentication
2. Google OAuth (opcijsko)
3. Email confirmation
4. Password reset flow

### RLS Pravila
- Vsak uporabnik vidi samo svoje podatke
- Public backgrounds so vidni vsem
- Admin ima dostop do vseh tabel (za statistiko)

### Middleware Protection
```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  
  const { data: { session } } = await supabase.auth.getSession()
  
  // Zaščiti /dashboard in /planner routes
  if (req.nextUrl.pathname.startsWith('/dashboard') || 
      req.nextUrl.pathname.startsWith('/planner')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    
    // Preveri subscription za premium features
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', session.user.id)
      .single()
    
    if (!subscription || subscription.status !== 'active') {
      // Allow limited access (npr. 1 background, 3 bags)
      // Ali redirect na subscription page
    }
  }
  
  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/planner/:path*', '/settings/:path*'],
}
```

---

## 💳 STRIPE INTEGRACIJA

### Setup
1. Ustvari Stripe account
2. Ustvari produkt "Yearly Subscription" (€29.99/leto)
3. Nastavi Stripe Sync Engine v Supabase
4. Ustvari webhook endpoint za events

### Workflow
```
User → Click "Subscribe" 
     → Create Stripe Checkout Session 
     → Redirect to Stripe 
     → Payment success 
     → Webhook → Update subscriptions table 
     → Redirect back to app 
     → Access unlocked
```

### Webhook Events
- `checkout.session.completed` → Create subscription
- `customer.subscription.updated` → Update status
- `customer.subscription.deleted` → Cancel subscription
- `invoice.payment_failed` → Mark as past_due

### API Endpoints
```typescript
// app/api/stripe/create-checkout/route.ts
POST /api/stripe/create-checkout
Body: { priceId: string }
Returns: { sessionId: string, url: string }

// app/api/stripe/webhook/route.ts
POST /api/stripe/webhook
Headers: stripe-signature
Body: Stripe event
Returns: { received: true }

// app/api/stripe/portal/route.ts
GET /api/stripe/portal
Returns: { url: string } // Customer Portal URL
```

---

## 🎨 CANVAS IMPLEMENTACIJA

### Tehnologije
- **dnd-kit**: Drag & drop torb
- **react-rnd**: Resize torb
- **react-zoom-pan-pinch**: Zoom/pan na mobilnih

### Bag Creation Flow
```typescript
// 1. User clicks "Add Bag" button
// 2. Canvas enters "drawing mode"
// 3. User clicks and drags to create rectangle
// 4. On mouse up → show AddBagModal
// 5. User enters name, color, bag weight
// 6. Save to Supabase
// 7. Render bag on canvas
```

### Bag Component
```typescript
interface BagProps {
  id: string;
  name: string;
  color: string;
  x: number;        // percentage (0-100)
  y: number;        // percentage (0-100)
  width: number;    // percentage (0-100)
  height: number;   // percentage (0-100)
  bagWeight: number;
  items: Item[];
  locked: boolean;
  onUpdate: (updates: Partial<Bag>) => void;
  onDelete: () => void;
}

// Bag se prikaže kot:
// - Bordered rectangle z barvo
// - Label z imenom
// - Teža (bag + items) v kotu
// - Lock ikona če je zaklenjen
// - Resize handles če ni zaklenjen
```

### Koordinatni Sistem
- Vse pozicije in velikosti v **odstotkih** (0-100%)
- Omogoča responsive canvas (različne velikosti zaslonov)
- Conversion: `pixelX = (percentX / 100) * canvasWidth`

### Collision Detection
- Opozorilo če se torbe prekrivajo (ni blocker)
- Vizualni feedback (rdeč border)

---

## 📤 IZVOZ PODATKOV

### PDF Export
**Vsebina:**
1. Slika podlage z označenimi torbami
2. Tabela torb (ime, barva, pozicija, teža)
3. Za vsako torbo: seznam artiklov
4. Skupna teža
5. Weight distribution (leva/desna)

**Implementacija:**
```typescript
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

async function exportToPDF(backgroundId: string) {
  // 1. Render canvas to image
  const canvas = await html2canvas(canvasRef.current);
  const imgData = canvas.toDataURL('image/png');
  
  // 2. Create PDF
  const pdf = new jsPDF('landscape', 'mm', 'a4');
  
  // 3. Add image
  pdf.addImage(imgData, 'PNG', 10, 10, 277, 190);
  
  // 4. Add tables (bags, items)
  pdf.setFontSize(12);
  pdf.text('Bags Overview', 10, 210);
  // ... add table data
  
  // 5. Download
  pdf.save(`packing-plan-${backgroundId}.pdf`);
}
```

### CSV Export
**Format:**
```csv
Bag Name,Color,X,Y,Width,Height,Bag Weight,Items Weight,Total Weight
Left Pannier,#3B82F6,10,50,20,30,2.5,8.3,10.8

Item Name,Description,Weight,Bag
Tent,2-person tent,3.2,Left Pannier
Sleeping Bag,,2.1,Left Pannier
```

---

## 📱 MOBILNA PODPORA

### Responsive Design
- Canvas se prilagodi velikosti zaslona
- Sidebar collapsible na mobilnih
- Touch events za drag/resize
- Pinch to zoom (react-zoom-pan-pinch)

### Touch Optimizacije
- Večji hit areas za resize handles
- Prevent scroll med drag-om
- Long press za edit modal
- Swipe gestures za sidebar

---

## 🚀 RAZVOJNI PLAN

### Faza 1: Setup & Auth (Teden 1)
**Dan 1-2: Projekt setup**
- [ ] Next.js projekt
- [ ] Supabase projekt
- [ ] Database schema
- [ ] Auth setup

**Dan 3-4: Basic UI**
- [ ] Landing page
- [ ] Login/Signup
- [ ] Dashboard layout
- [ ] Header/Sidebar komponente

**Dan 5-7: Auth flow**
- [ ] Email/password auth
- [ ] Protected routes (middleware)
- [ ] User profile
- [ ] Logout

---

### Faza 2: Canvas & Bags (Teden 2)
**Dan 8-10: Canvas setup**
- [ ] PlannerCanvas komponenta
- [ ] BackgroundImage (prikaži sliko)
- [ ] Zoom/pan (react-zoom-pan-pinch)
- [ ] Grid overlay (opcijsko)

**Dan 11-14: Bag creation**
- [ ] Drawing mode (click & drag)
- [ ] DraggableBag komponenta (dnd-kit + react-rnd)
- [ ] AddBagModal (ime, barva, teža)
- [ ] Save bag to Supabase
- [ ] Edit/Delete bag

---

### Faza 3: Items & Calculations (Teden 3)
**Dan 15-17: Items CRUD**
- [ ] AddItemModal (ime, opis, teža, izbira torbe)
- [ ] ItemsList komponenta
- [ ] Drag items med torbami (dnd-kit)
- [ ] Edit/Delete item

**Dan 18-21: Calculations**
- [ ] Izračun skupne teže torbe
- [ ] WeightIndicator komponenta
- [ ] Left/Right balance calculation
- [ ] Visual feedback (color coding)

---

### Faza 4: Stripe & Subscriptions (Teden 4)
**Dan 22-24: Stripe setup**
- [ ] Stripe account + produkt
- [ ] Stripe Sync Engine v Supabase
- [ ] Create checkout session endpoint
- [ ] Webhook endpoint
- [ ] Subscriptions tabela

**Dan 25-28: Subscription flow**
- [ ] SubscriptionModal komponenta
- [ ] Redirect to Stripe Checkout
- [ ] Handle webhook events
- [ ] Check subscription status (middleware)
- [ ] Customer Portal link

---

### Faza 5: Export & Polish (Teden 5)
**Dan 29-31: Export features**
- [ ] PDF export (jspdf)
- [ ] CSV export
- [ ] Print functionality
- [ ] Share link (opcijsko)

**Dan 32-35: Polish & Testing**
- [ ] Mobile responsive fixes
- [ ] Touch optimizations
- [ ] Loading states
- [ ] Error handling
- [ ] Testing (manual + automated)
- [ ] Performance optimization

---

### Faza 6: Deployment (Teden 6)
**Dan 36-37: Production setup**
- [ ] Vercel deployment
- [ ] Environment variables
- [ ] Domain setup
- [ ] SSL

**Dan 38-40: Launch**
- [ ] Final testing
- [ ] Documentation
- [ ] Launch! 🚀

---

## 📦 DEPENDENCIES

### package.json
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    
    "@supabase/supabase-js": "^2.38.0",
    "@supabase/auth-helpers-nextjs": "^0.8.0",
    
    "stripe": "^14.0.0",
    "@stripe/stripe-js": "^2.0.0",
    
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^7.0.0",
    "@dnd-kit/utilities": "^3.2.0",
    "react-rnd": "^10.4.0",
    "react-zoom-pan-pinch": "^3.3.0",
    
    "jspdf": "^2.5.0",
    "html2canvas": "^1.4.0",
    "react-color": "^2.19.0",
    
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "lucide-react": "^0.300.0",
    
    "date-fns": "^3.0.0",
    "nanoid": "^5.0.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 🎯 PRIORITIZACIJA

### Must Have (P0) - MVP
- ✅ Auth (email/password)
- ✅ Predloge podlag (3 default)
- ✅ Ustvarjanje torb (drag kvadrat)
- ✅ Resize & premikanje torb
- ✅ Dodajanje artiklov
- ✅ Izračun teže
- ✅ Stripe subscription
- ✅ PDF export

### Should Have (P1) - Post-MVP
- Upload custom background
- CSV export
- Weight balance indicator
- Share public link
- Mobile app (PWA)

### Nice to Have (P2) - V2
- Google OAuth
- Multi-user collaboration
- Template library
- Advanced statistics
- Dark mode
- Multi-language

---

## 🔧 ENVIRONMENT VARIABLES

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-key
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
STRIPE_PRICE_ID=price_your-price-id

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## 📚 DODATNI RESOURCES

### Dokumentacija
- **Next.js**: https://nextjs.org/docs
- **Supabase**: https://supabase.com/docs
- **dnd-kit**: https://docs.dndkit.com
- **react-rnd**: https://github.com/bokuweb/react-rnd
- **Stripe**: https://stripe.com/docs/api
- **Tailwind CSS**: https://tailwindcss.com/docs

### Primeri kode
- **Supabase Auth Next.js**: https://github.com/supabase/auth-helpers
- **Stripe Subscriptions**: https://github.com/vercel/nextjs-subscription-payments
- **dnd-kit Examples**: https://master--5fc05e08a4a65d0021ae0bf2.chromatic.com

---

## 🐛 TROUBLESHOOTING

### Pogosti problemi

**1. RLS blokira queries**
```sql
-- Preveri RLS politike
SELECT * FROM pg_policies WHERE tablename = 'bags';

-- Temporary disable za debugging (NE V PRODUKCIJI!)
ALTER TABLE bags DISABLE ROW LEVEL SECURITY;
```

**2. Drag & drop ne deluje na mobilnih**
```typescript
// Dodaj touch-action CSS
.draggable-bag {
  touch-action: none;
}
```

**3. Canvas zoom povzroča scroll issues**
```typescript
// Prevent default scroll behavior
<TransformWrapper
  panning={{ disabled: false }}
  wheel={{ disabled: false }}
  doubleClick={{ disabled: true }}
  onPanningStart={(e) => e.event?.preventDefault()}
>
```

**4. Stripe webhook signature fail**
```typescript
// Preveri Stripe CLI forwarding
stripe listen --forward-to localhost:3000/api/stripe/webhook

// Preveri raw body v Next.js
export const config = {
  api: {
    bodyParser: false, // POMEMBNO za webhook signature
  },
}
```

**5. Supabase Storage CORS errors**
```sql
-- Nastavi CORS v Supabase Storage bucket
-- Dashboard → Storage → [bucket] → Policies
-- Allow public access za slike podlag
```

---

## 🔒 VARNOSTNI CHECKLIST

Pred deploymentom preveri:

- [ ] Vse RLS politike nastavljene in testirane
- [ ] API ključi v .env.local (ne v git)
- [ ] Stripe webhook signature validation
- [ ] File upload size limits (max 10MB za slike)
- [ ] Input sanitization za user data
- [ ] Rate limiting na API endpoints
- [ ] HTTPS enabled (Vercel avtomatsko)
- [ ] Supabase Vault za Stripe keys
- [ ] Email verification enabled
- [ ] Strong password policy
- [ ] Session timeout configured

