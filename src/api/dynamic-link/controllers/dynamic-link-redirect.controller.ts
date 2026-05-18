import {
  Controller,
  Get,
  Param,
  Res,
  HttpStatus,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { Response } from 'express';
import { DynamicLinkService } from '../services/dynamic-link.service';
import { DynamicLinkProjectRepository } from '../repository';
import { DynamicLink, DynamicLinkProject } from '../entities';
import { ConfigService } from '@nestjs/config';

@Controller({ path: '', version: VERSION_NEUTRAL })
export class DynamicLinkRedirectController {
  constructor(
    private readonly dynamicLinkService: DynamicLinkService,
    private readonly projectRepo: DynamicLinkProjectRepository,
    private readonly config: ConfigService,
  ) {}

  @Get('l/:shortCode')
  async redirect(
    @Param('shortCode') shortCode: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!/^[A-Za-z0-9]{8,12}$/.test(shortCode)) {
      res.status(HttpStatus.NOT_FOUND).type('html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Link</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>This link is invalid or has expired.</h2>
          <p><a href="https://greyfundr.com">Visit GreyFundr</a></p>
        </body>
        </html>
      `);
      return;
    }

    try {
      const { link, project } =
        await this.dynamicLinkService.resolveAndTrack(shortCode);

      this.dynamicLinkService.incrementClicks(link.id).catch(() => null);

      const html = this.buildRedirectHtml(link, project);
      res.status(HttpStatus.OK).type('html').send(html);
    } catch {
      res.status(HttpStatus.NOT_FOUND).type('html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>Link Not Found</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>This link has expired or does not exist.</h2>
          <p><a href="https://greyfundr.com">Visit GreyFundr</a></p>
        </body>
        </html>
      `);
    }
  }

  @Get('.well-known/apple-app-site-association')
  async appleAppSiteAssociation(@Res() res: Response): Promise<void> {
    const projects = await this.projectRepo.findAll({
      where: { isActive: true },
    });

    const details = projects
      .filter((p) => p.ios?.bundleId && p.ios?.teamId)
      .map((p) => ({
        appID: `${p.ios.teamId}.${p.ios.bundleId}`,
        // /l/* — the canonical short link format (DynamicLink.shortCode).
        // /c/* — the legacy bare-web share URL still emitted as a
        // fallback when the dynamic-link service is unavailable.
        // Listing both means iOS opens the app on either path.
        paths: ['/l/*', '/c/*'],
      }));

    res.set('Content-Type', 'application/json').json({
      applinks: { apps: [], details },
    });
  }

  @Get('.well-known/assetlinks.json')
  async androidAssetLinks(@Res() res: Response): Promise<void> {
    const projects = await this.projectRepo.findAll({
      where: { isActive: true },
    });

    const assetLinks = projects
      .filter((p) => p.android?.packageName)
      .flatMap((p) =>
        (p.android.sha256CertFingerprints ?? []).map((sha256) => ({
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: p.android.packageName,
            sha256_cert_fingerprints: [sha256],
          },
        })),
      );

    res.json(assetLinks);
  }

  private buildRedirectHtml(
    link: DynamicLink,
    project: DynamicLinkProject,
  ): string {
    const allParams: Record<string, string> = {
      type: link.type,
      id: link.resourceId,
      ...(link.metadata ?? {}),
    };

    const queryString = new URLSearchParams(allParams).toString();
    const deepLink = `${project.appScheme}://open?${queryString}`;
    const iosStore = project.ios?.appStoreUrl ?? '#';
    const androidStore = project.android?.playStoreUrl ?? '#';

    const ogTitle = this.escapeHtml(
      link.customOgTitle ?? this.defaultOgTitle(link.type),
    );
    const ogDescription = this.escapeHtml(
      link.customOgDescription ?? this.defaultOgDescription(link.type),
    );
    const ogImage = link.customOgImage ?? '';

    const isInvite = link.type === 'invite';
    const inviteCode = link.metadata?.inviteCode ?? '';
    const billId = link.metadata?.billId ?? link.resourceId;

    const guestWebUrl = isInvite
      ? `${this.config.get('WEB_BASE_URL')}/pay/split-bill/${billId}?inviteCode=${inviteCode}`
      : null;

    // For campaign links, build a "donate on the web" URL pointing at
    // the public champion landing page at `/c/<slug>?ref=<code>`. That
    // page renders inline Paystack — gives web visitors a way to
    // donate without installing the app. Falls back to null for
    // non-campaign link types so the button only shows when relevant.
    const appBaseUrl =
      this.config.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';
    const campaignSlug = (link.metadata as { slug?: string } | null | undefined)?.slug;
    const refCode = (link.metadata as { ref?: string } | null | undefined)?.ref;
    const webDonateUrl =
      link.type === 'campaign' && campaignSlug && appBaseUrl
        ? `${appBaseUrl}/c/${campaignSlug}${refCode ? `?ref=${refCode}` : ''}`
        : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>${ogTitle}</title>
  <meta name="theme-color" content="#017981"/>
  <meta name="color-scheme" content="light"/>
  <meta property="og:title"       content="${ogTitle}"/>
  <meta property="og:description" content="${ogDescription}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:type" content="website"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="apple-itunes-app" content="app-id=${project.ios?.bundleId ?? ''}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* ─────── Design tokens ─────── */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    :root{
      --teal-700:#017981;
      --teal-600:#03B6BD;
      --teal-300:#7CE2E8;
      --teal-50: rgba(1,121,129,.08);
      --teal-100:rgba(1,121,129,.14);
      --ink-900:#0F1A2C;
      --ink-700:#3E4A60;
      --ink-500:#6B7787;
      --ink-300:#B7C0CE;
      --ink-200:#E6E8EE;
      --canvas: #F4F7FA;
      --shadow-card:0 30px 60px -20px rgba(13,28,50,.18), 0 12px 24px -12px rgba(13,28,50,.12), 0 1px 0 rgba(255,255,255,.6) inset;
      --shadow-cta: 0 12px 28px rgba(1,121,129,.32);
    }
    html,body{height:100%}
    body{
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:
        radial-gradient(1400px 700px at -10% -20%, rgba(3,182,189,.18), transparent 60%),
        radial-gradient(1200px 600px at 110% 110%, rgba(1,121,129,.14), transparent 60%),
        var(--canvas);
      color:var(--ink-900);
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:24px;
    }

    /* ─────── Card shell (mobile-first) ─────── */
    .card{
      background:#fff;border-radius:24px;overflow:hidden;
      width:100%;max-width:440px;
      box-shadow:var(--shadow-card);
      animation:rise .55s cubic-bezier(.2,.7,.2,1) both;
      display:flex;flex-direction:column;
    }
    @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

    /* ─────── Hero block ─────── */
    .hero{
      position:relative;width:100%;aspect-ratio:5/3;
      background:
        linear-gradient(180deg, rgba(15,26,44,0) 50%, rgba(15,26,44,.55) 100%),
        ${ogImage ? `url('${this.escapeHtml(ogImage)}') center/cover no-repeat` : 'linear-gradient(135deg,var(--teal-300),var(--teal-700))'};
      background-color:var(--teal-100);
      display:flex;align-items:flex-end;justify-content:flex-start;
    }
    .hero-pad{padding:18px 20px;color:#fff;width:100%}
    .hero-pad h1{
      font-size:18px;font-weight:800;letter-spacing:-.2px;line-height:1.25;
      text-shadow:0 1px 2px rgba(15,26,44,.5);
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    }
    .hero-tag{
      position:absolute;top:14px;left:14px;
      display:inline-flex;align-items:center;gap:6px;
      padding:5px 10px;border-radius:999px;
      background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
      color:var(--teal-700);font-size:10.5px;font-weight:800;
      letter-spacing:.4px;text-transform:uppercase;
    }
    .hero-tag .dot{width:6px;height:6px;border-radius:50%;background:var(--teal-600)}

    /* ─────── Panel (everything below the hero) ─────── */
    .panel{padding:22px 24px 24px;display:flex;flex-direction:column;flex:1}

    /* ─────── Logo / brand ─────── */
    .brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .brand-mark{
      width:34px;height:34px;border-radius:10px;
      background:linear-gradient(135deg,var(--teal-600),var(--teal-700));
      box-shadow:0 8px 16px rgba(1,121,129,.32);
      flex-shrink:0;display:grid;place-items:center;
    }
    .brand-word{font-weight:800;color:var(--ink-900);font-size:16px;letter-spacing:-.2px}
    .brand-tag{font-weight:500;color:var(--ink-500);font-size:11.5px;margin-left:auto;letter-spacing:.2px}

    /* ─────── Title + sub (inside panel, used on mobile + tablet) ─────── */
    .panel-title{
      font-size:20px;font-weight:800;color:var(--ink-900);
      letter-spacing:-.3px;line-height:1.25;margin-bottom:6px;
    }
    .panel-sub{font-size:13.5px;color:var(--ink-500);line-height:1.55;margin-bottom:18px}

    /* ─────── Live status pulse ─────── */
    .status{
      display:flex;align-items:center;justify-content:flex-start;gap:10px;
      margin:2px 0 18px;color:var(--teal-700);font-weight:600;font-size:13px;
    }
    .pulse{position:relative;width:10px;height:10px;border-radius:50%;background:var(--teal-600);flex-shrink:0}
    .pulse::after{content:"";position:absolute;inset:-6px;border-radius:50%;background:rgba(3,182,189,.35);animation:pulse 1.4s ease-out infinite}
    @keyframes pulse{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.8);opacity:0}}

    /* ─────── Actions panel (hidden until fallback fires) ─────── */
    .actions{display:none;flex-direction:column;gap:10px}
    .btn{
      display:flex;align-items:center;justify-content:center;gap:10px;
      width:100%;padding:14px 18px;border-radius:14px;text-decoration:none;
      font-weight:700;font-size:14.5px;cursor:pointer;border:none;
      transition:transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease;
    }
    .btn:active{transform:translateY(1px)}
    .btn-primary{
      background:linear-gradient(135deg,var(--teal-600),var(--teal-700));
      color:#fff;box-shadow:var(--shadow-cta);
    }
    .btn-primary:hover{box-shadow:0 16px 34px rgba(1,121,129,.4)}
    .btn-store{background:#0B0F17;color:#fff}
    .btn-store:hover{background:#1A1F2C}
    .btn-store svg{flex-shrink:0}
    .btn-store .lbl-row{display:flex;flex-direction:column;align-items:flex-start;line-height:1.1}
    .btn-store .lbl-row .small{font-size:10px;color:rgba(255,255,255,.78);font-weight:500;letter-spacing:.3px}
    .btn-store .lbl-row .big{font-size:14.5px;font-weight:700}
    .btn-guest{background:transparent;color:var(--ink-500);border:1px solid var(--ink-200);font-size:13px}
    .btn-guest:hover{background:var(--canvas);color:var(--ink-700)}

    /* Web-donate CTA. Visible at all breakpoints; styled as the
       PRIMARY action on desktop and a SECONDARY outline on mobile/
       tablet (where "Open in app" is the primary). The desktop swap
       happens via the @media block further down. */
    .btn-web{
      background:#fff;color:var(--teal-700);
      border:1.5px solid var(--teal-700);
    }
    .btn-web:hover{background:var(--teal-50)}
    .btn-web svg{stroke:var(--teal-700)}

    .stores{display:flex;flex-direction:column;gap:8px}
    .divider{
      display:flex;align-items:center;gap:10px;margin:12px 0 8px;
      color:var(--ink-500);font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;
    }
    .divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--ink-200)}

    .foot{
      text-align:center;color:var(--ink-300);font-size:11px;
      margin-top:auto;padding-top:18px;letter-spacing:.2px;
    }
    .foot strong{color:var(--ink-500);font-weight:700}

    /* ─────── TABLET — 640px and up ─────── */
    @media (min-width:640px){
      body{padding:40px}
      .card{max-width:540px;border-radius:28px}
      .hero{aspect-ratio:16/9}
      .hero-pad h1{font-size:22px;-webkit-line-clamp:3}
      .hero-tag{top:18px;left:18px;font-size:11px;padding:6px 12px}
      .panel{padding:26px 30px 28px}
      .panel-title{font-size:22px}
      .panel-sub{font-size:14px}
      .stores{flex-direction:row;gap:10px}
      .stores .btn{flex:1}
    }

    /* ─────── DESKTOP — 1024px and up: two-column hero card ─────── */
    @media (min-width:1024px){
      body{padding:48px}
      .card{
        max-width:980px;min-height:560px;
        flex-direction:row;align-items:stretch;
        border-radius:32px;
      }
      .hero{
        aspect-ratio:auto;width:55%;height:auto;flex-shrink:0;
        background:
          linear-gradient(180deg, rgba(15,26,44,0) 45%, rgba(15,26,44,.6) 100%),
          ${ogImage ? `url('${this.escapeHtml(ogImage)}') center/cover no-repeat` : 'linear-gradient(135deg,var(--teal-300),var(--teal-700))'};
      }
      .hero-pad{padding:28px 32px}
      .hero-pad h1{font-size:28px;-webkit-line-clamp:4;line-height:1.2}
      .hero-tag{top:22px;left:22px;padding:7px 14px;font-size:12px}
      .panel{width:45%;padding:36px 40px 36px;justify-content:center}
      .brand-mark{width:38px;height:38px;border-radius:12px}
      .brand-word{font-size:17px}
      .panel-title{display:none}    /* desktop title lives in hero */
      .panel-sub{display:none}      /* desktop description lives in hero */
      .status{margin:6px 0 22px}
      /* Desktop has no in-browser deep-link target (no mobile app
         on desktop), so we (a) show the action panel immediately
         instead of waiting on the 2.5s fallback, (b) hide the
         "Opening the app…" pulse, (c) hide the "Open in GreyFundr"
         button since it does nothing on web, and (d) promote the
         web-donate button to the primary gradient style. */
      .status{display:none !important}
      .actions{display:flex !important}
      #openBtn{display:none}
      .btn-web{
        background:linear-gradient(135deg,var(--teal-600),var(--teal-700));
        color:#fff;border:none;box-shadow:var(--shadow-cta);
      }
      .btn-web:hover{box-shadow:0 16px 34px rgba(1,121,129,.4);background:linear-gradient(135deg,var(--teal-600),var(--teal-700))}
      .btn-web svg{stroke:#fff}
      .divider{margin-top:8px}
      .desktop-hero-sub{
        display:block;color:rgba(255,255,255,.92);font-size:14px;
        margin-top:6px;line-height:1.5;font-weight:500;
        display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
        text-shadow:0 1px 2px rgba(15,26,44,.5);
      }
    }
    /* Mobile + tablet: hide the desktop-only hero subtitle line */
    @media (max-width:1023px){.desktop-hero-sub{display:none}}
  </style>
</head>
<body>
  <main class="card" role="dialog" aria-labelledby="title">

    <!-- HERO (left on desktop, top on tablet/mobile) -->
    <div class="hero" role="img" aria-label="${ogTitle}">
      <span class="hero-tag"><span class="dot"></span> GreyFundr</span>
      <div class="hero-pad">
        <h1 id="title">${ogTitle}</h1>
        <p class="desktop-hero-sub">${ogDescription}</p>
      </div>
    </div>

    <!-- PANEL (right on desktop, bottom on tablet/mobile) -->
    <section class="panel">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <!-- Inline SVG GreyFundr mark — stylized "G" with a flow inside,
               drawn so it works at any size and tints automatically. -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 7.5A9 9 0 1 0 21 16.5M21 7.5h-6.75A4.5 4.5 0 0 0 9.75 12v0a4.5 4.5 0 0 0 4.5 4.5H21v-3.75h-5.25" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="brand-word">GreyFundr</span>
        <span class="brand-tag">Trusted giving</span>
      </div>

      <!-- Mobile/tablet title + sub — desktop hides these (lives in hero) -->
      <h2 class="panel-title">${ogTitle}</h2>
      <p class="panel-sub">${ogDescription}</p>

      <div class="status" id="status">
        <span class="pulse" aria-hidden="true"></span>
        <span>Opening the app…</span>
      </div>

      <div class="actions" id="actions">
        ${webDonateUrl ? `<a class="btn btn-web" href="${this.escapeHtml(webDonateUrl)}" id="webBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M14 4h7v7"/><path d="M21 4 12 13"/></svg>
          Donate in browser
        </a>` : ''}
        <a class="btn btn-primary" href="${this.escapeHtml(deepLink)}" id="openBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>
          Open in GreyFundr
        </a>
        <div class="divider">Don't have the app?</div>
        <div class="stores">
          <a class="btn btn-store" href="${this.escapeHtml(iosStore)}">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.03-2.78 2.27-4.12 2.37-4.18-1.29-1.89-3.3-2.15-4.02-2.18-1.71-.17-3.34 1.01-4.21 1.01-.87 0-2.21-.99-3.63-.96-1.87.03-3.59 1.09-4.55 2.76-1.94 3.36-.5 8.34 1.39 11.07.93 1.34 2.04 2.84 3.5 2.78 1.4-.06 1.93-.91 3.63-.91s2.17.91 3.64.88c1.5-.03 2.46-1.36 3.38-2.7 1.07-1.55 1.5-3.05 1.52-3.13-.03-.01-2.91-1.12-2.94-4.44Zm-2.76-8.16c.77-.93 1.29-2.22 1.15-3.51-1.11.05-2.45.74-3.25 1.66-.72.82-1.34 2.14-1.18 3.4 1.24.1 2.51-.62 3.28-1.55Z"/></svg>
            <div class="lbl-row">
              <span class="small">Download on the</span>
              <span class="big">App Store</span>
            </div>
          </a>
          <a class="btn btn-store" href="${this.escapeHtml(androidStore)}">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 1.7c-.36.21-.6.61-.6 1.07v18.46c0 .46.24.86.6 1.07L13.7 12 3.6 1.7Z" fill="#5BC9F4"/><path d="M16.9 8.6 5.3 1.4 14.6 10.6l2.3-2Z" fill="#5BC9F4" opacity=".6"/><path d="M20.5 10.4 17.9 8.7l-3.3 3.3 3.3 3.3 2.6-1.7c.82-.49.82-1.7 0-2.2Z" fill="#FFC107"/><path d="M5.3 22.6 17 15.5l-2.4-2.5L5.3 22.6Z" fill="#EA4335"/><path d="M5.3 1.4 14.6 10.6l2.4-2.5L5.3 1.4Z" fill="#34A853"/></svg>
            <div class="lbl-row">
              <span class="small">Get it on</span>
              <span class="big">Google Play</span>
            </div>
          </a>
        </div>
        ${guestWebUrl ? `<a class="btn btn-guest" href="${this.escapeHtml(guestWebUrl)}" id="guestBtn">Continue in browser instead</a>` : ''}
      </div>

      <div class="foot">Secured by <strong>GreyFundr</strong> · ${new Date().getFullYear()}</div>
    </section>
  </main>

  <script>
  (function () {
    var deepLink = ${JSON.stringify(deepLink)};
    var status   = document.getElementById('status');
    var actions  = document.getElementById('actions');
    var appLaunched = false;

    // Desktop has no app to open — skip the 2.5s deep-link wait and
    // just show the action panel immediately. The web-donate button
    // becomes the primary CTA via CSS.
    var isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      status.style.display  = 'none';
      actions.style.display = 'flex';
      return;
    }

    // Mobile / tablet: try the deep link immediately. If the app
    // handles it the page backgrounds (blur / visibilitychange fires)
    // and we hide the fallback. Otherwise after 2.5s we reveal the
    // store buttons + web-donate fallback.
    window.location.href = deepLink;

    var fallback = setTimeout(function () {
      if (!appLaunched) {
        status.style.display  = 'none';
        actions.style.display = 'flex';
      }
    }, 2500);

    window.addEventListener('blur', function () {
      appLaunched = true;
      clearTimeout(fallback);
      status.style.display = 'none';
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        appLaunched = true;
        clearTimeout(fallback);
        status.style.display = 'none';
      }
    });
  })();
  </script>
</body>
</html>`;
  }

  private defaultOgTitle(type: string): string {
    const titles: Record<string, string> = {
      event: "You're invited to an event on GreyFundr",
      campaign: 'Support this campaign on GreyFundr',
      split_bill: 'You have a pending split bill on GreyFundr',
      invite: 'Your share is waiting on GreyFundr',
    };
    return titles[type] ?? 'GreyFundr';
  }

  private defaultOgDescription(type: string): string {
    const descs: Record<string, string> = {
      event: 'Tap to view event details and RSVP.',
      campaign: 'Every contribution counts. Tap to donate.',
      split_bill: 'Tap to view and pay your share.',
      invite: 'Open GreyFundr to complete your payment.',
    };
    return descs[type] ?? 'Open in GreyFundr';
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
