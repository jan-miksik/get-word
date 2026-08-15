# App Review response — Guideline 2.1 information request

Prepared for the first iOS submission. Replace every `[...]` placeholder before
sending. Do not commit the App Review password to this repository; enter it in
App Store Connect's dedicated **Sign-in information** fields.

## What Apple is asking for

This is an information request, not a report of a specific app bug. The reply
needs both:

1. one recording made on a physical device with the latest public iOS/iPadOS;
2. written answers to all seven questions.

Add the same written information to **App Store Connect → App Review
Information → Notes** for the next submission. Keep the demo credentials valid
for the whole review.

## Recording preflight

- Use the exact submitted/TestFlight build and production backend.
- Use a physical iPhone or iPad running the latest public OS. Show the device
  model and OS version at the start, or state them beside the video link.
- Make a fresh install, or reset the app's camera/photo permissions first, so
  the permission prompts appear in the recording.
- Turn on iOS Screen Recording, then start from the Home Screen and launch Get
  Word. Do not start after authentication.
- Keep passwords, OTP messages, personal photos, notification previews, and
  unrelated personal information out of the recording.
- Make the video/link accessible without requesting access or requiring an
  additional login.
- Confirm before recording that the review account, AI word suggestions, Photo
  Lab, translation, and pronunciation audio all work against production.
- Have a public test list owned by a different test/editor account available so
  the report/block controls can be shown safely.
- Do not delete `play-review@getword.app`. To show a completed deletion, use a
  separate disposable account. If that is impractical, open the deletion
  confirmation for the review account and cancel it, then explain in the reply
  that the final destructive confirmation was omitted to preserve the supplied
  credentials.

## Suggested recording flow

Aim for one clear continuous recording. There is no need to demonstrate every
setting, but all applicable review-sensitive flows should be visible.

1. Briefly show **Settings → General → About** with the physical device model
   and OS version, return to the Home Screen, and launch Get Word.
2. Sign in through the normal Email field with the App Review account. For
   `play-review@getword.app`, the Password field appears instead of the normal
   one-time-code step.
3. If language onboarding appears, choose the known language and learning
   language, then select or create a list.
4. Show the normal study loop: open a card, play pronunciation, reveal the
   answer, mark it known/unknown, and show one short exercise if it appears.
5. Open **Menu → Add words**. Add a harmless sample word manually. Then open
   **Suggest words with AI**, enter a simple situation, review the suggestions,
   select a few, and show the review/save step.
6. Open **Photo Lab** from the camera/photo action. Show the camera and/or photo
   library permission prompt, choose a non-personal sample photo, wait for
   labels, reveal/play one label, and show that selected words can be saved.
7. Open **Menu → Word Lists Editor**. On iPhone open the left sidebar, scroll to
   **Public lists**, and select a list the review account does not own. In the
   list detail, open the three-dot menu beside the detail heading and show
   **Report content** and **Block author**. Open the report dialog to show its
   reason/block controls. Use disposable test content if submitting the report.
8. Open **Menu → Settings → Account → Delete account** and show the deletion
   preview and confirmation requirement. Complete it only with a disposable
   account; otherwise cancel before deleting the persistent review account.
9. If using a disposable account, finish the deletion and show that the app
   returns to the signed-out screen.

There are no purchases, subscriptions, paid content, or App Tracking
Transparency prompts to record in version 1.0.

## English reply for App Store Connect

```text
Hello App Review,

Thank you for your message. Please find all requested information below.

1. PHYSICAL-DEVICE SCREEN RECORDING

Video is in attachment.

The recording was captured on a physical iPhone SE running iOS 26.6, using submitted build [BUILD NUMBER]. It begins with launching Get Word and shows sign-in/account access, the normal vocabulary study flow, pronunciation audio, adding words manually and with AI assistance, Photo Lab and its camera/photo access prompt, public-list reporting and author blocking, and the in-app account-deletion flow.

Get Word has no in-app purchases, subscriptions, paid content, advertising, or App Tracking Transparency prompt.

2. TEST DEVICES AND OPERATING SYSTEMS

- iPhone SE — iOS 26.6


3. FUNCTIONS, TARGET AUDIENCE, PROBLEM, AND VALUE

Get Word is a vocabulary-learning app for language learners at any level, including students, travelers, and people preparing for everyday or work situations. Users choose the words and phrases relevant to them instead of following only a fixed course. They can enter words manually, ask the AI-assisted word chat for suggestions based on a real situation, use a prepared list, or use Photo Lab to label objects in a photo. The app prepares translations and pronunciation audio and schedules later reviews using spaced repetition. Users can also add memory aids, complete short exercises, manage vocabulary lists, and sync their lists, progress, and settings across iPhone, iPad, and the web app.

4. SETUP AND ACCESS INSTRUCTIONS

An internet connection is required for sign-in, initial synchronization, AI assistance, translation, and new audio generation.

Use the username and password supplied in App Store Connect under App Review Information → Sign-in information. On the normal Get Word sign-in screen, enter the supplied review username in the Email field. For this review address, a Password field appears instead of sending the one-time email code. Enter the supplied password and submit.

There is no separate registration form. A normal user account is created on first successful Sign in with Apple or passwordless email-code sign-in. The reusable password flow exists only for the App Review account and is presented within the same regular sign-in screen.

If language onboarding is shown, select a language the user knows and a language to learn, then select a prepared list or add personal words. No sample file is required. Photo Lab can use any ordinary non-sensitive photo selected from the library or taken with the camera.

Main-feature navigation:
- Study: the initial screen after sign-in; reveal a card, play its audio, and mark the answer known or unknown.
- Add words: Menu → Add words. Manual entry is shown first; tap “Suggest words with AI bot” for AI suggestions. The user reviews and selects suggestions before saving.
- Photo Lab: tap “Add words from a photo” / the photo action, then take or choose a photo.
- Public-content safety: Menu → Word Lists Editor → open the left sidebar on iPhone → Public lists → select a list not owned by the review account → three-dot menu beside the detail heading → Report content or Block author.
- Account deletion: Menu → Settings → Account → Delete account.

User-created lists are private and may be shared with named recipients by link. Ordinary users cannot publish unreviewed lists to the public library. Public lists are editor-owned/reviewed, and the app still provides reporting and author-blocking controls.

5. EXTERNAL SERVICES, TOOLS, AND PLATFORMS

- Apple Sign in with Apple: native account authentication.
- Supabase: passwordless email authentication and managed PostgreSQL storage for accounts, vocabulary lists, learning progress, and settings.
- Vercel: hosting and server/API runtime for Get Word.
- OpenRouter: AI-assisted word suggestions, some translation workflows, and Photo Lab image analysis. Users review generated vocabulary before saving it.
- Google Cloud Translation and Text-to-Speech: translations and pronunciation audio.
- Backblaze B2 and Arweave: storage and delivery of generated/shared pronunciation audio. Audio is content-addressed and is not linked publicly to an account.

Photo Lab sends a downscaled selected image to the AI provider for analysis. Photo history and image blobs are stored locally on the device; Get Word does not retain the original photos on its servers.

6. REGIONAL DIFFERENCES

The app functions consistently in all regions where it is distributed. There are no region-locked features, region-specific payments, or different content policies. The interface and learning content vary only according to the user’s selected interface language and language pair, not the user’s geographic region. Internet access and availability of the listed external services are required for online features.

7. REGULATED INDUSTRY / PROTECTED THIRD-PARTY MATERIAL

Get Word is an education/vocabulary app. It does not provide a regulated service or professional medical, financial, or legal advice. It does not include protected third-party material that requires authorization. No additional licenses or professional credentials are applicable.

Support: https://getword.app/support
Privacy Policy: https://getword.app/privacy
Terms of Use: https://getword.app/terms

Please let us know if any additional information is required.
```

