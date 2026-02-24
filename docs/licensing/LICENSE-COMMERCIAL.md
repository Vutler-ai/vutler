# Vutler Enterprise License Agreement

**Version:** 1.0  
**Effective Date:** 2026-02-23  
**Licensor:** Starbox Group GmbH, Geneva, Switzerland  
**License Type:** Commercial (Proprietary)

---

## 1. DEFINITIONS

**"License"** — This commercial license agreement granting you the right to use the Enterprise Edition under the specified terms.

**"Licensor"** — Starbox Group GmbH, a company organized under Swiss law, with principal place of business in Geneva, Switzerland.

**"Licensee"** — You, the individual or organization acquiring this license.

**"License Key"** — The cryptographically-signed credential issued by Licensor that activates Enterprise Edition features.

**"Enterprise Edition (EE)"** — The proprietary version of Vutler platform that includes advanced features including but not limited to: multi-tenancy, end-to-end encryption, advanced LLM routing, VDrive, cloud code execution, analytics dashboard, SSO/SAML integration, enterprise audit logs, and automated backup & recovery.

**"Community Edition (CE)"** — The open-source version of Vutler platform distributed under Apache License 2.0.

**"Licensed Software"** — The Enterprise Edition of Vutler, including all code, documentation, and updates provided under this License.

**"Confidential Information"** — All proprietary code, algorithms, trade secrets, and technical know-how contained in the Licensed Software.

---

## 2. GRANT OF LICENSE

Starbox Group GmbH grants to Licensee a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to use the Licensed Software (Enterprise Edition) subject to the following conditions:

- **Valid License Key Required:** Use of the Licensed Software is contingent upon possession of a valid, current License Key issued by Licensor.
- **Scope:** License authorizes internal use only within Licensee's organization.
- **Permitted Use:** Licensee may use the Licensed Software to operate its own AI agent platform, subject to usage limits and quotas specified in the License Key or Service Agreement.
- **Term:** This license is valid for the duration specified in the License Key (typically 12 months) and automatically renews upon subscription renewal.

### 2.1 License Key Activation

- Licensee must configure the `VUTLER_LICENSE_KEY` environment variable to activate Enterprise Edition features.
- License Keys are digitally signed JWTs containing organization ID, feature set, usage limits, and expiration date.
- Licensor validates License Keys at runtime; expired or invalid keys revert the system to Community Edition with logged warnings.
- License Keys are non-transferable; use by unauthorized parties is prohibited.

---

## 3. RESTRICTIONS

Licensee agrees NOT to:

### 3.1 Redistribution
- Distribute, resell, rent, lease, lend, or timeshare the Licensed Software or any part thereof.
- Make the Licensed Software available to third parties except as explicitly authorized in writing by Licensor.
- Incorporate the Licensed Software into commercial products or services for resale without prior written authorization.

### 3.2 Reverse Engineering
- Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Licensed Software.
- Remove, obscure, or alter any proprietary notices, labels, or trademarks.
- Analyze the Licensed Software to identify or replicate proprietary algorithms, trade secrets, or encryption methods.

### 3.3 Sublicensing
- Grant licenses, sublicenses, or any rights to the Licensed Software to third parties.
- Use the Licensed Software to provide services (SaaS) to external customers without prior written agreement.
- Permit unauthorized access by third parties to the Licensed Software or Confidential Information.

### 3.4 Modification
- Modify, adapt, or create derivative works of the Licensed Software.
- **Exception:** Licensee may modify configuration files and standard integrations for internal use only, provided modifications do not constitute redistribution.

### 3.5 Competitive Use
- Use the Licensed Software to develop, test, or create competing products or services.
- Benchmark or compare the Licensed Software against competing offerings without Licensor's written consent.

---

## 4. INTELLECTUAL PROPERTY

### 4.1 Ownership
All intellectual property rights in the Licensed Software, including copyrights, patents, trade secrets, and trademarks, are owned exclusively by Starbox Group GmbH or its licensors. No ownership rights are transferred to Licensee.

### 4.2 Third-Party Components
The Licensed Software may include components from third parties licensed under open-source licenses (e.g., Rocket.Chat MIT License) or commercial licenses. See `NOTICE.md` for attribution and compliance requirements.

### 4.3 User Data
Licensee retains all rights to data created, stored, or processed within the Licensed Software ("User Data"). Licensor may use anonymized, aggregated usage data for product improvement and analytics.

---

## 5. USAGE LIMITS & QUOTAS

License Keys specify usage limits. Exceeding quotas triggers:
- **Warnings** — Logged alerts to administrators
- **Rate Limiting** — Non-critical operations may be throttled
- **Suspension** — Critical operations may be suspended (as specified in Service Agreement)

Licensee is responsible for monitoring usage and upgrading to higher tiers if quotas are exceeded.

---

## 6. CONFIDENTIALITY

