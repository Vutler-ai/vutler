# Vutler Landing Page Content Specification
**Version:** 1.0  
**Date:** 2026-02-25  
**For:** Next.js Migration  
**Status:** Ready for Implementation

---

## 📋 Overview

This document defines the EXACT content and structure for the Vutler landing page. Each section includes precise copy, layout notes, and CTA destinations. Philip: implement this pixel-by-pixel.

---

## 🔝 Navigation Bar

### Content
- **Logo:** "Vutler" (left-aligned)
- **Nav Items:**
  - Features
  - Pricing
  - Docs
  - GitHub
  - Login
  - **CTA Button:** "Get Started Free"

### Visual Notes
- Sticky header on scroll
- Logo links to homepage (/)
- "Get Started Free" button: primary color, high contrast
- Mobile: hamburger menu for nav items

### Destinations
- Features → `#features`
- Pricing → `#pricing`
- Docs → `/docs` or external docs URL
- GitHub → https://github.com/[vutler-repo] (update with actual repo)
- Login → `/login` or `/dashboard`
- Get Started Free → `/signup` or `/landing/signup.html`

---

## 🎯 Hero Section

### Content

**Announcement Badge:**
```
Now with GPT-4o & Claude Sonnet integration
```

**Main Headline:**
```
Build your AI workforce
or bring your own
```

**Subheadline:**
```
Deploy autonomous AI agents in minutes. Handle emails, chats, files, and tasks 24/7.
No per-seat pricing. Full API control.
```

**Primary CTA:**
- Text: "Get Started Free"
- Destination: `/signup`

**Secondary CTA:** (optional)
- Text: "View Demo" or "Watch Video"
- Destination: `#demo` or demo video

### Visual Notes
- Announcement badge: subtle background, positioned above headline
- Headline: largest text on page, bold, split into two lines with emphasis on "Build" and "bring your own"
- Subheadline: 1-2 font sizes smaller, medium weight
- CTAs: side-by-side on desktop, stacked on mobile
- Primary CTA: solid background, high contrast
- Background: gradient or subtle pattern, not overwhelming
- Optional: animated background elements or particles

---

## 🏅 Social Proof Badges

### Content

Four badge cards arranged horizontally:

**1. Open Beta**
```
Open Beta
Free to try
```

**2. Open Source**
```
Open Source
AGPL-3.0
```

**3. Swiss Hosted**
```
Swiss Hosted
Geneva, Switzerland
```

**4. Feature Count**
```
100+ Features
Agents, API & more
```

### Visual Notes
- Four equal-width cards
- Icon or small graphic in each badge (optional)
- Light background, subtle border
- Responsive: 2x2 grid on mobile
- Positioned directly below hero section
- Subtle hover effect (lift or glow)

---

## 📊 Dashboard Preview Section

### Content

**Section Headline:**
```
Live Dashboard Overview
```
(or no headline, just visual)

**Dashboard Stats (3 cards):**

**Card 1: Active Agents**
```
Active Agents
12
▲ +3 this week
```

**Card 2: Tasks Today**
```
Tasks Today
847
▲ +12%
```

**Card 3: Token Usage**
```
Token Usage
2.4M
of 5M limit
```

**Agent Activity List (4 items):**

```
Support Agent
124 tasks
Online
```

```
Sales Bot
89 tasks
Online
```

```
Data Analyst
Processing…
Busy
```

```
Email Handler
Idle
Idle
```

**Recent Activity Feed (bottom of dashboard):**

```
Support Agent replied to 3 tickets
now
```

```
Sales Bot closed a lead on Slack
1m
```

```
Data Analyst exported report.csv
4m
```

**Dashboard Footer Stats:**

```
GPT-4o connected
847 tasks done today
```

