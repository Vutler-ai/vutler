# Brainstorming Techniques for Product Discovery

## SCAMPER Method

A systematic approach to innovation by transforming existing ideas:

- **Substitute:** What can be replaced? (materials, people, processes)
- **Combine:** What can be merged? (features, audiences, technologies)
- **Adapt:** What can be adjusted? (from other industries, contexts)
- **Modify:** What can be changed? (size, shape, attributes)
- **Put to another use:** What else can this serve? (new markets, use cases)
- **Eliminate:** What can be removed? (features, steps, complexity)
- **Reverse:** What can be flipped? (process order, perspective)

**When to use:** Exploring feature variations or pivoting existing concepts.

## Jobs-to-be-Done (JTBD)

Focus on the functional, emotional, and social jobs users hire your product to do.

**Framework:**
```
When [situation], I want to [motivation], so I can [expected outcome].
```

**Key questions:**
- What job is the user trying to get done?
- What are they using today? (competition includes non-consumption)
- What are the functional, emotional, and social dimensions?
- What are the success criteria from the user's perspective?

**When to use:** Understanding core user motivation and positioning against alternatives.

## Five Whys

Drill down to root causes by asking "why?" five times.

**Example:**
1. Why do users abandon checkout? → "It's too slow"
2. Why is it slow? → "Payment processing takes 30s"
3. Why does it take 30s? → "We make 3 sequential API calls"
4. Why sequential? → "Legacy integration architecture"
5. Why legacy? → "No one prioritized modernization"

**Root cause:** Technical debt prioritization, not checkout UX.

**When to use:** Understanding the real problem behind surface symptoms.

## Opportunity Scoring

Quantify importance vs. satisfaction for features or problems.

**Score each item (1-10 scale):**
- **Importance:** How critical is this to users?
- **Satisfaction:** How well are current solutions meeting this need?
- **Opportunity:** `Importance + max(Importance - Satisfaction, 0)`

**Prioritize:** High opportunity score = important but poorly served = best ROI.

**When to use:** Prioritizing which problems to solve first.

## User Story Mapping

Visualize user journey and identify feature gaps.

**Structure:**
```
[User Activity] → [User Tasks] → [User Stories]
Example:
Browse Products → Filter by category → As a shopper, I want to filter by price range
```

**When to use:** Planning MVP scope and release phases.

## Competitive Analysis Grid

Map competitors against key dimensions.

**Axes examples:**
- Price vs. Features
- Simplicity vs. Power
- Speed vs. Customization

**When to use:** Finding white space and differentiation opportunities.