### 6.1 Confidential Information
The Licensed Software contains Licensor's Confidential Information, including proprietary algorithms, encryption methods, and technical architecture.

### 6.2 Obligations
Licensee agrees to:
- Treat Confidential Information as strictly confidential
- Limit access to authorized employees on a need-to-know basis
- Not disclose Confidential Information to third parties except as required by law
- Implement reasonable security measures to protect Confidential Information

### 6.3 Exceptions
Confidential Information does not include information that:
- Is publicly available through no breach by Licensee
- Is rightfully obtained from a third party without confidentiality obligations
- Is independently developed without reference to Licensor's Confidential Information
- Must be disclosed by law or court order (with notice to Licensor)

---

## 7. TERM & TERMINATION

### 7.1 Term
This License is effective on the Effective Date and continues until expiration of the License Key unless terminated earlier.

### 7.2 Termination for Convenience
Licensee may terminate this License upon 30 days' written notice to Licensor.

### 7.3 Termination for Breach
Licensor may terminate this License immediately upon:
- Use of the Licensed Software without a valid License Key
- Violation of Sections 3 (Restrictions) or 4 (Intellectual Property)
- Unauthorized transfer or sublicensing
- Use of the Licensed Software for competitive purposes
- Failure to pay subscription fees

### 7.4 Effect of Termination
Upon termination:
- Licensee's right to use the Licensed Software ceases immediately
- Licensee must cease all use and destroy all copies of the Licensed Software (except backups for legal compliance)
- Licensor may deactivate the License Key remotely
- Community Edition features remain accessible if Licensee reverts to CE
- Data and configurations remain Licensee's property; Licensor may delete after 90 days

---

## 8. WARRANTIES & DISCLAIMERS

### 8.1 Limited Warranty
Licensor warrants that:
- The Licensed Software will substantially conform to its documented specifications
- Licensor has the right to grant this License

### 8.2 Warranty Period
Limited Warranty applies for 30 days from License Key activation. Licensor will use commercially reasonable efforts to correct material defects.

### 8.3 Disclaimer of Other Warranties
EXCEPT AS EXPRESSLY STATED, LICENSOR DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING:
- MERCHANTABILITY
- FITNESS FOR A PARTICULAR PURPOSE
- NON-INFRINGEMENT
- COMPATIBILITY WITH THIRD-PARTY SYSTEMS
- UNINTERRUPTED OR ERROR-FREE OPERATION

### 8.4 Use As-Is
The Licensed Software is provided "AS-IS." Licensee assumes all risk of use, including data loss, security breaches, and system failures.

---

## 9. LIMITATION OF LIABILITY

### 9.1 Excluded Damages
IN NO EVENT SHALL LICENSOR BE LIABLE FOR:
- Indirect, incidental, consequential, special, or punitive damages
- Loss of profits, revenue, data, business opportunity, or goodwill
- Cost of substitute software or services
- Damages arising from third-party claims, even if advised of the possibility

### 9.2 Liability Cap
LICENSOR'S TOTAL LIABILITY UNDER THIS LICENSE SHALL NOT EXCEED THE FEES PAID BY LICENSEE IN THE 12 MONTHS PRECEDING THE CLAIM.

### 9.3 Exceptions
Limitations do not apply to:
- Gross negligence or willful misconduct
- Violation of applicable law (data protection, environmental, etc.)
- Indemnification obligations under Section 10

---

## 10. INDEMNIFICATION

### 10.1 Licensor Indemnifies Licensee
Licensor will defend and indemnify Licensee against third-party claims that the Licensed Software infringes any U.S. or EU patent, copyright, or trade secret, provided Licensee:
- Promptly notifies Licensor of the claim
- Grants Licensor sole control of defense and settlement
- Provides reasonable cooperation

### 10.2 Remedies
If the Licensed Software is held infringing, Licensor may:
- Obtain the right for Licensee to continue using the Licensed Software
- Replace or modify the Licensed Software to be non-infringing
- If neither option is commercially reasonable, terminate this License and refund prepaid fees

### 10.3 Licensee Indemnifies Licensor
Licensee will defend and indemnify Licensor against claims arising from:
- Licensee's violation of this License
- Licensee's use of the Licensed Software contrary to instructions
- Licensee's combination of the Licensed Software with third-party products
- Licensee's infringement of third-party rights through use of the Licensed Software

---

## 11. SUPPORT & SERVICE LEVEL

### 11.1 Support Included
Enterprise License includes:
- Email support with 4-hour response SLA (business hours)
- Optional phone support (available through separate support plan)
- Access to bug-fix patches and security updates
- Quarterly software updates

### 11.2 Support Exclusions
Support does not cover:
- Custom development or consulting
- Third-party integration issues
- User training
- System administration

