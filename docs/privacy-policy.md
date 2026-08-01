# Privacy Policy for GymSync

**Effective Date:** August 1, 2026
**Last Updated:** August 1, 2026

Yoshiharu Nishikawahara ("we," "our," or "us") built GymSync as a freemium fitness coaching app. This Privacy Policy explains how we collect, use, and protect your information when you use GymSync.

By using GymSync, you agree to the practices described in this Privacy Policy. If you do not agree, please do not use the app.

---

## 1. Information We Collect

### Information You Provide Directly

- **Account information:** When you create an account, we collect your email address and password (handled by our authentication provider, Supabase — we never see your password in plain text).
- **Profile information:** Your display name, age, sex, and body statistics you choose to enter (used only to calculate your coaching math — calorie needs, recovery, and training load), and, if you choose to set one, a profile picture selected from your photo library.
- **Workout data:** The workout plans, exercises, sets, reps, weights, and body-weight logs you create or record in the app.
- **Coach conversations:** The messages you send to your AI coach, and any voice audio captured during a live voice coaching session.
- **Support requests:** If you contact us for support, we collect your email address and the content of your message.

### Information Collected Automatically

- **Device information:** We may collect basic device and app version information for compatibility and debugging purposes.
- **Crash reports:** When the app or our server hits an unexpected error, we send a diagnostic report to Sentry (see Section 4). A report contains the error, where in the code it happened, your device and app version, and your account ID — so we can tell one user hitting a bug ten times from ten users hitting it once. It does not contain your messages to the coach, your voice audio, your password, or your login tokens.

GymSync does not use third-party analytics or advertising SDKs, does not use cookies or cross-device ad tracking, and does not show ads. Crash reporting is not analytics: it records failures, not what you do in the app. If this changes in a future version, this Policy will be updated first.

### Information from Third Parties

GymSync offers **Sign in with Apple** and **Sign in with Google**. If you use either, we receive the email address and name that provider chooses to share with us — with Sign in with Apple, that may be a private relay address rather than your real one, and that is entirely your choice at the point of sign-in. We never receive your Apple or Google password. We do not import your contacts, friends, or any other data from those accounts.

GymSync has no public forums, community feed, or user-to-user messaging — your workout data and coach conversations are private to your account. If this changes, this Policy will be updated before the feature ships.

---

## 2. How We Use Your Information

We use the information we collect to:

- Provide and maintain GymSync's core functionality — your account, your workout plans, and your training history
- Power the AI coach: generating chat replies, spoken coaching, and personalized workout guidance based on your conversation and training history
- Convert your speech to text during live voice coaching sessions, and your coach's text replies to spoken audio
- Respond to your support requests
- Fix bugs and improve the app

We do NOT use your information to:

- Sell your data to third parties
- Build advertising profiles
- Show you ads
- Make any fully-automated decision that denies you access to the service or affects your legal rights without the ability to reach a human by contacting support

---

## 3. How We Share Your Information

We do not sell, rent, or trade your personal information.

We share information only in these circumstances:

- **Service providers:** With the third parties listed in Section 4, solely to operate the app. They may only use your data to perform services for us.
- **Legal requirements:** If required by law, subpoena, or other legal process, or to protect the rights, property, or safety of GymSync, our users, or the public.
- **Business transfers:** If GymSync is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change and any choices you may have.

---

## 4. Third-Party Services

GymSync uses the following third-party services to operate:

