# Jobs-to-be-Done (JTBD) Framework

Jobs-to-be-Done is a framework for understanding user motivation by focusing on the progress they're trying to make in a specific circumstance.

---

## Core Concept

**Key Insight:** People don't buy products; they "hire" products to make progress in their lives.

**Framework:**  
When [situation], I want to [motivation], so I can [expected outcome].

---

## The Three Dimensions of a Job

### 1. Functional Job
**What task needs to be done?**

- Tangible, practical outcome
- Observable and measurable
- "Get from point A to point B"

**Example:**
- Transport myself 10 miles to work
- Share a document with my team
- Find a restaurant for dinner

### 2. Emotional Job
**How do I want to feel (or NOT feel)?**

- Psychological and emotional outcome
- Often unstated but powerful
- Drives satisfaction and loyalty

**Example:**
- Feel confident in my decision
- Avoid feeling embarrassed
- Feel productive and in control
- Reduce anxiety about missing something

### 3. Social Job
**How do I want to be perceived?**

- Status and identity signaling
- How others see me
- Often the hidden driver of adoption

**Example:**
- Appear professional to my boss
- Be seen as an early adopter
- Look like I have my life together
- Signal that I care about quality

---

## JTBD Interview Technique

### Setup
- Focus on a **recent, real experience** (not hypothetical)
- "Tell me about the LAST TIME you [did the job]"
- Uncover the full timeline: before, during, after

### Key Questions

**1. First Thought (What triggered the need?)**
- When did you first realize you needed to [do this job]?
- What was happening at that moment?
- What made you say "I need to solve this NOW"?

**2. Passive Looking (Initial exploration)**
- What did you do first?
- What options did you consider?
- What information did you look for?
- Who did you talk to?

**3. Active Looking (Narrowing options)**
- How did you narrow down your choices?
- What were you comparing?
- What made you rule things out?

**4. Deciding (Making the choice)**
- What finally made you decide on [solution]?
- What almost stopped you?
- What would have made you NOT choose it?
- Who else was involved in the decision?

**5. First Use (Consuming the solution)**
- What was your first experience like?
- Did it do what you expected?
- What surprised you (good or bad)?

**6. Ongoing Use (Living with it)**
- How has it changed your workflow/life?
- What do you love about it?
- What frustrates you?
- What would make you switch?

---

## Identifying the Job

### The Job is NOT:
- ❌ The product ("I need project management software")
- ❌ The feature ("I need a dashboard")
- ❌ The solution ("I need Slack")

### The Job IS:
- ✅ The progress to be made ("I need to keep my team aligned without constant meetings")
- ✅ The situation + motivation + outcome ("When my team is distributed, I want async updates, so I can reduce meeting overhead")

---

## Job Statement Template

### Basic Format
**When** [situation],  
**I want to** [motivation],  
**So I can** [expected outcome].

### Extended Format (with forces)
**When** [situation],  
**I want to** [motivation],  
**So I can** [expected outcome],  
**But** [anxiety/uncertainty],  
**Even though** [habit/inertia].

**Example:**
When I'm starting a new project,  
I want to quickly document requirements,  
So I can align the team before development starts,  
But I'm anxious about missing important details,  
Even though writing docs feels like it slows me down.

---

## Uncovering All Three Job Dimensions

### Example: Project Management Software

**Functional Job:**
"When I'm managing multiple projects, I want to track progress across teams, so I can ensure deadlines are met."

**Emotional Job:**
"When I'm managing multiple projects, I want to feel confident nothing is falling through the cracks, so I can sleep well at night."

**Social Job:**
"When I'm managing multiple projects, I want to appear organized and proactive to my boss, so I can be seen as promotion-ready."

**All three matter.** The product must deliver on all dimensions to truly satisfy the job.

---

## Forces Diagram (What Drives/Blocks Switching)

### Push Forces (away from current solution)
- Pain points with current solution
- New problems the current solution doesn't solve
- Changing circumstances

### Pull Forces (toward new solution)
- Compelling features
- Better fit for the job
- Peer recommendations

### Anxiety Forces (against new solution)
- Fear it won't work
- Switching costs
- Learning curve
- Risk of making wrong choice