### 11.3 Service Level Agreement (SLA)
For customers with SLA-backed support:
- **Uptime SLA:** 99.5% availability (target, not guarantee)
- **Response Time:** 4 hours (initial response to critical issues)
- **Resolution Time:** Best-effort, no specific guarantee
- **SLA Credits:** Contractually specified; failure to meet SLA entitles credits (not automatic refunds)

---

## 12. COMPLIANCE & AUDITS

### 12.1 License Audit
Licensor reserves the right to audit Licensee's use of the Licensed Software to verify compliance with this License. Audits may occur:
- Upon reasonable written notice
- No more than once per year during normal business hours
- At Licensor's expense unless material non-compliance is discovered

### 12.2 Audit Findings
If audit reveals non-compliance, Licensee must:
- Cure violations within 30 days
- Pay Licensor's audit costs (if non-compliance is material)
- Acquire additional licenses if usage exceeds current entitlement

### 12.3 Regulatory Compliance
Licensee is responsible for compliance with all applicable laws regarding use of the Licensed Software, including data protection (GDPR, CCPA) and export control regulations.

---

## 13. GOVERNING LAW & DISPUTE RESOLUTION

### 13.1 Governing Law
This License is governed by the laws of Switzerland, specifically the Canton of Geneva, without regard to conflicts of law principles.

### 13.2 Jurisdiction
Both parties consent to the exclusive jurisdiction and venue of courts located in Geneva, Switzerland.

### 13.3 Dispute Resolution
Before litigation, parties agree to attempt resolution through:
1. **Good Faith Negotiation** — 30 days between senior executives
2. **Mediation** — If negotiation fails, binding mediation in Geneva under WIPO rules
3. **Litigation** — Geneva courts as final recourse

### 13.4 Prevailing Party
The prevailing party in any dispute is entitled to reasonable attorney's fees and costs.

---

## 14. PAYMENT & FEES

### 14.1 Subscription Fees
Licensee agrees to pay subscription fees as specified in the executed Service Agreement or License Key.

### 14.2 Payment Terms
- **Invoicing:** Annual or monthly, as agreed
- **Due Date:** Net 30 days from invoice date
- **Late Payment:** 1.5% monthly interest accrues on unpaid amounts
- **Currency:** EUR or CHF (as specified in Service Agreement)

### 14.3 Price Increases
Licensor may increase fees upon 60 days' written notice. If Licensee does not accept new pricing, Licensee may terminate without penalty.

### 14.4 Refunds
License fees are non-refundable except as required by law. Early termination does not entitle refunds of prepaid fees.

---

## 15. GENERAL PROVISIONS

### 15.1 Entire Agreement
This License, along with any executed Service Agreement, constitutes the entire agreement regarding the Licensed Software and supersedes all prior agreements, understandings, and negotiations.

### 15.2 Amendments
Amendments to this License are valid only if in writing and signed by authorized representatives of both parties.

### 15.3 Severability
If any provision is found unenforceable, it shall be modified to the minimum extent necessary to make it enforceable, and remaining provisions shall continue in full effect.

### 15.4 Waiver
Failure to enforce any provision does not constitute waiver of that or any other provision.

### 15.5 Assignment
Licensee may not assign this License without Licensor's written consent. Any unauthorized assignment is void. Licensor may assign this License to successors or acquirers without notice.

### 15.6 Counterparts
This License may be executed in counterparts, each constituting an original, all together constituting one agreement.

---

## 16. EXPORT COMPLIANCE

The Licensed Software may be subject to international export control laws, including the U.S. Export Administration Regulations (EAR) and sanctions programs. Licensee agrees not to:
- Export the Licensed Software to prohibited countries or entities
- Use the Licensed Software in connection with prohibited end-uses (weapons, nuclear, etc.)
- Provide access to third parties in violation of export laws

---

## 17. CHANGES TO LICENSE TERMS

Licensor may modify this License at any time by updating this document. Continued use of the Licensed Software after notification constitutes acceptance of modified terms. If Licensee does not accept modifications, Licensee may terminate this License with 30 days' notice.

---

## 18. CONTACT & NOTICES

### 18.1 Licensor Contact
**Starbox Group GmbH**  
Geneva, Switzerland  
Email: legal@starboxgroup.com  
Phone: +41 (22) xxx-xxxx (as provided in Service Agreement)

### 18.2 Notice Requirements
Notices must be in writing and sent to the addresses specified in executed Service Agreement or by email to legal contact.

---

## 19. ACKNOWLEDGMENT

Licensee acknowledges that:
- Licensee has read and understood this License
- Licensee is duly authorized to enter into this agreement on behalf of its organization
- Licensee agrees to comply with all terms and conditions

---

**Effective Date:** 2026-02-23  
**License Version:** 1.0  
**Prepared by:** Starbox Group GmbH, Legal Department

**By accepting a License Key or using the Enterprise Edition, Licensee agrees to be bound by this License Agreement.**