### Visual Notes
- Mockup/screenshot of actual dashboard OR recreated component
- Stats cards: grid layout, colorful icons/numbers
- Agent list: status indicators (green=online, yellow=busy, gray=idle)
- Activity feed: chronological, timestamps
- Subtle animations: numbers counting up, status dots pulsing
- Dark or light theme (match brand)
- Optional: small "This is a live preview" badge

### Purpose
Show the product in action. Make it tangible.

---

## 🔌 Integrations Section

### Content

**Section Headline:**
```
Integrates with your stack
```

**Integration Logos (8 shown):**

1. **OpenAI** (logo + name)
2. **Anthropic** (logo + name)
3. **Slack** (logo + name)
4. **Discord** (logo + name)
5. **Gmail** (logo + name)
6. **Drive** (Google Drive logo + name)
7. **Calendar** (Google Calendar logo + name)
8. **GitHub** (logo + name)

### Visual Notes
- Grid layout: 4 columns on desktop, 2 on tablet, 1 on mobile
- Logo + name below or to the right
- Equal-sized boxes/cards with subtle borders
- Grayscale logos with color on hover (or full color)
- Optional: "+20 more integrations" card at the end
- Centered alignment

### Destination
- Clicking a logo could link to integration docs page (optional)
- Or no link, just visual

---

## 🛠️ Build or Bring Section

### Content

**Section Layout:** Two-column split (Build | Bring)

---

### Column 1: Build

**Headline:**
```
Build
```

**Description:**
```
Start from proven agent templates. Customize prompts, tools, and workflows. Deploy in minutes — no infra needed.
```

**Feature List:**
- Customer support agent
- Sales assistant
- Data pipeline agent
- Custom system prompts
- Deploy in 1 click

**CTA:**
- Text: "Browse Templates →"
- Destination: `#get-started` or `/templates`

---

### Column 2: Bring

**Headline:**
```
Bring
```

**Description:**
```
Import your existing agents, connect your infrastructure, and manage everything from one unified dashboard.
```

**Feature List:**
- Import existing agents
- BYOKEY (OpenAI, Anthropic…)
- Full REST API access
- Custom integrations
- On-premise option

**CTA:**
- Text: "Import Workspace →"
- Destination: `#contact` or `/import`

---

### Visual Notes
- 50/50 split on desktop
- Stacked vertically on mobile (Build on top)
- "or" divider in the center (vertical line or text)
- Each column: distinct background color or card
- Icons for each feature list item (optional)
- CTAs: text links with arrow, not buttons

---

## ✨ Features Grid

### Content

**Section Headline:**
```
Everything you need to run your AI workforce
```

**8 Feature Cards:**

---

**1. Email**

**Description:**
```
Send, receive, and triage emails autonomously. Handle inquiries, follow-ups, and notifications around the clock.
```

---

**2. Chat**

**Description:**
```
Integrate with Slack, Discord, and Rocket.Chat. Respond instantly to team messages and user inquiries.
```

---

**3. File Storage**

**Description:**
```
Read, write, and organize files in Google Drive, Dropbox, S3, and more — fully autonomously.
```

---

**4. Calendar**

**Description:**
```
Schedule meetings, manage availability, and send reminders. Never miss a follow-up.
```

---

**5. Agent Templates**

**Description:**
```
Start with battle-tested templates or build your own. Share and reuse across teams and workspaces.
```

---

**6. Usage Analytics**

**Description:**
```
Track token usage, set budgets, and optimize costs with real-time dashboards and alerts.
```

---

**7. Activity Feed**

**Description:**
```
Real-time chronological feed of every agent action. Filter by type, export logs, full audit trail.
```

---

**8. LLM Config**

**Description:**
```
Bring your own API key or use managed LLM tiers. Switch providers per agent. OpenAI, Anthropic, Groq, Mistral.
```

---

### Visual Notes
- Grid layout: 4 columns on desktop, 2 on tablet, 1 on mobile
- Each card: icon (top or left), title (bold), description (gray text)
- Equal height cards with subtle borders or shadows
- Hover effect: lift, glow, or color shift
- Icons: minimalist, consistent style
- Optional: link each card to detailed docs page

