// Extracted from claude-app/pip.html (<script id="pip-legal">). Edit the build, not this copy.
/* Terms of Service and Privacy Policy for Pip.
   - One quiet entry point: a small icon in the top bar of every step, and two items in the opening-page menu.
   - One accessible reader: a native <dialog> (focus trap, Esc to close), tabbed, printable, readable at phone width.
   - Deep links: open the page with #terms or #privacy and the matching document opens.
   Edit the facts in PIP_LEGAL. Everything else below is the text itself. */
(function(){
  "use strict";
  var PIP_LEGAL = window.PIP_LEGAL = {
    product: "Pip",
    /* The legal party. Replace with the LLC's exact legal name once formed, e.g. "Pip Labs LLC, an Idaho limited liability company". */
    owner: "Brayden Scuffham, an individual doing business as Pip",
    ownerShort: "Pip",
    /* FILL THIS IN: the address people write to for privacy requests, opt-outs and notices. */
    email: "[contact email]",
    state: "Idaho",
    county: "Ada County",
    effective: "November 8, 2026",
    version: "1.0"
  };
  var C = PIP_LEGAL, esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); };
  var EMAIL = '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a>';

  /* ======================================================= TERMS OF SERVICE ======================================================= */
  var TERMS = {
    id: "terms", title: "Terms of Service", short: "Terms",
    toc: [["t1","Who we are"],["t2","Who may use Pip"],["t3","What Pip does"],["t4","AI-generated content"],["t5","What you give Pip"],["t6","Pip runs inside Claude"],["t7","Examples"],["t8","The quiz perk"],["t9","Lock it in"],["t10","Ownership"],["t11","Acceptable use"],["t12","Third-party services"],["t13","Privacy"],["t14","Disclaimers"],["t15","Limitation of liability"],["t16","Indemnity"],["t17","Suspension"],["t18","Disputes and arbitration"],["t19","Governing law"],["t20","Changes"],["t21","General terms"],["t22","Contact"]],
    html: function(){ return '' +
    '<div class="pl-intro"><p><strong>The short version.</strong> Pip is a preview. It reads public information about a business, shows what an AI team for that business could look like, and lets the owner ask us to build it. Nothing on this page is a price, a contract, or a promise of results. By using Pip you agree to these Terms. If you don’t agree, please don’t use Pip.</p></div>' +

    '<h3 id="t1">1. Who we are and what these Terms cover</h3>' +
    '<p>Pip (“<strong>Pip</strong>,” “<strong>we</strong>,” “<strong>us</strong>,” “<strong>our</strong>”) is operated by ' + esc(C.owner) + ', based in ' + esc(C.state) + ', United States. These Terms of Service (the “<strong>Terms</strong>”) are a binding agreement between you and us and govern your access to and use of the Pip application, the Pip character and interface, our plan-request form, and any related pages, content, and features we provide (together, the “<strong>Service</strong>”).</p>' +
    '<p>Our <a href="#privacy" data-pl-go="privacy">Privacy Policy</a> explains what information the Service handles and is part of these Terms. These Terms do <em>not</em> cover any AI teammates, software, or services we later build, install, or run for your business. Those are provided only under a separate written agreement that we both sign.</p>' +
    '<p><strong>Please read Section 18.</strong> It contains an arbitration agreement and a class-action waiver that affect how disputes between us are resolved.</p>' +

    '<h3 id="t2">2. Who may use Pip</h3>' +
    '<p>The Service is built for owners and authorized representatives of businesses. To use it you must be at least 18 years old and able to form a binding contract. If you use the Service for a business, you represent that you are authorized to act for that business and to agree to these Terms on its behalf, and “you” includes that business. The Service is intended for use in the United States. We make no representation that it is appropriate or available elsewhere.</p>' +

    '<h3 id="t3">3. What Pip does, and what it does not do</h3>' +
    '<p>Pip is an interactive preview and recommendation tool. When you enter a business website (or describe a business), Pip reads publicly available information about that business and its market, such as the business’s website, its public listing and review summary, and the public websites and listings of nearby businesses that offer similar services. It then presents what it learned, illustrates where that business may be losing customers or time, and proposes a set of AI “teammates” (automations) that we could build for it. You can ask Pip questions, try sample conversations, answer yes/no questions about your business, and send us a request to build your plan.</p>' +
    '<p>Pip <strong>does not</strong> build, install, connect, or operate anything in your business. It does not access your accounts, your systems, or any non-public data. It does not show prices. Submitting a plan request creates no order and no payment obligation. Any engagement, scope, pricing, timeline, and the terms under which AI teammates are built and run for you will be set out in a separate written agreement; if we never sign one, there is no engagement. We may decline any request for any lawful reason.</p>' +

    '<h3 id="t4">4. AI-generated content and the limits of what Pip knows</h3>' +
    '<p>Most of what Pip says, shows, and proposes is generated by an artificial-intelligence model from public information, your inputs, and general assumptions. You acknowledge and agree that:</p>' +
    '<ul>' +
    '<li>AI output can be <strong>incomplete, out of date, or simply wrong</strong>, including statements about your business, your competitors, your ratings, hours, services, and prices. Verify anything you rely on.</li>' +
    '<li>Numbers Pip shows (missed customers, lost hours, dollar figures, “likely” and “at least” ranges, calendars of lost jobs, and similar) are <strong>illustrative estimates</strong> built from public signals and category averages. They are not measurements, forecasts, guarantees, or representations about what any AI teammate will earn or save you.</li>' +
    '<li>Comparisons to other businesses reflect what was publicly visible at a moment in time and may be inaccurate. We do not make, and Pip does not make, factual claims about the quality or conduct of any other business.</li>' +
    '<li>Pip’s descriptions of what a proposed AI teammate “can” or “will” do describe design intent. Whether, how, and when anything is built is governed only by a separate signed agreement.</li>' +
    '<li>Nothing Pip produces is legal, financial, tax, insurance, medical, employment, marketing-compliance, or other professional advice. Rules that may apply to automations (for example, telephone and text-message consent laws, call-recording consent, AI-disclosure rules, email marketing rules, health-privacy rules, and licensing rules) vary by place and industry; you are responsible for your own compliance, and Pip’s mentions of such rules are general information only.</li>' +
    '</ul>' +

    '<h3 id="t5">5. What you give Pip, and your authority to give it</h3>' +
    '<p>You may enter a website, describe a business, paste review text, answer questions, type messages, and provide contact details (“<strong>Inputs</strong>”). You agree that:</p>' +
    '<ul>' +
    '<li>You will only ask Pip to study a business that you own, work for with authority, or that you are otherwise entitled to research using public information. Pip reads only publicly available pages and listings.</li>' +
    '<li>Your Inputs are accurate to your knowledge and you have the right to provide them. Do not type passwords, payment card numbers, government ID numbers, patient or client records, or other sensitive personal information about anyone into Pip. Pip’s free-text fields are not designed for that.</li>' +
    '<li>You grant us a non-exclusive, worldwide, royalty-free license to use, store, reproduce, and process your Inputs, and the information Pip gathers about the business you named, to operate and improve the Service, to prepare and send you a proposal and pricing, to communicate with you, and to build and support any engagement we later agree to. We may also use de-identified or aggregated information for any purpose. You keep ownership of your Inputs and your business’s names, logos, and content.</li>' +
    '<li>If you display your business’s logo or brand colors inside Pip, that is only to personalize your own session; it is not an endorsement and we claim no rights in your marks.</li>' +
    '</ul>' +

    '<h3 id="t6">6. Pip runs inside Claude</h3>' +
    '<p>The Service is published as an application on Anthropic’s Claude platform (claude.ai). Pip’s AI features run through the Claude account <em>you</em> are signed into when you open the page, and your use of them counts against <em>your</em> Claude plan’s usage, not ours. Some reading features use a connector (“PIP Reader”) or Claude’s browser that Claude may ask you to allow the first time. Anthropic’s own terms and privacy policy apply to your Claude account and to how Anthropic handles content processed through it. We do not control Anthropic, cannot see your Claude account, and are not responsible for its availability, limits, outages, or policies. If Claude features are unavailable, parts of Pip will not work.</p>' +

    '<h3 id="t7">7. Examples and sample businesses</h3>' +
    '<p>Pip may show examples (for instance, a plumber or a dentist) built from publicly available information about real businesses. Those examples are illustrations of what Pip can do. The businesses shown are not our clients unless we say so, have not endorsed Pip, and are not responsible for anything Pip shows. If you represent a business shown in an example or a comparison and would like it removed or corrected, contact us at ' + EMAIL + ' and we will respond promptly.</p>' +

    '<h3 id="t8">8. The quiz perk</h3>' +
    '<p>While Pip studies a business, you may be offered a short quiz. These rules apply to any perk it offers:</p>' +
    '<ul>' +
    '<li>Each correct answer earns 1% off, up to a maximum of 5%, applied to the <strong>first month (or first billing period) only</strong> of an engagement we later agree to in writing with the business studied in that session.</li>' +
    '<li>The perk is <strong>held for 7 days</strong> from when it is earned. To use it, submit your plan request within that window; we will confirm the percentage in your pricing email. A perk is void if it is not confirmed in writing by us.</li>' +
    '<li>One perk per business. It has no cash value, cannot be transferred, sold, or combined with any other offer unless we say so in writing, and does not apply to hardware, third-party fees, or pass-through costs.</li>' +
    '<li>We may withdraw or modify the perk at any time before it is confirmed in writing, and may void any perk obtained through automation, repeated attempts, or other abuse.</li>' +
    '</ul>' +

    '<h3 id="t9">9. “Lock it in” and plan requests</h3>' +
    '<p>Pressing “Lock it in” sends us your name, contact details, the times you picked, your message, and a summary of the plan you assembled. It is a request for a proposal, not an order. No payment is taken and no commitment is created on either side. We aim to reach out within one business day but do not guarantee any response time. You consent to our contacting you by the email and phone number you provide about your request, and you can tell us to stop at any time.</p>' +

    '<h3 id="t10">10. Ownership and license</h3>' +
    '<p>The Service, including the Pip character and its name, animations, artwork, interface, text, code, data compilations, teammate concepts, plans, proposals, and all related intellectual-property rights, belongs to us or our licensors and is protected by copyright, trademark, and other laws. Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable license to use the Service for its intended purpose: evaluating an AI team for your business. You may not copy, modify, distribute, sell, lease, scrape, reverse-engineer, extract the prompts or logic of, or create derivative works from the Service except as the law expressly allows. If you send us ideas or feedback, you grant us a perpetual, irrevocable, royalty-free license to use them without obligation to you.</p>' +

    '<h3 id="t11">11. Acceptable use</h3>' +
    '<p>You agree not to, and not to help anyone else to:</p>' +
    '<ul>' +
    '<li>use the Service to research, impersonate, harass, defame, or gain unauthorized information about any person or business, or to submit a business you have no right to submit;</li>' +
    '<li>enter false contact details, or details belonging to someone else without their permission;</li>' +
    '<li>use bots, scripts, or automated means to access the Service, run it repeatedly, or harvest its outputs;</li>' +
    '<li>probe, disable, overload, or interfere with the Service, its security, or the services it relies on;</li>' +
    '<li>attempt to extract system prompts, model instructions, or source code, or to make Pip behave outside its purpose;</li>' +
    '<li>use the Service in a way that violates any law or the rights of others, or to build a competing product.</li>' +
    '</ul>' +

    '<h3 id="t12">12. Third-party services and links</h3>' +
    '<p>The Service relies on third-party platforms and may link to third-party websites (including the business and competitor websites it reads). We are not responsible for third-party content, services, availability, or practices. The Privacy Policy lists the service providers that process information for Pip. Your dealings with any third party are between you and them.</p>' +

    '<h3 id="t13">13. Privacy</h3>' +
    '<p>Our <a href="#privacy" data-pl-go="privacy">Privacy Policy</a> describes the information the Service collects, how it is used and shared, where it is stored, and your choices. By using the Service you acknowledge that policy.</p>' +

    '<h3 id="t14">14. Disclaimers</h3>' +
    '<p class="pl-caps">THE SERVICE AND EVERYTHING IT PRODUCES ARE PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED OR ERROR-FREE OPERATION. WE DO NOT WARRANT THAT ANY INFORMATION, ESTIMATE, COMPARISON, OR RECOMMENDATION IS CORRECT, THAT ANY AI TEAMMATE WILL BE BUILT OR WILL PERFORM AS DESCRIBED, OR THAT USING THE SERVICE WILL PRODUCE ANY BUSINESS RESULT. YOU USE THE SERVICE AT YOUR OWN RISK. SOME JURISDICTIONS DO NOT ALLOW CERTAIN WARRANTY EXCLUSIONS, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.</p>' +

    '<h3 id="t15">15. Limitation of liability</h3>' +
    '<p class="pl-caps">TO THE FULLEST EXTENT PERMITTED BY LAW, WE AND OUR OWNERS, CONTRACTORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL, OR DATA, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF ONE HUNDRED U.S. DOLLARS ($100) OR THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM. THESE LIMITS ARE A FUNDAMENTAL PART OF OUR AGREEMENT AND APPLY EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.</p>' +

    '<h3 id="t16">16. Indemnity</h3>' +
    '<p>You will defend, indemnify, and hold harmless us and our owners, contractors, and service providers from any claims, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to your Inputs, your use of the Service, your violation of these Terms, your violation of any law or third-party right, or any business you asked Pip to study without authority.</p>' +

    '<h3 id="t17">17. Suspension and termination</h3>' +
    '<p>We may suspend or terminate your access to the Service at any time, with or without notice, including if we believe you have violated these Terms. You may stop using the Service at any time. Sections that by their nature should survive (including 4, 5, 10, and 13 through 21) survive termination.</p>' +

    '<h3 id="t18">18. Disputes: notice first, then arbitration</h3>' +
    '<p><strong>Talk to us first.</strong> Before starting any formal proceeding, you agree to send a written description of the dispute to ' + EMAIL + ' and to try in good faith to resolve it with us for at least 30 days. We will do the same.</p>' +
    '<p><strong>Binding arbitration.</strong> If we cannot resolve it, any dispute, claim, or controversy arising out of or relating to the Service or these Terms (including their formation, interpretation, or enforceability) will be resolved by binding individual arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules (or, if applicable, its Consumer Arbitration Rules), before a single arbitrator. The arbitration will take place in ' + esc(C.county) + ', ' + esc(C.state) + ', or by video or telephone at either party’s request. The Federal Arbitration Act governs this Section. The arbitrator may award the same individual relief a court could, and judgment on the award may be entered in any court with jurisdiction.</p>' +
    '<p><strong>Class-action waiver.</strong> You and we agree that disputes will be brought only on an individual basis and not as a plaintiff or class member in any purported class, collective, or representative action. The arbitrator may not consolidate claims or preside over any form of representative proceeding. If this waiver is found unenforceable for a particular claim, that claim (and only that claim) will be heard in court under Section 19, not in arbitration.</p>' +
    '<p><strong>Exceptions.</strong> Either party may bring an individual claim in small-claims court if it qualifies, and either party may seek injunctive or other equitable relief in court to protect its intellectual property or to stop unauthorized use of the Service.</p>' +
    '<p><strong>Opt-out.</strong> You may opt out of this arbitration agreement by emailing ' + EMAIL + ' with the subject line “Arbitration opt-out,” your name, and the business you used Pip for, within 30 days after you first use the Service. Opting out does not affect any other part of these Terms.</p>' +

    '<h3 id="t19">19. Governing law and venue</h3>' +
    '<p>These Terms and any dispute are governed by the laws of the State of ' + esc(C.state) + ' and applicable U.S. federal law, without regard to conflict-of-laws rules. For any matter not subject to arbitration, you and we consent to the exclusive jurisdiction and venue of the state and federal courts located in ' + esc(C.county) + ', ' + esc(C.state) + ', and waive any objection to that venue.</p>' +

    '<h3 id="t20">20. Changes to the Service and these Terms</h3>' +
    '<p>Pip is new and changes often. We may change, suspend, or discontinue any part of the Service at any time. We may also update these Terms; when we do, we will change the “Effective” date and, for material changes, make a reasonable effort to notify you (for example, in the Service or by email if we have it). Your continued use after a change means you accept the updated Terms.</p>' +

    '<h3 id="t21">21. General terms</h3>' +
    '<ul>' +
    '<li><strong>Entire agreement.</strong> These Terms and the Privacy Policy are the entire agreement between you and us about the Service and supersede any prior understandings. A separate signed engagement agreement controls over these Terms for the services it covers.</li>' +
    '<li><strong>Severability.</strong> If any provision is held unenforceable, it will be enforced to the maximum extent permitted and the rest remains in effect.</li>' +
    '<li><strong>No waiver.</strong> Our failure to enforce a provision is not a waiver of it.</li>' +
    '<li><strong>Assignment.</strong> You may not assign these Terms without our written consent. We may assign them to an affiliate or a successor, including a company we form to operate Pip.</li>' +
    '<li><strong>Force majeure.</strong> We are not liable for delays or failures caused by events beyond our reasonable control, including outages of the platforms Pip relies on.</li>' +
    '<li><strong>Electronic communications.</strong> You agree to receive notices and communications from us electronically, and that electronic agreements and signatures satisfy any legal writing requirement.</li>' +
    '<li><strong>Export and sanctions.</strong> You will not use the Service in violation of U.S. export-control or sanctions laws.</li>' +
    '<li><strong>Headings</strong> are for convenience only.</li>' +
    '</ul>' +

    '<h3 id="t22">22. Contact</h3>' +
    '<p>Questions about these Terms: ' + EMAIL + '.</p>'; }
  };

  /* ======================================================= PRIVACY POLICY ======================================================= */
  var PRIVACY = {
    id: "privacy", title: "Privacy Policy", short: "Privacy",
    toc: [["p1","Overview"],["p2","Information you give Pip"],["p3","Information collected automatically"],["p4","Public information about businesses"],["p5","How we use information"],["p6","AI processing through Claude"],["p7","Who we share with"],["p8","How long we keep it"],["p9","Your choices and rights"],["p10","Children"],["p11","Security"],["p12","Do Not Track and GPC"],["p13","Where it is processed"],["p14","Changes"],["p15","Contact"]],
    html: function(){ return '' +
    '<div class="pl-intro"><p><strong>The short version.</strong> Pip reads <em>public</em> information about a business and processes what you type through the Claude account you are signed into. Your answers and drafts stay in your own browser until you press “Lock it in”; that is the moment your name and contact details are sent to us. We do not sell personal information and we do not run advertising trackers.</p></div>' +

    '<h3 id="p1">1. Overview</h3>' +
    '<p>This Privacy Policy explains how ' + esc(C.owner) + ' (“<strong>Pip</strong>,” “<strong>we</strong>,” “<strong>us</strong>”) collects, uses, shares, and protects information when you use the Pip application, our plan-request form, and related pages (the “<strong>Service</strong>”). It does not cover any AI teammates or software we later build or run for a business; those are covered by the separate agreement and privacy terms for that engagement. Capitalized terms not defined here have the meaning given in our <a href="#terms" data-pl-go="terms">Terms of Service</a>.</p>' +

    '<h3 id="p2">2. Information you give Pip</h3>' +
    '<table><tr><th>What</th><th>Examples</th></tr>' +
    '<tr><td>Business identifiers</td><td>The website address you enter, or, if there is no website, the business name, a description of what it does, and any review text you paste.</td></tr>' +
    '<tr><td>Your answers</td><td>Yes / no / unsure answers about how the business handles calls, follow-ups, reviews, bookings, and similar; sliders and settings you adjust; teammates you add or remove; quiz answers.</td></tr>' +
    '<tr><td>Messages you type</td><td>Questions to Pip, and messages you type while trying a sample conversation “as a customer.”</td></tr>' +
    '<tr><td>Plan request</td><td>When you press “Lock it in”: your name, phone number, email address, the times you picked for a call, your message, the teammates you chose, the estimate shown, and any quiz perk earned.</td></tr></table>' +
    '<p>Please don’t enter sensitive personal information about yourself or anyone else (health details, government ID numbers, payment card numbers, passwords, or similar). The Service is not designed to receive it.</p>' +

    '<h3 id="p3">3. Information collected automatically</h3>' +
    '<ul>' +
    '<li><strong>Browser storage.</strong> Pip saves small pieces of your session in your browser’s local storage so you can leave and come back: your answers for the business you studied, a draft of the plan form (including any name, phone, and email you typed), a note that a plan was sent (kept 30 days), any quiz perk (kept 7 days), and a flag that Pip has already introduced your team. This stays on your device; we cannot read it unless you send it to us. We do not set tracking cookies.</li>' +
    '<li><strong>Usage events.</strong> Pip records a few anonymous events, such as “plan form opened” or “build form opened,” with the number of teammates chosen, whether a sample business was in use, a random per-visit session code, and a timestamp. No name or contact detail is attached. These are stored in the application’s own database on the Claude platform and help us see which steps people reach.</li>' +
    '<li><strong>Technical data.</strong> Like any web page, the platforms that host and serve Pip (listed in Section 7) automatically receive your IP address, browser type, device information, request times, and similar logs when your browser loads the page, fonts, or data.</li>' +
    '</ul>' +

    '<h3 id="p4">4. Public information about businesses</h3>' +
    '<p>To build its preview, Pip gathers publicly available information about the business you named and about nearby businesses that offer similar services. This can include website pages and the services, hours, phone numbers, and people named on them; logos and brand colors; public business-profile data such as star rating, review count, and hours; and the names and public listings of competitors and the approximate distance between them. Public reviews or web pages may incidentally include the names or words of individuals (owners, staff, reviewers). We use this information only to prepare and present the preview and any resulting proposal. Some examples shown by Pip are built from public information about real businesses that are not affiliated with us.</p>' +
    '<p>If you represent a business that appears in Pip and want it corrected or removed from comparisons, email ' + EMAIL + '.</p>' +

    '<h3 id="p5">5. How we use information</h3>' +
    '<ul>' +
    '<li>To operate the Service: read the business, generate the preview, answer your questions, run sample conversations, and remember your session in your browser.</li>' +
    '<li>To respond to your plan request, prepare a proposal and pricing, honor any quiz perk, and schedule and conduct calls with you.</li>' +
    '<li>To build, deliver, and support an engagement if we both sign an agreement.</li>' +
    '<li>To understand how the Service is used, fix problems, improve it, and develop new features.</li>' +
    '<li>To protect the Service, prevent abuse, enforce our Terms, and comply with law.</li>' +
    '<li>To contact you about your request. We will not add you to marketing lists without your consent, and you can tell us to stop at any time.</li>' +
    '</ul>' +
    '<p>We do not sell personal information, and we do not share it for cross-context behavioral advertising.</p>' +

    '<h3 id="p6">6. AI processing through Claude</h3>' +
    '<p>Pip is published on Anthropic’s Claude platform (claude.ai). Pip’s AI features, including studying the business, writing what Pip says, answering your questions, and running sample conversations, are performed by Anthropic’s Claude models <strong>through the Claude account you are signed into</strong>. That means the business information Pip gathered and the text you type are sent to Anthropic for processing under <strong>your</strong> Claude account, and Anthropic’s own privacy policy and terms govern how it stores, uses, and retains that content (including whether it is used to improve Anthropic’s models, which depends on your Claude account settings). We do not receive your Claude account details or your conversation history with Claude outside of Pip. Some reading steps use a connector (“PIP Reader”) operated by us, or Claude’s built-in browser, to fetch the public pages Pip needs; Claude may ask your permission before the first use.</p>' +

    '<h3 id="p7">7. Who we share information with</h3>' +
    '<p>We share information only as described here:</p>' +
    '<table><tr><th>Recipient</th><th>Why</th></tr>' +
    '<tr><td>Anthropic (Claude)</td><td>Hosts the Pip application and performs AI processing through your Claude account (Section 6); stores the anonymous usage events in the application’s database.</td></tr>' +
    '<tr><td>Our backend providers: Supabase and Vercel</td><td>Run the services that read public websites and listings, assemble the business and competitor data, and return logos and colors. They receive the business website you entered and standard request logs.</td></tr>' +
    '<tr><td>Lovable (plan form host)</td><td>Hosts the page that receives your “Lock it in” submission and delivers it to us. It receives the plan request described in Section 2.</td></tr>' +
    '<tr><td>Google</td><td>Google Fonts serves the typefaces on the page (your browser sends Google a font request with your IP address). Public business-profile data shown in Pip (ratings, review counts, hours) comes from Google’s public listings.</td></tr>' +
    '<tr><td>Voice and other vendors</td><td>If Pip speaks, speech may be generated by a voice provider such as ElevenLabs from Pip’s scripted lines; your own voice is not recorded. We may use email, calendar, and similar tools to reply to your request.</td></tr></table>' +
    '<p>We may also disclose information: to comply with law, a subpoena, or a lawful request; to protect the rights, safety, or property of Pip, our users, or others; in connection with a merger, financing, reorganization, or sale of all or part of our business (including the transfer of Pip to a company we form to operate it); and with your direction or consent. Service providers are permitted to use information only to provide services to us.</p>' +

    '<h3 id="p8">8. How long we keep information</h3>' +
    '<ul>' +
    '<li><strong>In your browser:</strong> until you clear your site data. The “sent” note expires after 30 days and any perk after 7 days on its own.</li>' +
    '<li><strong>Plan requests and our correspondence with you:</strong> for as long as needed to respond and follow up, generally up to 24 months after our last contact, or longer if we enter an agreement, if needed to resolve a dispute, or if the law requires.</li>' +
    '<li><strong>Public business and competitor data</strong> gathered for a preview: cached temporarily to speed up repeat visits and then refreshed or discarded.</li>' +
    '<li><strong>Anonymous usage events:</strong> up to 24 months.</li>' +
    '<li>Content processed by Anthropic is retained according to Anthropic’s policies and your Claude settings.</li>' +
    '</ul>' +

    '<h3 id="p9">9. Your choices and rights</h3>' +
    '<ul>' +
    '<li><strong>Clear your session.</strong> Clearing your browser’s site data for this page removes everything Pip stored on your device.</li>' +
    '<li><strong>Access, correction, deletion, portability.</strong> Email ' + EMAIL + ' to ask what personal information we hold about you, to correct it, to receive a copy, or to have it deleted. We will verify your request (usually by replying to the email address you used) and respond within 45 days, or sooner where the law requires. You may use an authorized agent where the law permits.</li>' +
    '<li><strong>Stop contact.</strong> Reply “stop” to any message from us or email us, and we will stop contacting you about your request.</li>' +
    '<li><strong>Your Claude settings.</strong> Choices about how Anthropic uses content processed through your Claude account are made in your Claude account, not in Pip.</li>' +
    '<li><strong>No discrimination.</strong> We will not treat you differently for exercising a privacy right.</li>' +
    '</ul>' +
    '<p><strong>U.S. state privacy laws.</strong> Residents of states with comprehensive privacy laws (such as California, Colorado, Connecticut, Virginia, Texas, Oregon, and others) may have rights to know, access, correct, delete, and port personal information, to opt out of sales, targeted advertising, and certain profiling, and to appeal a denied request. We do not sell personal information, do not engage in targeted advertising, and do not make legally significant decisions by profiling. To exercise any right, or to appeal a decision, email ' + EMAIL + ' with “Privacy request” in the subject line. We have not sold or shared personal information for cross-context behavioral advertising in the preceding 12 months. The categories of personal information we collect are identifiers and contact details, business and professional information, your written communications and answers, and internet-activity information as described in Sections 2 through 4; we collect them from you, from public sources, and automatically; we use and disclose them for the purposes in Sections 5 and 7.</p>' +
    '<p><strong>Outside the United States.</strong> The Service is intended for U.S. businesses. If you use it from the European Economic Area, the United Kingdom, or elsewhere, our legal bases for processing are performance of a contract or steps at your request (responding to your plan request), our legitimate interests (operating, securing, and improving the Service and presenting public market information), and consent where required. You have the rights described above and may lodge a complaint with your local supervisory authority. Information will be transferred to and processed in the United States, which may not provide the same level of protection as your home country.</p>' +

    '<h3 id="p10">10. Children</h3>' +
    '<p>The Service is for business owners and representatives and is not directed to anyone under 18. We do not knowingly collect personal information from children under 13 (or under 16 where that is the applicable age). If you believe a child has provided us information, email ' + EMAIL + ' and we will delete it.</p>' +

    '<h3 id="p11">11. Security</h3>' +
    '<p>We use reasonable administrative and technical measures to protect information, including encrypted connections (HTTPS), access limited to those who need it, and reputable hosting providers. No method of transmission or storage is completely secure, so we cannot guarantee absolute security. Please do not place sensitive information in Pip’s free-text fields.</p>' +

    '<h3 id="p12">12. Do Not Track and Global Privacy Control</h3>' +
    '<p>Pip does not track you across other websites or over time for advertising, so there is nothing for a “Do Not Track” or Global Privacy Control signal to switch off. Where the law treats such a signal as an opt-out of sale or sharing, we honor it; we do not sell or share personal information in that sense.</p>' +

    '<h3 id="p13">13. Where information is processed</h3>' +
    '<p>We are located in ' + esc(C.state) + ', United States, and our providers process information in the United States. Public information about a business may be read from servers wherever that business hosts its website.</p>' +

    '<h3 id="p14">14. Changes to this policy</h3>' +
    '<p>We may update this Privacy Policy as Pip changes. We will post the new version here with a new “Effective” date and, for material changes, make a reasonable effort to notify you. Your continued use after a change means you accept the updated policy.</p>' +

    '<h3 id="p15">15. Contact</h3>' +
    '<p>' + esc(C.owner) + '<br>' + EMAIL + '</p>'; }
  };

  var DOCS = { terms: TERMS, privacy: PRIVACY };

  /* ======================================================= the reader ======================================================= */
  var dlg = null, cur = "terms";
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function ensureDialog(){
    if (dlg && dlg.isConnected) return dlg;
    dlg = el("dialog", "pl-dlg");
    dlg.setAttribute("aria-labelledby", "pl-title");
    dlg.innerHTML =
      '<div class="pl-head"><div><h2 id="pl-title"></h2><small></small></div>' +
      '<button type="button" class="pl-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="pl-tabs" role="tablist" aria-label="Legal documents">' +
        '<button type="button" role="tab" id="pl-tab-terms" aria-controls="pl-panel" data-tab="terms">Terms of Service</button>' +
        '<button type="button" role="tab" id="pl-tab-privacy" aria-controls="pl-panel" data-tab="privacy">Privacy Policy</button></div>' +
      '<div class="pl-body" id="pl-panel" role="tabpanel" tabindex="0"><div class="pl-doc"></div></div>' +
      '<div class="pl-foot"><span class="pl-eff"></span><span>·</span><a href="#" data-pl-go="" class="pl-other"></a><button type="button" class="pl-print">Print</button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector(".pl-close").addEventListener("click", function(){ dlg.close(); });
    dlg.querySelector(".pl-print").addEventListener("click", function(){ try { window.print(); } catch (e) {} });
    dlg.addEventListener("click", function(e){ if (e.target === dlg) dlg.close(); }); /* click on the backdrop closes */
    dlg.querySelectorAll('[role="tab"]').forEach(function(t){
      t.addEventListener("click", function(){ show(t.dataset.tab, true); });
      t.addEventListener("keydown", function(e){
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = t.dataset.tab === "terms" ? "privacy" : "terms"; show(n, true); dlg.querySelector("#pl-tab-" + n).focus(); }
      });
    });
    dlg.addEventListener("click", function(e){
      var a = e.target.closest("[data-pl-go]"); if (!a) return;
      e.preventDefault(); show(a.dataset.plGo || (cur === "terms" ? "privacy" : "terms"), true);
    });
    dlg.addEventListener("click", function(e){
      var a = e.target.closest('.pl-doc a[href^="#"]'); if (!a || a.dataset.plGo != null) return;
      var id = a.getAttribute("href").slice(1), target = dlg.querySelector("#" + id);
      if (target) { e.preventDefault(); target.scrollIntoView({ block: "start" }); target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
    });
    return dlg;
  }
  function show(which, keepScroll){
    var d = ensureDialog(), doc = DOCS[which] || DOCS.terms; cur = doc.id;
    d.querySelector("#pl-title").textContent = doc.title;
    d.querySelector(".pl-head small").textContent = "Pip · Effective " + C.effective;
    d.querySelectorAll('[role="tab"]').forEach(function(t){ var on = t.dataset.tab === doc.id; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; });
    var toc = '<ul class="pl-toc">' + doc.toc.map(function(x){ return '<li><a href="#' + x[0] + '">' + esc(x[1]) + '</a></li>'; }).join("") + '</ul>';
    d.querySelector(".pl-doc").innerHTML = toc + doc.html();
    d.querySelector(".pl-eff").textContent = "Version " + C.version + " · Effective " + C.effective;
    var other = d.querySelector(".pl-other"), o = doc.id === "terms" ? DOCS.privacy : DOCS.terms;
    other.textContent = "Read the " + o.title; other.dataset.plGo = o.id;
    d.querySelector(".pl-body").scrollTop = 0;
  }
  function open(which){
    var d = ensureDialog();
    if (d.inert) d.inert = false; /* the opening page marks other body children inert; the reader must stay usable */
    show(which || "terms");
    if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } }
    d.querySelector(".pl-close").focus();
  }
  window.PipLegal = { open: open, docs: DOCS, config: C };

  /* ======================================================= the entry points ======================================================= */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="M12 8v5"/><path d="M12 16.2h.01"/></svg>';
  function inject(){
    /* 1. Every step after the opening page: a small icon in the top bar's tool cluster, after the existing icons. */
    document.querySelectorAll("header.p3-top .p3-tools").forEach(function(tools){
      if (tools.querySelector(".pl-btn")) return;
      var b = el("button", "v2-icon pl-btn", ICON);
      b.type = "button"; b.setAttribute("aria-label", "Terms of Service and Privacy Policy"); b.title = "Terms & privacy"; b.setAttribute("aria-haspopup", "dialog");
      b.addEventListener("click", function(){ open("terms"); });
      tools.appendChild(b);
    });
    /* 2. The opening page: two items at the end of its menu. */
    document.querySelectorAll(".ph-menu").forEach(function(menu){
      if (menu.querySelector("[data-pl]")) return;
      var rule = el("i", "ph-rule"); rule.setAttribute("aria-hidden", "true"); menu.appendChild(rule);
      [["terms", "Terms of Service", "§"], ["privacy", "Privacy Policy", "●"]].forEach(function(x){
        var b = el("button", null, '<span class="pl-dot" aria-hidden="true">' + x[2] + '</span><span>' + x[1] + '</span>');
        b.type = "button"; b.setAttribute("role", "menuitem"); b.dataset.pl = x[0];
        b.addEventListener("click", function(){
          menu.hidden = true; var mb = menu.parentElement && menu.parentElement.querySelector(".ph-menu-btn"); if (mb) mb.setAttribute("aria-expanded", "false");
          open(x[0]);
        });
        menu.appendChild(b);
      });
    });
  }
  var queued = false;
  function schedule(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; inject(); }); }
  function start(){
    inject();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    var h = (location.hash || "").replace("#", "").toLowerCase();
    if (h === "terms" || h === "privacy") setTimeout(function(){ open(h); }, 400);
    window.addEventListener("hashchange", function(){ var k = (location.hash || "").replace("#", "").toLowerCase(); if (k === "terms" || k === "privacy") open(k); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