### Habit Forces (sticking with current)
- Familiarity with current solution
- Inertia ("good enough")
- Attachment to workflows

**For adoption to happen: Push + Pull must outweigh Anxiety + Habit**

---

## Jobs-Based Feature Prioritization

### Step 1: Map features to jobs
For each feature, ask:
- Which job does this help with?
- Functional, emotional, or social?
- Is this core to the job or peripheral?

### Step 2: Prioritize by job importance
- How critical is this job to the user?
- How frequently does this job occur?
- How painful is the current solution?

### Step 3: Focus on job outcomes, not feature requests
Users say: "I want a dashboard with 10 widgets"  
Job translation: "I want to quickly spot anomalies so I can address issues before they escalate"  
→ Build: Smart alerts, not 10 widgets

---

## Common JTBD Mistakes

### ❌ Mistake 1: Describing the product, not the job
**Wrong:** "I need a CRM"  
**Right:** "When I'm following up with leads, I want to remember past conversations, so I can build rapport and close deals."

### ❌ Mistake 2: Too broad
**Wrong:** "I want to be productive"  
**Right:** "When I'm planning my week, I want to realistically estimate my capacity, so I can avoid overcommitting and burning out."

### ❌ Mistake 3: Solution-focused
**Wrong:** "I want a Kanban board"  
**Right:** "When my team is working on multiple tasks, I want to quickly see who's working on what, so I can unblock people and balance workload."

### ❌ Mistake 4: Ignoring emotional/social jobs
Only focusing on functional jobs misses powerful motivations.

**Example:**  
**Functional:** "Track my expenses"  
**Emotional:** "Feel in control of my finances" ← This is the real job!  
**Social:** "Appear financially responsible to my partner"

---

## JTBD in PRDs

### Problem Section
Describe the job, not just the pain points.

**Before:**
"Users struggle to track project status."

**After (Job-framed):**
"When Sarah is asked 'How's Project X going?' in a meeting, she wants to instantly know the answer with confidence, so she can appear on top of things and provide accurate updates. Currently, she spends 30 minutes before each meeting manually compiling status from 5 different tools, causing anxiety and making her feel disorganized."

### Features Section
Frame features as job enablers.

**Before:**
"Dashboard with project health indicators"

**After:**
"When Sarah opens the app, she immediately sees project health scores (on-track, at-risk, blocked), enabling her to answer status questions confidently in seconds and feel in control."

---

## JTBD Research Questions

### Discovering the Job
1. Walk me through the last time you needed to [accomplish outcome].
2. What triggered that need?
3. What were you trying to achieve?
4. How did you want to feel when it was done?
5. Who else knew you were doing this?

### Understanding Context
6. What was happening in your life/work at that time?
7. What made this urgent vs. something you could put off?
8. What would have happened if you didn't do this?

### Exploring Solutions
9. What did you try first?
10. What made you choose [solution] over [alternative]?
11. What almost made you choose something else?
12. What did you wish existed but didn't?

### Measuring Success
13. How did you know it worked?
14. What would have made it better?
15. How has your life/work changed since?

---

## Jobs vs. Personas

**Personas answer:** WHO is the user?  
**Jobs answer:** WHY are they using this?

**Both are needed:**
- Personas help you understand demographics, behaviors, context
- Jobs help you understand motivation, progress, success criteria

**Example:**
- **Persona:** Sarah, 35, Product Manager, tech-savvy, manages 3 projects
- **Job:** When planning a sprint, reduce uncertainty about team capacity, so sprints are predictable and stakeholders trust my estimates

---

## Key Takeaways

1. **Focus on progress, not products** - What are users trying to achieve?
2. **Context matters** - Same person has different jobs in different situations
3. **All three dimensions matter** - Functional + Emotional + Social
4. **Jobs are stable, solutions change** - Jobs endure; how we solve them evolves
5. **Jobs reveal opportunities** - Underserved jobs = innovation opportunities

---

## Further Reading

- *Competing Against Luck* by Clayton Christensen
- *The Jobs to be Done Playbook* by Jim Kalbach
- *Intercom on Jobs-to-be-Done* (free ebook)
