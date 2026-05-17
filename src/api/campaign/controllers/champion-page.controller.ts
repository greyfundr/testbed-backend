import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CampaignRepository } from '../repository/campaign.repository';
import { CampaignAmplifierService } from '../services/campaign-amplifier.service';
import { Campaign } from '../entities/campaign.entity';

// Public landing page for champion referral URLs:
//   GET /c/:slug              -> generic campaign donate page
//   GET /c/:slug?ref=CODE     -> same page, attributes donation to the
//                                referring champion (amplifier).
//
// Returns a self-contained HTML document — server-renders OG tags so
// rich previews work on WhatsApp / X / Facebook, then loads Paystack
// inline JS in the browser for the actual checkout. No build step,
// no separate web service — the existing testbed-backend Render
// instance serves everything.
//
// VERSION_NEUTRAL + the exclude-from-prefix entry in main.ts mean
// this route is reachable at /c/:slug (not /api/v1/c/:slug).
@Controller({ path: '', version: VERSION_NEUTRAL })
export class ChampionPageController {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly amplifierService: CampaignAmplifierService,
    private readonly config: ConfigService,
  ) {}

  @Get('c/:slug')
  async championPage(
    @Param('slug') slug: string,
    @Query('ref') ref: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // Quick sanity check on slug shape — campaigns store an
    // alphanumeric nanoid(12) here. Reject anything else fast to
    // avoid hitting the DB on bot scans.
    if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) {
      res
        .status(HttpStatus.NOT_FOUND)
        .type('html')
        .send(this.notFoundHtml('Invalid link'));
      return;
    }

    const campaign = await this.campaignRepo.findOne({
      where: { shareSlug: slug },
      relations: ['creator'],
    });
    if (!campaign) {
      res
        .status(HttpStatus.NOT_FOUND)
        .type('html')
        .send(this.notFoundHtml('Campaign not found'));
      return;
    }

    // Resolve the referring champion's display name if a code is
    // supplied. Quietly drop the credit if the code is unknown rather
    // than 404-ing — the page should still render and let visitors
    // donate; only the attribution is lost.
    let championName: string | null = null;
    let referrerCode: string | null = null;
    if (ref && /^[A-Z0-9]{4,16}$/.test(ref)) {
      const amp = await this.amplifierService.getByCode(ref);
      if (amp && amp.campaignId === campaign.id) {
        referrerCode = amp.code;
        const u = (amp as { user?: { firstName?: string; lastName?: string; username?: string } }).user;
        championName =
          [u?.firstName, u?.lastName]
            .filter((s): s is string => !!s && s.length > 0)
            .join(' ')
            .trim() ||
          u?.username ||
          null;
      }
    }

    res
      .status(HttpStatus.OK)
      .type('html')
      .send(this.renderPage(campaign, championName, referrerCode));
  }

  private renderPage(
    campaign: Campaign,
    championName: string | null,
    referrerCode: string | null,
  ): string {
    const title = this.escape(campaign.title);
    const description = this.escape(campaign.description ?? '');
    const heroImage = campaign.images?.[0]?.imageUrl ?? '';
    const target = Number(campaign.target ?? 0);
    const current = Number(campaign.currentAmount ?? 0);
    const progress =
      target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const formatter = new Intl.NumberFormat('en-NG', {
      maximumFractionDigits: 0,
    });
    const raisedLabel = `₦${formatter.format(current)}`;
    const targetLabel = `₦${formatter.format(target)}`;

    const daysLeft = campaign.endDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(campaign.endDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    // Public Paystack key is fed in via env so the secret stays
    // server-side. If not set, the page renders an "unavailable"
    // notice on the donate button instead of crashing the JS.
    const paystackPublicKey =
      this.config.get<string>('PAYSTACK_PUBLIC_KEY') ?? '';
    const apiBase =
      this.config
        .get<string>('APP_BASE_URL')
        ?.replace(/\/$/, '') ?? '';

    const ogTitle = this.escape(`Support ${campaign.title} on GreyFundr`);
    const ogDescription = description.length > 200
      ? `${description.slice(0, 197)}...`
      : description || 'Back this cause on GreyFundr.';
    const ogImage = heroImage;

    const inlineData = JSON.stringify({
      campaignId: campaign.id,
      title: campaign.title,
      paystackPublicKey,
      referrerCode,
      apiBase,
    });

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${ogTitle}</title>
<meta property="og:title" content="${ogTitle}" />
<meta property="og:description" content="${this.escape(ogDescription)}" />
${ogImage ? `<meta property="og:image" content="${this.escape(ogImage)}" />` : ''}
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#161618;line-height:1.4}
.wrap{max-width:520px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ededf2;box-shadow:0 4px 14px rgba(0,0,0,.04)}
.hero{aspect-ratio:16/10;background:#eef0f3 center/cover no-repeat}
.body{padding:18px}
.title{font-size:18px;font-weight:800;margin-bottom:8px;line-height:1.3}
.by{font-size:12px;color:#6b6b73;margin-bottom:16px}
.amount-row{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px}
.raised{font-size:22px;font-weight:800;color:#017981;letter-spacing:-.3px}
.raised-sub{font-size:10.5px;font-weight:600;color:#6b6b73;letter-spacing:.4px;text-transform:uppercase}
.percent{font-size:18px;font-weight:800}
.of{font-size:10.5px;font-weight:600;color:#6b6b73}
.bar{height:10px;background:rgba(1,121,129,.1);border-radius:50px;overflow:hidden}
.fill{height:100%;background:linear-gradient(90deg,#017981,#06a8a8);border-radius:50px;transition:width .6s ease}
.about{margin-top:14px;font-size:13.5px;color:#41414a;white-space:pre-wrap}
.champion-banner{margin-top:16px;padding:12px;border-radius:12px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);font-size:12.5px;color:#9a4814;display:flex;gap:10px;align-items:center}
.champion-banner .icon{width:28px;height:28px;border-radius:50%;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
.section-label{margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.5px;color:#6b6b73;text-transform:uppercase}
.amount-input{margin-top:10px;display:flex;align-items:center;gap:10px;background:#f4f4f7;border-radius:14px;padding:14px 16px;border:1.5px solid transparent;transition:border-color .15s}
.amount-input:focus-within{border-color:#017981;background:#fff}
.amount-input .currency{font-size:16px;font-weight:700;color:#6b6b73}
.amount-input input{flex:1;border:none;outline:none;font-size:18px;font-weight:700;background:transparent;color:#161618;font-family:inherit}
.amount-input input::placeholder{color:#b4b4bc}
.quick{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.quick button{flex:1;min-width:60px;padding:8px 0;border-radius:10px;background:#fff;border:1px solid #ededf2;color:#161618;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.quick button:hover{border-color:#017981;color:#017981}
.field{margin-top:10px}
.field input{width:100%;background:#f4f4f7;border:1.5px solid transparent;border-radius:14px;padding:12px 14px;font-size:14px;font-family:inherit;color:#161618;outline:none;transition:border-color .15s,background-color .15s}
.field input:focus{border-color:#017981;background:#fff}
.field input::placeholder{color:#9b9ba3}
.field.invalid input{border-color:#dc2626;background:#fef2f2}
.toggle{margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f4f4f7;border-radius:12px;cursor:pointer;user-select:none}
.toggle input{display:none}
.toggle .check{width:20px;height:20px;border-radius:6px;background:#fff;border:1.5px solid #c9c9d1;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,border-color .15s}
.toggle .check svg{width:12px;height:12px;color:#fff;opacity:0;transition:opacity .15s}
.toggle input:checked + .check{background:#017981;border-color:#017981}
.toggle input:checked + .check svg{opacity:1}
.toggle .label{font-size:13px;font-weight:600;color:#161618}
.toggle .sub{font-size:11px;color:#6b6b73;font-weight:500;display:block;margin-top:1px}
.hidden{display:none}
.cta{margin-top:18px;width:100%;padding:14px;border-radius:28px;background:#017981;color:#fff;font-weight:700;font-size:15px;border:none;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(1,121,129,.3);transition:transform .1s,opacity .15s}
.cta:hover{transform:translateY(-1px)}
.cta:disabled{opacity:.55;cursor:not-allowed;transform:none}
.cta-sub{display:block;font-size:9px;font-weight:600;letter-spacing:.5px;color:rgba(255,255,255,.85);margin-top:2px;text-transform:uppercase}
.footer{text-align:center;font-size:11px;color:#9b9ba3;margin-top:18px;padding-bottom:24px}
.footer a{color:#017981;text-decoration:none}
.error{margin-top:10px;padding:10px;border-radius:10px;background:#fef2f2;color:#dc2626;font-size:12px;display:none}
.error.show{display:block}
.success{margin-top:10px;padding:14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-size:13px;display:none;text-align:center}
.success.show{display:block}
.success strong{display:block;font-size:15px;font-weight:800;margin-bottom:4px}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="hero" style="background-image:url('${this.escape(heroImage)}')"></div>
    <div class="body">
      <div class="title">${title}</div>
      <div class="by">by ${this.escape(this.creatorName(campaign))}${daysLeft != null ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}</div>

      <div class="amount-row">
        <div>
          <div class="raised">${raisedLabel}</div>
          <div class="raised-sub">raised</div>
        </div>
        <div style="text-align:right">
          <div class="percent">${progress}%</div>
          <div class="of">of ${targetLabel}</div>
        </div>
      </div>
      <div class="bar"><div class="fill" style="width:${progress}%"></div></div>

      ${
        championName
          ? `<div class="champion-banner"><div class="icon">★</div><div><strong>${this.escape(championName)}</strong> is championing this cause. Your donation supports them too.</div></div>`
          : ''
      }

      ${description ? `<div class="about">${this.escape(description)}</div>` : ''}

      <div class="section-label">Donate</div>
      <div class="amount-input">
        <span class="currency">₦</span>
        <input id="amount" type="text" inputmode="numeric" placeholder="0" />
      </div>
      <div class="quick">
        <button data-amt="500">₦500</button>
        <button data-amt="1000">₦1,000</button>
        <button data-amt="2000">₦2,000</button>
        <button data-amt="5000">₦5,000</button>
        <button data-amt="10000">₦10,000</button>
      </div>

      <div class="section-label" style="margin-top:22px">Your details</div>

      <label class="toggle">
        <input id="anon" type="checkbox" />
        <span class="check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span>
          <span class="label">Donate anonymously</span>
          <span class="sub">Your name won't appear on the campaign</span>
        </span>
      </label>

      <div class="field" id="name-field">
        <input id="name" type="text" placeholder="Your full name" autocomplete="name" />
      </div>
      <div class="field">
        <input id="email" type="email" placeholder="Email (for your receipt)" autocomplete="email" />
      </div>
      <div class="field">
        <input id="phone" type="tel" inputmode="tel" placeholder="Phone number" autocomplete="tel" maxlength="15" />
      </div>

      <div class="error" id="error"></div>
      <div class="success" id="success">
        <strong>Thank you for donating!</strong>
        Your contribution to ${this.escape(campaign.title)} was received.
      </div>

      <button class="cta" id="donate-btn" type="button">
        Donate via Paystack
        <span class="cta-sub">Card · Bank · USSD</span>
      </button>
    </div>
  </div>
  <div class="footer">Powered by <a href="https://greyfundr.com" target="_blank" rel="noopener">GreyFundr</a></div>
</div>

<script src="https://js.paystack.co/v1/inline.js"></script>
<script>
(function(){
  var data = ${inlineData};
  var amountInput = document.getElementById('amount');
  var nameInput = document.getElementById('name');
  var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
  var anonToggle = document.getElementById('anon');
  var nameField = document.getElementById('name-field');
  var errorBox = document.getElementById('error');
  var successBox = document.getElementById('success');
  var donateBtn = document.getElementById('donate-btn');

  function fmt(n){ return n.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }

  amountInput.addEventListener('input', function(e){
    var raw = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = raw ? fmt(parseInt(raw, 10)) : '';
  });

  document.querySelectorAll('.quick button').forEach(function(b){
    b.addEventListener('click', function(){
      amountInput.value = fmt(parseInt(b.dataset.amt, 10));
      amountInput.focus();
    });
  });

  // Anonymous toggle hides the name field and clears it. The donor
  // still has to enter email + phone (we need email for the Paystack
  // receipt, phone for follow-up).
  anonToggle.addEventListener('change', function(){
    if (anonToggle.checked){
      nameField.classList.add('hidden');
      nameInput.value = '';
    } else {
      nameField.classList.remove('hidden');
    }
  });

  function showError(msg, badField){
    errorBox.textContent = msg;
    errorBox.classList.add('show');
    document.querySelectorAll('.field.invalid').forEach(function(f){
      f.classList.remove('invalid');
    });
    if (badField){
      var p = badField.closest('.field');
      if (p) p.classList.add('invalid');
      badField.focus();
    }
    setTimeout(function(){ errorBox.classList.remove('show'); }, 5000);
  }

  function isValidEmail(s){
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(s);
  }
  function isValidPhone(s){
    var digits = s.replace(/[^0-9]/g, '');
    // Accept 10-15 digits (NG mobile is 10 or 11 plus optional country code).
    return digits.length >= 10 && digits.length <= 15;
  }

  donateBtn.addEventListener('click', function(){
    if (!data.paystackPublicKey){
      showError('Payment is temporarily unavailable. Please try again later.');
      return;
    }
    var raw = (amountInput.value || '').replace(/[^0-9]/g, '');
    var amount = parseInt(raw, 10);
    if (!amount || amount < 100){
      showError('Enter an amount of at least ₦100.', amountInput);
      return;
    }

    var isAnonymous = !!anonToggle.checked;
    var donorName = (nameInput.value || '').trim();
    var email = (emailInput.value || '').trim();
    var phone = (phoneInput.value || '').trim();

    if (!isAnonymous && donorName.length < 2){
      showError('Please enter your name (or check "Donate anonymously").', nameInput);
      return;
    }
    if (!isValidEmail(email)){
      showError('Please enter a valid email address for your receipt.', emailInput);
      return;
    }
    if (!isValidPhone(phone)){
      showError('Please enter a valid phone number.', phoneInput);
      return;
    }

    // Build a custom_fields list so the details show up nicely in the
    // Paystack dashboard transaction view, alongside the structured
    // metadata our backend reads.
    var customFields = [
      { display_name: 'Donor name', variable_name: 'donor_name', value: isAnonymous ? 'Anonymous' : donorName },
      { display_name: 'Phone', variable_name: 'phone', value: phone },
      { display_name: 'Campaign', variable_name: 'campaign', value: data.title || data.campaignId }
    ];
    if (data.referrerCode){
      customFields.push({ display_name: 'Champion code', variable_name: 'referrer_code', value: data.referrerCode });
    }

    var handler = PaystackPop.setup({
      key: data.paystackPublicKey,
      email: email,
      amount: amount * 100, // kobo
      currency: 'NGN',
      metadata: {
        campaign_id: data.campaignId,
        referrer_code: data.referrerCode || '',
        donor_name: isAnonymous ? '' : donorName,
        phone: phone,
        is_anonymous: isAnonymous,
        source: 'champion_page',
        custom_fields: customFields
      },
      onClose: function(){},
      callback: function(response){
        // Verify on the backend — this is the moment the Donation row
        // is created and the amplifier is credited via referrerCode.
        donateBtn.disabled = true;
        donateBtn.textContent = 'Confirming…';
        fetch(data.apiBase + '/payment/verify/' + response.reference, {
          method: 'GET',
        }).then(function(r){ return r.json(); })
          .then(function(){
            successBox.classList.add('show');
            donateBtn.style.display = 'none';
          })
          .catch(function(){
            showError("We couldn't confirm your payment automatically. If you were charged, contact support — your reference is " + response.reference);
            donateBtn.disabled = false;
            donateBtn.innerHTML = 'Donate via Paystack<span class="cta-sub">Card · Bank · USSD</span>';
          });
      }
    });
    handler.openIframe();
  });
})();
</script>
</body>
</html>`;
  }

  private notFoundHtml(reason: string): string {
    return `<!doctype html>
<html><head>
<title>Not found · GreyFundr</title>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;text-align:center;padding:80px 24px;color:#161618}
h1{font-size:22px;margin-bottom:12px}
p{color:#6b6b73;font-size:14px;margin-bottom:24px}
a{color:#017981;text-decoration:none;font-weight:700}
</style>
</head><body>
<h1>${this.escape(reason)}</h1>
<p>The campaign you're looking for might have ended or moved.</p>
<p><a href="https://greyfundr.com">Back to GreyFundr</a></p>
</body></html>`;
  }

  private creatorName(c: Campaign): string {
    const u = (c as unknown as { creator?: { firstName?: string; lastName?: string; username?: string } }).creator;
    const full = [u?.firstName, u?.lastName]
      .filter((s): s is string => !!s && s.length > 0)
      .join(' ')
      .trim();
    if (full) return full;
    return u?.username ?? 'a GreyFundr creator';
  }

  private escape(s: string): string {
    return (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