---

## 🔄 How It Works

### Content

**Section Headline:**
```
Get started in 4 steps
```

**Step-by-step Process:**

---

**Step 1: Choose a template**

**Icon/Number:** 01

**Description:**
```
Pick from pre-built agent templates or start blank. Each template comes with sane defaults and is production-ready.
```

**Visual:** Arrow pointing to next step →

---

**Step 2: Configure & connect**

**Icon/Number:** 02

**Description:**
```
Set your system prompt, connect integrations, and configure your LLM provider (BYOKEY or managed).
```

**Visual:** Arrow pointing to next step →

---

**Step 3: Deploy**

**Icon/Number:** 03

**Description:**
```
One click deploys your agent. It starts handling tasks immediately. Monitor everything from the dashboard.
```

**Visual:** Arrow pointing to next step →

---

**Step 4: Scale**

**Icon/Number:** 04

**Description:**
```
Add more agents, set usage limits, invite your team. No extra cost per seat — pay for what your agents use.
```

---

### Visual Notes
- Horizontal timeline on desktop (left to right)
- Vertical timeline on mobile (top to bottom)
- Large step numbers (01, 02, 03, 04) or icons
- Arrows between steps (dotted line or solid)
- Each step: card or section with padding
- Optional: screenshots or illustrations for each step
- Background: subtle gradient or pattern

---

## 💰 Pricing Section

### Content

**Section Headline:**
```
Simple, transparent pricing
```

**Subheadline:**
```
No hidden fees. No per-seat costs. Pay for what your agents use.
```

**3 Pricing Tiers:**

---

### Tier 1: Free

**Price:**
```
$0
```

**Period:**
```
Forever
```

**Features:**
- Up to 3 agents
- 1,000 messages/month
- Basic templates
- Community support
- Public GitHub repo

**CTA:**
- Text: "Get Started Free"
- Destination: `/signup` or `/landing/signup.html`
- Style: Secondary button (outlined or subtle)

---

### Tier 2: Hosted ⭐ Most Popular

**Badge:** "Most Popular" (top right of card)

**Price:**
```
Custom
```

**Period:**
```
Contact for pricing
```

**Features:**
- Unlimited agents
- Unlimited messages
- All templates
- All integrations
- Priority support
- Custom branding
- Usage analytics

**CTA:**
- Text: "Contact Sales"
- Destination: `#contact` or `/contact`
- Style: Primary button (solid, high contrast)

---

### Tier 3: On-Premise

**Price:**
```
Custom
```

**Period:**
```
Contact for pricing
```

**Features:**
- Everything in Hosted
- On-premise deployment
- Custom integrations
- SLA guarantees
- Dedicated support
- SSO & SAML
- Advanced security

**CTA:**
- Text: "Contact Sales"
- Destination: `#contact` or `/contact`
- Style: Secondary button

---

### Visual Notes
- 3 cards side-by-side on desktop
- Stack vertically on mobile
- "Most Popular" card: larger, elevated, or highlighted border
- Each card: header (name + price), feature list, CTA at bottom
- Feature list: checkmarks or bullets
- Optional: "Compare plans" link below cards
- Optional: FAQ section below pricing

---

## 📞 Contact / CTA Section

### Content

**Section Headline:**
```
Ready to deploy your AI workforce?
```

**Subheadline:**
```
Join teams using Vutler to automate their operations. Start free, no credit card required.
```

**CTA Buttons:**

**Primary:**
- Text: "Get Started Free"
- Destination: `/signup`

**Secondary:**
- Text: "Schedule a Demo"
- Destination: `/contact` or Calendly link

**Additional Info:**
```
Questions? Email us at hello@vutler.ai
```

### Visual Notes
- Centered text
- Large, prominent CTAs
- Background: colored section (brand color) or pattern
- High contrast text and buttons
- Optional: illustration or graphic to the side

---