| Service | Purpose | Privacy Policy |
|---------|---------|----------------|
| Supabase | Account authentication and database storage for your profile, plans, and training history | [Supabase Privacy Policy](https://supabase.com/privacy) |
| Anthropic (Claude) | Processes your coach conversations and workout data to generate AI coaching replies and plans | [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy) |
| Deepgram | **Receives your voice audio** during a live voice coaching session and converts it to text, and converts your coach's text replies back into spoken audio | [Deepgram Privacy Policy](https://deepgram.com/privacy) |
| ElevenLabs | A backup voice provider, used only if Deepgram is unavailable when generating your coach's spoken replies | [ElevenLabs Privacy Policy](https://elevenlabs.io/privacy) |
| Apple (on-device Speech framework) | Converts speech to text when you dictate a chat message using the microphone button. This runs on your device — dictated audio is not sent to us or to Deepgram | [Apple Privacy Policy](https://www.apple.com/legal/privacy/) |
| Sentry | Receives crash and error reports, as described in Section 1 | [Sentry Privacy Policy](https://sentry.io/privacy/) |
| Apple (Sign in with Apple) | Authenticates you if you choose to sign in with your Apple account | [Apple Privacy Policy](https://www.apple.com/legal/privacy/) |
| Google (Sign in with Google) | Authenticates you if you choose to sign in with your Google account | [Google Privacy Policy](https://policies.google.com/privacy) |
| Apple App Store | Processes subscription payments; Apple, not GymSync, handles your payment details | [Apple Privacy Policy](https://www.apple.com/legal/privacy/) |

Voice audio captured during a coaching session is transcribed to text and is not retained as audio beyond what's needed to complete that session.

### AI-Generated Content

Some content you see in GymSync — coaching replies, generated workout plans, and spoken coaching — is generated using artificial intelligence based on the data described above. AI-generated content may occasionally be inaccurate; see the "AI and Coaching Disclaimer" in our [Terms of Service](./terms-of-service.md) for details.

---

## 5. International Data Transfers

GymSync's service providers (Supabase, Anthropic, Deepgram, ElevenLabs, and Sentry) operate servers in the United States. If you are located outside the United States, using GymSync means your personal information — including workout and coaching data — is transferred to and processed in the United States, which may have different data protection laws than your home country. We require our service providers to protect your data under contractual safeguards.

---

## 6. Data Retention

- **Account and training data:** Retained while your account is active.
- **Account deletion:** GymSync includes an in-app "Delete account" action (Settings → Account settings). Deleting your account immediately and permanently erases your profile, plans, training history, and coach conversations from our systems. This cannot be undone.
- **Voice audio:** Not retained beyond the live session it was captured in.
- **Support correspondence:** Retained as long as reasonably necessary to resolve your request and for our records, then deleted.

---

## 7. Data Security

We implement reasonable technical measures to protect your information, including:

- Encryption in transit (TLS/HTTPS) for all network communications
- Authentication and access controls provided by Supabase
- Access limited to what's needed to operate the app

No method of transmission or storage is 100% secure, and we cannot guarantee absolute security. If we become aware of a data breach affecting your personal information, we will notify you and any applicable regulator without undue delay, as required by applicable law.

---

## 8. Your Rights

Regardless of where you live, you may:

- **Access** the personal data we hold about you
- **Correct** inaccurate data (most of this you can edit directly in the app)
- **Delete** your data, immediately and permanently, via Settings → Account settings → Delete account, or by contacting us
- **Withdraw consent** for processing at any time by deleting your account
- **Appeal** a decision we make about your rights request by replying to our response with "APPEAL" in the subject line

To exercise any of these rights, contact us at support@gymsyncapp.me. We will respond within 30 days.

### For Users in Japan

GymSync is operated by an individual developer based in Japan. In accordance with Japan's Act on the Protection of Personal Information (APPI):

- **Purpose of use:** Your personal information is used solely for the purposes described in Section 2 of this Policy.
- **Cross-border transfer:** Because we use overseas service providers (Supabase, Anthropic, Deepgram, ElevenLabs, and Sentry, all of which process data on servers located outside Japan), your personal information is transferred to and processed in other countries, including the United States. By using GymSync, you consent to this transfer.
- **Disclosure, correction, and deletion:** You have the right to request disclosure of, correction to, or deletion of your personal information. Contact us at support@gymsyncapp.me to make a request.
- **Complaints:** If you believe your rights under APPI have not been respected, you may contact Japan's Personal Information Protection Commission (個人情報保護委員会), or reach out to us directly first so we can address your concern.

### For California Residents (CCPA)

As a matter of practice, regardless of whether the CCPA's thresholds apply to us:

- **Categories collected:** Identifiers (email, user ID), account credentials, and the fitness/health-adjacent information described in Section 1 (training data, coach conversations, voice audio, body statistics).
- **Sources:** Directly from you.
- **Purpose:** Solely to operate the App's coaching features, as described in Section 2. We do not use this information for cross-context behavioral advertising.
- We do not sell or share your personal information, and do not use targeted-advertising cookies or trackers.
- You may request to know what personal information we hold about you, request its deletion, or request correction, by contacting support@gymsyncapp.me.
- We will not discriminate against you (e.g., by degrading service or charging a different price) for exercising these rights.

---

## 9. Children's Privacy

GymSync is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we discover that we have collected data from a child under 13, we will delete it promptly. If you believe a child has provided us with personal information, please contact us at support@gymsyncapp.me.

---

## 10. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. When we make significant changes, we will update the "Last Updated" date above and post the updated policy at this URL. Continued use of GymSync after changes are posted constitutes acceptance of the updated Privacy Policy.

---

## 11. Contact Us

If you have questions or concerns about this Privacy Policy or our data practices, contact us at:

- **Email:** support@gymsyncapp.me
- **Developer:** Yoshiharu Nishikawahara
- **Website:** https://gymsyncapp.me
