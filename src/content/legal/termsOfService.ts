import type { LegalBlock } from './types';

export const TERMS_OF_SERVICE_EFFECTIVE_DATE = 'July 30, 2026';

/**
 * Kept word-for-word identical to docs/terms-of-service.md and the hosted
 * page at gymsyncapp.me/terms-of-service — three surfaces, one source of
 * truth. Edit all three together.
 */
export const TERMS_OF_SERVICE_BLOCKS: LegalBlock[] = [
  {
    type: 'p',
    text: 'Please read these Terms of Service ("Terms") carefully before using GymSync ("the App"), operated by Yoshiharu Nishikawahara ("we," "our," "us," or "GymSync").',
  },
  {
    type: 'p',
    text: 'By downloading, installing, or using GymSync, you agree to be bound by these Terms. If you do not agree, do not use the App. Section 15 below contains an arbitration agreement and class action waiver that affects your legal rights — please read it carefully.',
  },
  { type: 'h', text: '1. Acceptance of Terms; Eligibility' },
  {
    type: 'p',
    text: 'By accessing or using GymSync, you confirm that you are at least 13 years of age (or the minimum age required in your jurisdiction), and that you have the legal capacity to agree to these Terms. If you are using the App on behalf of an organization, you represent that you have authority to bind that organization.',
  },
  { type: 'h', text: '2. Changes to the App or These Terms' },
  {
    type: 'p',
    text: 'We may modify, update, or discontinue any feature or functionality of GymSync at any time, without liability, including changes required by our service providers (Apple, Supabase, Anthropic, or ElevenLabs).',
  },
  {
    type: 'p',
    text: 'We may update these Terms from time to time. When we make material changes, we will update the "Last Updated" date above and, where reasonably practicable, notify you through the App. Continued use of GymSync after changes are posted constitutes acceptance of the updated Terms. If you disagree with a change, your only remedy is to stop using GymSync and delete your account.',
  },
  { type: 'h', text: '3. License Grant' },
  {
    type: 'p',
    text: 'We grant you a limited, non-exclusive, non-transferable, revocable license to use GymSync on Apple devices that you own or control, subject to these Terms and the Apple Media Services Terms and Conditions.',
  },
  { type: 'h', text: '4. Restrictions' },
  { type: 'p', text: 'You agree not to:' },
  {
    type: 'list',
    items: [
      'Copy, modify, or create derivative works of the App',
      'Reverse-engineer, decompile, or disassemble the App, except to the extent applicable law expressly permits this despite this restriction',
      'Rent, lease, lend, sell, sublicense, or otherwise commercially exploit the App',
      'Use any robot, spider, scraper, or other automated means to access, extract, or index data from the App',
      'Attempt to bypass or circumvent any security or access-control measure in the App',
      'Interfere with or disrupt the operation of the App, or place an unreasonable load on its infrastructure',
      'Upload or transmit any virus, malware, or other harmful code',
      'Remove or alter any proprietary notices in the App',
      'Use the App for any unlawful purpose',
    ],
  },
  { type: 'h', text: '5. User Accounts' },
  {
    type: 'list',
    items: [
      'You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.',
      'You must provide accurate information when creating your account and maintain only one account for your own personal use.',
      'You must notify us promptly at support@gymsyncapp.me of any unauthorized use of your account.',
      'You may permanently delete your account and all associated data at any time via Settings → Account settings → Delete account. This action cannot be undone and account data generally cannot be recovered afterward.',
    ],
  },
  { type: 'p', text: 'We reserve the right to suspend or terminate accounts that violate these Terms.' },
  { type: 'h', text: '6. Fitness, Health, and AI Coaching Disclaimer — Please Read Carefully' },
  {
    type: 'p',
    text: 'GymSync provides general fitness guidance, workout plans, and AI-generated coaching. GymSync is not intended to diagnose, treat, cure, or prevent any disease or medical condition, and nothing in the App is medical advice.',
  },
  {
    type: 'list',
    items: [
      'Consult a physician or qualified professional before starting any exercise program, especially if you have a pre-existing health condition, injury, or concern, or are pregnant.',
      'You are solely responsible for exercising safely, using proper form, and choosing weights and intensities appropriate to your own fitness level and physical condition.',
      'Stop immediately and seek medical attention if you experience pain, dizziness, chest discomfort, or any other concerning symptom during a workout.',
      { label: 'AI-generated content may contain errors', text: 'Coaching replies, generated workout plans, and any response the AI coach gives about injuries, pain, or physical limitations are generated by third-party AI systems (see our Privacy Policy), are general in nature, may be inaccurate, and do not replace professional medical, physical therapy, or nutritional advice. Do not rely on the AI coach as your sole source of guidance for a health condition or injury.' },
      'You assume all risk of injury, loss, or damage resulting from your use of GymSync and any workout plan, exercise, or coaching guidance it provides.',
    ],
  },
  { type: 'h', text: '7. User Content' },
  {
    type: 'p',
    text: 'You retain ownership of the workout data, logs, profile photo, and messages you create within GymSync ("User Content"). By submitting User Content, you grant us a limited, non-exclusive, worldwide license to host, store, reproduce, and transmit your User Content — including sending relevant parts of it to our AI service providers (see our Privacy Policy) — solely to operate and provide GymSync\'s coaching features to you. This license ends when you delete the applicable content or your account, except for copies retained in routine backups for a limited period, which are then deleted in the ordinary course.',
  },
  {
    type: 'p',
    text: "You represent that you own or have the necessary rights to any User Content you submit (including any photo you upload), and that it does not infringe any third party's rights or violate any law.",
  },
  {
    type: 'p',
    text: 'You agree not to submit content that is illegal, harmful, or infringes on the rights of others. We may remove User Content that violates these Terms.',
  },
  { type: 'h', text: '8. Intellectual Property' },
  {
    type: 'p',
    text: 'GymSync, including its design, code, features, content, and branding, is owned by Yoshiharu Nishikawahara and protected by copyright, trademark, and other intellectual property laws. Except for the limited license in Section 3, these Terms do not grant you any rights to our intellectual property.',
  },
  { type: 'h', text: '9. Subscriptions and Purchases' },
  {
    type: 'p',
    text: 'GymSync offers a free tier and two paid subscription tiers (Pro and Premium), purchased through the Apple App Store.',
  },
  { type: 'h2', text: 'Pricing' },
  {
    type: 'list',
    items: ['Prices are displayed in your local currency through the App Store and may change with notice; existing subscribers will be notified before renewal at a new price.'],
  },
  { type: 'h2', text: 'Free Trial' },
  {
    type: 'list',
    items: [
      'New subscribers get a 7-day free trial. If not cancelled before the trial ends, the trial automatically converts into a paid subscription and payment begins.',
      'Trial eligibility is determined by Apple and limited to one trial per Apple ID.',
    ],
  },
  { type: 'h2', text: 'Auto-Renewal' },
  {
    type: 'list',
    items: [
      'Subscriptions automatically renew (monthly or annually, depending on the plan you chose) unless cancelled at least 24 hours before the end of the current period.',
      'Your Apple ID account will be charged for renewal within 24 hours prior to the end of the current period.',
      "You can manage or cancel your subscription anytime in your Apple ID account settings, or via the \"Manage subscription\" link in GymSync's Settings. Deleting the App does not cancel your subscription.",
    ],
  },
  { type: 'h2', text: 'Refunds' },
  {
    type: 'list',
    items: ['All purchases are billed and processed by Apple. Refund requests must be submitted through Apple at reportaproblem.apple.com. We do not process refunds directly.'],
  },
  { type: 'h', text: '10. Third-Party Services' },
  {
    type: 'p',
    text: 'GymSync relies on third-party services (Supabase, Anthropic, ElevenLabs, and Apple) to operate, as described in our Privacy Policy. We are not responsible for the accuracy, availability, or performance of these third-party services, and your use of them (to the extent you interact with them directly) is subject to their own terms.',
  },
  {
    type: 'p',
    text: 'These Terms govern the relationship between you and GymSync; they do not alter your relationship with Apple. Apple has no obligation to furnish maintenance or support for the App, and Apple is a third-party beneficiary of these Terms with the right to enforce them against you.',
  },
  { type: 'h', text: '11. Copyright Complaints (DMCA)' },
  {
    type: 'p',
    text: 'If you believe content in GymSync infringes your copyright, send a notice to support@gymsyncapp.me including: (a) identification of the copyrighted work; (b) identification of the allegedly infringing material and its location in the App; (c) your contact information; (d) a statement that you have a good-faith belief the use is unauthorized; (e) a statement, under penalty of perjury, that the notice is accurate and that you are authorized to act on the copyright owner\'s behalf; and (f) your physical or electronic signature. We will respond to properly submitted notices in accordance with applicable law.',
  },
  { type: 'h', text: '12. Termination' },
  {
    type: 'p',
    text: 'We may suspend or terminate your access to GymSync for violating these Terms, or for conduct that we determine is harmful to other users or to us.',
  },
  {
    type: 'p',
    text: 'Upon termination, your license to use the App is revoked and we may delete your account and associated data. You may terminate your use at any time by deleting your account and the App.',
  },
  { type: 'h', text: '13. Disclaimer of Warranties' },
  {
    type: 'p',
    text: 'GYMSYNC IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
  },
  {
    type: 'p',
    text: 'We do not warrant that the App will be uninterrupted, error-free, or secure, that defects will be corrected, or that AI-generated coaching content, workout plans, or transcriptions will be accurate or suitable for your specific circumstances. You assume all risk arising from your use of, or inability to use, the App.',
  },
  {
    type: 'p',
    text: 'Some jurisdictions do not allow the exclusion of certain warranties, so some of the above exclusions may not apply to you.',
  },
  { type: 'h', text: '14. Limitation of Liability; Indemnification' },
  { type: 'h2', text: 'Limitation of Liability' },
  {
    type: 'p',
    text: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, YOSHIHARU NISHIKAWAHARA SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING BUT NOT LIMITED TO PERSONAL INJURY, LOSS OF DATA, OR LOSS OF PROFITS — ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF GYMSYNC, INCLUDING YOUR USE OF ANY WORKOUT PLAN OR COACHING GUIDANCE IT PROVIDES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
  },
  {
    type: 'p',
    text: 'OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE APP SHALL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR $50 USD.',
  },
  {
    type: 'p',
    text: 'Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above limitations may not apply to you.',
  },
  { type: 'h2', text: 'Indemnification' },
  {
    type: 'p',
    text: 'You agree to indemnify, defend, and hold harmless Yoshiharu Nishikawahara from any claim, demand, loss, or damages (including reasonable legal fees) arising out of or related to: (a) your User Content; (b) your use of GymSync; (c) your violation of these Terms; or (d) your violation of any right of a third party. We reserve the right to assume the exclusive defense of any matter otherwise subject to indemnification by you, in which case you agree to cooperate with our defense.',
  },
  { type: 'h', text: '15. Dispute Resolution; Binding Arbitration; Class Action Waiver' },
  {
    type: 'p',
    text: 'Please read this section carefully. It affects your legal rights, including your right to file a lawsuit in court or to have a jury hear your dispute.',
  },
  { type: 'h2', text: 'Informal Resolution First' },
  {
    type: 'p',
    text: 'Before filing any arbitration claim, you agree to first contact us at support@gymsyncapp.me and attempt in good faith to resolve the dispute informally for at least 30 days.',
  },
  { type: 'h2', text: 'Agreement to Arbitrate' },
  {
    type: 'p',
    text: 'If a dispute is not resolved informally, you and GymSync agree that any dispute, claim, or controversy arising out of or relating to these Terms or your use of GymSync will be resolved by binding individual arbitration under the Federal Arbitration Act, administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules, rather than in court — except that either party may bring an individual claim in small claims court.',
  },
  { type: 'h2', text: 'Class Action and Jury Trial Waiver' },
  {
    type: 'p',
    text: 'You and GymSync agree that any arbitration or claim will be conducted only on an individual basis and not as a class, consolidated, or representative action, and both parties waive any right to a jury trial. If the class-action waiver in this paragraph is found unenforceable as to a particular claim, that claim (and only that claim) will proceed in a court of competent jurisdiction in the venue described in Section 16, and both parties still waive any right to a jury trial for that claim.',
  },
  { type: 'h2', text: 'Your Right to Opt Out' },
  {
    type: 'p',
    text: 'You may opt out of this arbitration agreement within 30 days of the date you first agree to these Terms by emailing support@gymsyncapp.me with your name, the email address on your account, and a clear statement that you opt out of arbitration. Opting out does not affect any other part of these Terms.',
  },
  { type: 'h2', text: 'Limitations Period' },
  {
    type: 'p',
    text: 'Any claim arising out of or related to these Terms or GymSync must be filed within one (1) year after the claim first arose, or it is permanently barred.',
  },
  { type: 'h', text: '16. Governing Law' },
  {
    type: 'p',
    text: 'These Terms are governed by the laws of the State of Delaware, USA, and applicable U.S. federal law, without regard to conflict-of-law principles. For any claim not subject to arbitration under Section 15, the state and federal courts located in Delaware will have exclusive jurisdiction, and you consent to personal jurisdiction there.',
  },
  { type: 'h', text: '17. International Use' },
  {
    type: 'p',
    text: 'GymSync is operated from Japan and the United States. If you access GymSync from outside these countries, you do so on your own initiative and are responsible for compliance with local laws, to the extent they apply.',
  },
  { type: 'h', text: '18. Survival' },
  {
    type: 'p',
    text: 'Sections 6 through 18 (Fitness/Health Disclaimer, User Content, Intellectual Property, Subscriptions [to the extent obligations have accrued], Third-Party Services, Copyright Complaints, Termination, Disclaimer of Warranties, Limitation of Liability/Indemnification, Dispute Resolution, Governing Law, International Use, and this Survival section) survive termination of these Terms or your account.',
  },
  { type: 'h', text: '19. Miscellaneous' },
  {
    type: 'list',
    items: [
      { label: 'Entire Agreement', text: 'These Terms (together with our Privacy Policy) are the entire agreement between you and GymSync regarding its subject matter, and supersede any prior agreements.' },
      { label: 'No Waiver', text: 'Our failure to enforce any right or provision is not a waiver of that right or provision.' },
      { label: 'Severability', text: "If any provision of these Terms is found unenforceable, the remaining provisions remain in full effect, and the unenforceable provision will be interpreted to best reflect the parties' intent." },
      { label: 'Assignment', text: 'You may not assign or transfer these Terms without our written consent. We may assign or transfer these Terms without restriction, including in connection with a merger, acquisition, or sale of assets.' },
      { label: 'No Partnership', text: 'Nothing in these Terms creates a partnership, joint venture, employment, or agency relationship between you and GymSync.' },
      { label: 'Notices', text: 'We may provide notices to you via the App or the email address on your account. Notices are deemed received 48 hours after we send them.' },
    ],
  },
  { type: 'h', text: '20. Contact Us' },
  { type: 'p', text: 'If you have questions about these Terms, contact us at:' },
  {
    type: 'list',
    items: [
      { label: 'Email', text: 'support@gymsyncapp.me' },
      { label: 'Developer', text: 'Yoshiharu Nishikawahara' },
      { label: 'Website', text: 'gymsyncapp.me' },
    ],
  },
];