## 🔗 Footer

### Content

**Footer Layout:** 4 columns + bottom bar

---

### Column 1: Company

**Headline:** Product

**Links:**
- Features
- Pricing
- Templates
- Integrations
- Changelog

---

### Column 2: Resources

**Headline:** Resources

**Links:**
- Documentation
- API Reference
- Blog
- Tutorials
- Community

---

### Column 3: Company

**Headline:** Company

**Links:**
- About
- Careers
- Contact
- Privacy Policy
- Terms of Service

---

### Column 4: Connect

**Headline:** Connect

**Links:**
- GitHub
- Twitter
- Discord
- Email: hello@vutler.ai

---

### Bottom Bar

**Left Side:**
```
© 2026 Vutler. All rights reserved.
```

**Right Side:**
- Swiss Hosted | Open Source | AGPL-3.0

---

### Visual Notes
- Dark background (footer should contrast with page)
- 4 columns on desktop, 2 on tablet, 1 on mobile
- Links: white or light gray, hover effect
- Bottom bar: centered or left/right split
- Optional: social media icons in "Connect" section
- Newsletter signup form (optional)

---

## 🔍 SEO Metadata

### Title
```
Vutler — Your AI Workforce | Deploy Autonomous AI Agents
```

### Meta Description
```
Deploy autonomous AI agents in minutes. Handle emails, chats, files, and tasks 24/7. No per-seat pricing. Open source, Swiss-hosted, and fully API-controlled.
```

### Keywords (meta keywords, if used)
```
AI agents, autonomous agents, AI workforce, LLM agents, GPT-4, Claude, OpenAI, Anthropic, agent platform, AI automation, no-code AI, BYOKEY
```

### Open Graph Tags

```html
<meta property="og:title" content="Vutler — Your AI Workforce" />
<meta property="og:description" content="Deploy autonomous AI agents in minutes. Handle emails, chats, files, and tasks 24/7." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://vutler.ai" />
<meta property="og:image" content="https://vutler.ai/og-image.png" />
<meta property="og:site_name" content="Vutler" />
```

### Twitter Card Tags

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Vutler — Your AI Workforce" />
<meta name="twitter:description" content="Deploy autonomous AI agents in minutes. Handle emails, chats, files, and tasks 24/7." />
<meta name="twitter:image" content="https://vutler.ai/twitter-image.png" />
<meta name="twitter:site" content="@vutler" />
```

### Additional SEO Tags

```html
<meta name="robots" content="index, follow" />
<link rel="canonical" href="https://vutler.ai" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#[brand-color]" />
```

### Favicon
- Include favicon.ico, apple-touch-icon.png, and manifest.json

---

## 🛠️ Changes & Improvements

### ✅ Keep from Current Version

1. **Clear value proposition:** "Build your AI workforce or bring your own" is excellent
2. **Social proof badges:** Open Beta, Open Source, Swiss Hosted — strong trust signals
3. **Dashboard preview:** Shows the product in action, makes it tangible
4. **Build or Bring split:** Clear segmentation of use cases
5. **Pricing transparency:** No hidden fees messaging
6. **Integration logos:** Visual proof of ecosystem compatibility

---

### ⚠️ Issues to Fix

1. **Missing footer:** Current page has NO footer. Add comprehensive footer with all links.
2. **Broken CTA destinations:** Many CTAs point to `#get-started` or `#contact` (anchor links that don't exist). Fix all destinations.
3. **No "About" or "Story" section:** Consider adding a brief "Why Vutler?" or "Our Mission" section.
4. **Missing newsletter signup:** Could capture leads with an email signup in footer or dedicated section.
5. **No testimonials or case studies:** Add social proof from actual users (when available).
6. **Missing FAQ section:** Add common questions below pricing.
7. **No demo video or screenshots:** Add visual proof of product working.
8. **GitHub link in nav:** Update with actual repo URL (currently placeholder).
9. **Email address inconsistency:** Use hello@vutler.ai consistently throughout.
10. **Missing structured data (JSON-LD):** Add for better SEO (Organization, Product, etc.).