## Compact Review Notes for this and future submissions

This version keeps the durable review information compact. Replace the four
placeholder groups and paste it into **App Review Information → Notes**. Keep
the credentials in the separate Sign-in information fields.

```text
PHYSICAL-DEVICE VIDEO
[PUBLIC VIDEO URL OR “ATTACHED IN RESOLUTION CENTER”]
Recorded on physical iPhone SE, iOS 26.6, build [BUILD]. It begins with app launch and shows sign-in, study/review and audio, manual and AI-assisted word entry, Photo Lab plus camera/photo access, public-list report/block controls, and account deletion. No IAP, subscription, paid content, ads, or ATT prompt exists.

TESTED DEVICES
iPhone SE — iOS 26.6
[PHYSICAL DEVICE + OS]

PURPOSE AND AUDIENCE
Get Word is for language learners at any level, including students, travelers, and people preparing for everyday/work situations. Users build relevant vocabulary by manual entry, AI-assisted suggestions, prepared lists, or labels generated from a photo. The app provides translation, pronunciation, short exercises, memory aids, spaced-repetition scheduling, list management, and progress/settings sync across iPhone, iPad, and web.

ACCESS
Use the credentials in App Review Information → Sign-in information. Enter the review username in the regular Email field; for this address a Password field appears instead of the usual email OTP. There is no separate registration form: first successful Sign in with Apple or passwordless email sign-in creates the account. If onboarding appears, choose known and target languages, then a prepared list or personal words. No sample file is needed; Photo Lab accepts any ordinary photo. Internet is required for sign-in, initial sync, AI, translation, and new audio generation.

Paths: Study opens after sign-in. Add words: Menu → Add words; AI: Suggest words with AI bot. Photo Lab: Add words from a photo/photo action. Report/block: Menu → Word Lists Editor → on iPhone open sidebar → Public lists → choose a list not owned by the reviewer → detail-heading three-dot menu → Report content / Block author. Delete: Menu → Settings → Account → Delete account.

Ordinary users' lists are private and may be shared by link, but cannot be published unreviewed. Public lists are editor-owned/reviewed and still include report/block controls.

EXTERNAL SERVICES
Apple Sign in with Apple (authentication); Supabase (email auth and managed PostgreSQL account/learning data); Vercel (hosting/API runtime); OpenRouter (AI word suggestions, some translations, Photo Lab analysis); Google Cloud Translation and Text-to-Speech; Backblaze B2 and Arweave (generated/shared pronunciation audio storage/delivery). Photo Lab sends a downscaled selected image to the AI provider. Photo history/image blobs stay local; original photos are not retained on Get Word servers.

REGIONS
Features and policies are consistent in all distributed regions. There are no region locks or regional payments. UI/content varies only by selected interface language and learning pair. Online features require internet/provider availability.

REGULATION / RIGHTS
Get Word is an education/vocabulary app, not a regulated service and not professional medical, financial, or legal advice. It contains no protected third-party material requiring authorization; no additional credentials are applicable.

Support: https://getword.app/support
Privacy: https://getword.app/privacy
Terms: https://getword.app/terms
```

## Before sending

- Replace the video, device, OS, and build placeholders.
- List only physical devices and OS versions that were genuinely tested.
- Remove the bracketed deletion paragraph or choose the version that matches
  the recording.
- Put `play-review@getword.app` and its current password in the dedicated
  sign-in fields. Verify the password immediately before replying.
- Check that the video link works in a private browser window without login.
- Paste the English response into the Resolution Center reply. Put the same
  durable product/access/service/region information in Review Notes for the
  next build; update the build number and test-device list each submission.