---

### 🚀 Recommended Additions

1. **Testimonials Section:**
   - 3-4 user quotes with names, companies, photos
   - Position after Features or after How It Works

2. **FAQ Section:**
   - Place below Pricing
   - 6-8 common questions:
     - "How does pricing work?"
     - "Can I bring my own OpenAI key?"
     - "Is my data secure?"
     - "What's included in the free tier?"
     - "Can I deploy on-premise?"
     - "How do I migrate my existing agents?"

3. **Trust Indicators:**
   - "Used by X teams"
   - "X agents deployed"
   - "X tasks automated this month"

4. **Demo Video or Product Tour:**
   - 60-90 second explainer video in hero or dedicated section
   - Screen recording of dashboard walkthrough

5. **Blog/Changelog Link:**
   - Show recent updates
   - "See what's new →"

6. **Cookie Consent Banner:**
   - GDPR compliance (Swiss hosting = EU adjacent)

7. **Live Chat Widget:**
   - Optional: Intercom, Drift, or custom agent chat

8. **Newsletter Signup:**
   - Footer or dedicated section
   - "Get updates on new features and templates"

---

### 📐 Layout & Design Notes

#### Color Palette
- Define primary, secondary, accent colors
- Dark mode support (optional but recommended)
- Consistent use of brand colors throughout

#### Typography
- Headline: Large, bold, high impact
- Body: Readable, 16-18px base size
- Code snippets: Monospace font for technical sections

#### Spacing
- Generous whitespace between sections
- Consistent padding/margins
- Mobile-first responsive design

#### Animations
- Subtle, purposeful animations
- Dashboard numbers counting up
- Fade-in on scroll for sections
- Hover effects on cards and buttons
- Don't overdo it — keep it professional

#### Accessibility
- WCAG 2.1 AA compliance
- Alt text for all images
- Keyboard navigation support
- Screen reader friendly
- Focus states on interactive elements

---

## 📦 Assets Needed

### Images
- Dashboard screenshot or mockup (high-res)
- Integration logos (8 shown, + more)
- OG image (1200x630px)
- Twitter card image (1200x600px)
- Favicon (multiple sizes)
- Feature icons (8 custom icons)
- Optional: hero background graphic/pattern

### Videos
- Demo video (optional, ~60-90 seconds)
- Tutorial videos for each feature (optional)

### Copy
- All copy provided in this spec
- Additional microcopy for UI elements
- Error messages, success messages, tooltips

---

## ✅ Implementation Checklist for Philip

- [ ] Set up Next.js project structure
- [ ] Create reusable components (Button, Card, Section, etc.)
- [ ] Implement navigation bar (sticky on scroll)
- [ ] Build hero section with announcement badge
- [ ] Add social proof badges (4 cards)
- [ ] Create dashboard preview component (stats + agents + feed)
- [ ] Implement integrations grid (8 logos, responsive)
- [ ] Build Build/Bring split section
- [ ] Create features grid (8 cards, responsive)
- [ ] Implement How It Works timeline (4 steps)
- [ ] Build pricing cards (3 tiers, "Most Popular" highlight)
- [ ] Add contact/CTA section
- [ ] Create comprehensive footer (4 columns + bottom bar)
- [ ] Add SEO metadata (title, description, OG tags, Twitter cards)
- [ ] Implement responsive design (mobile, tablet, desktop)
- [ ] Add subtle animations (fade-in, hover effects)
- [ ] Test all CTA destinations
- [ ] Add FAQ section (below pricing)
- [ ] Include newsletter signup (footer)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Performance optimization (Lighthouse score >90)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Deploy to staging for review

---

## 📞 Questions for Philip?

Contact me (Product Owner) if anything is unclear or you need assets, copy changes, or additional guidance.

---

**End of Specification**
