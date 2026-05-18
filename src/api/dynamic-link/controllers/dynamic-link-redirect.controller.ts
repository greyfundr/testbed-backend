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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>${ogTitle}</title>
  <meta name="theme-color" content="#017981"/>
  <meta property="og:title"       content="${ogTitle}"/>
  <meta property="og:description" content="${ogDescription}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:type" content="website"/>
  <meta name="apple-itunes-app"   content="app-id=${project.ios?.bundleId ?? ''}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    :root{
      --teal-700:#017981;
      --teal-600:#03B6BD;
      --teal-50:rgba(1,121,129,.08);
      --teal-100:rgba(1,121,129,.14);
      --ink-900:#0F1A2C;
      --ink-700:#3E4A60;
      --ink-500:#6B7787;
      --ink-200:#E6E8EE;
      --canvas:#F4F7FA;
      --shadow-card:0 12px 40px rgba(13,28,50,.08), 0 2px 8px rgba(13,28,50,.04);
      --shadow-button:0 10px 22px rgba(1,121,129,.28);
    }
    html,body{height:100%}
    body{
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:
        radial-gradient(1200px 600px at -10% -20%, rgba(3,182,189,.16), transparent 60%),
        radial-gradient(1000px 500px at 110% 110%, rgba(1,121,129,.14), transparent 60%),
        var(--canvas);
      color:var(--ink-900);
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;
      padding:24px;
    }
    .card{
      background:#fff;
      border-radius:28px;
      padding:36px 28px 28px;
      width:100%;
      max-width:420px;
      box-shadow:var(--shadow-card);
      animation:rise .5s cubic-bezier(.2,.7,.2,1) both;
    }
    @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    .brand{
      display:flex;align-items:center;justify-content:center;gap:8px;
      margin-bottom:18px;
    }
    .brand-mark{
      width:34px;height:34px;border-radius:10px;
      background:linear-gradient(135deg,var(--teal-600),var(--teal-700));
      box-shadow:0 6px 14px rgba(1,121,129,.32);
      display:grid;place-items:center;color:#fff;font-weight:800;font-size:15px;
      letter-spacing:.5px;
    }
    .brand-word{font-weight:800;color:var(--ink-900);font-size:18px;letter-spacing:-.2px}
    ${
      ogImage
        ? `.hero{
            width:100%;aspect-ratio:5/3;border-radius:18px;
            background:url('${this.escapeHtml(ogImage)}') center/cover no-repeat,
                       linear-gradient(135deg,var(--teal-50),#fff);
            margin-bottom:18px;
          }`
        : `.hero-fallback{
            width:100%;aspect-ratio:5/3;border-radius:18px;margin-bottom:18px;
            background:linear-gradient(135deg,var(--teal-50),var(--teal-100));
            display:grid;place-items:center;color:var(--teal-700);font-weight:700;
          }`
    }
    h2{
      font-size:20px;font-weight:800;color:var(--ink-900);
      letter-spacing:-.3px;line-height:1.25;margin-bottom:6px;text-align:center;
    }
    p.sub{
      font-size:13.5px;color:var(--ink-500);line-height:1.5;
      margin-bottom:22px;text-align:center;
    }
    .status{
      display:flex;align-items:center;justify-content:center;gap:10px;
      margin:6px 0 22px;color:var(--teal-700);font-weight:600;font-size:13px;
    }
    .pulse{
      position:relative;width:10px;height:10px;border-radius:50%;
      background:var(--teal-600);
    }
    .pulse::after{
      content:"";position:absolute;inset:-6px;border-radius:50%;
      background:rgba(3,182,189,.35);animation:pulse 1.4s ease-out infinite;
    }
    @keyframes pulse{
      0%{transform:scale(.6);opacity:.7}
      100%{transform:scale(1.8);opacity:0}
    }
    .actions{display:none;flex-direction:column;gap:10px}
    .btn{
      display:flex;align-items:center;justify-content:center;gap:10px;
      width:100%;padding:14px 18px;border-radius:14px;text-decoration:none;
      font-weight:700;font-size:14.5px;cursor:pointer;border:none;
      transition:transform .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .btn:active{transform:translateY(1px)}
    .btn-primary{
      background:linear-gradient(135deg,var(--teal-600),var(--teal-700));
      color:#fff;box-shadow:var(--shadow-button);
    }
    .btn-primary:hover{box-shadow:0 14px 28px rgba(1,121,129,.36)}
    .btn-store{
      background:#0B0F17;color:#fff;
    }
    .btn-store:hover{background:#1A1F2C}
    .btn-store svg{flex-shrink:0}
    .btn-store .lbl-row{display:flex;flex-direction:column;align-items:flex-start;line-height:1.1}
    .btn-store .lbl-row .small{font-size:10px;color:rgba(255,255,255,.78);font-weight:500;letter-spacing:.3px}
    .btn-store .lbl-row .big{font-size:15px;font-weight:700}
    .btn-guest{
      background:transparent;color:var(--ink-500);
      border:1px solid var(--ink-200);font-size:13px;
    }
    .btn-guest:hover{background:var(--canvas);color:var(--ink-700)}
    .stores{display:flex;gap:10px}
    .stores .btn{flex:1;padding:12px 14px}
    .divider{
      display:flex;align-items:center;gap:10px;
      margin:14px 0 12px;color:var(--ink-500);font-size:11px;
      text-transform:uppercase;letter-spacing:1.2px;font-weight:700;
    }
    .divider::before,.divider::after{
      content:"";flex:1;height:1px;background:var(--ink-200);
    }
    .foot{
      text-align:center;color:var(--ink-500);font-size:11px;
      margin-top:16px;letter-spacing:.2px;
    }
    @media (max-width:380px){
      .card{padding:28px 20px 22px;border-radius:24px}
      h2{font-size:18px}
      .stores{flex-direction:column}
    }
  </style>
</head>
<body>
  <div class="card" role="dialog" aria-labelledby="title">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">G</div>
      <div class="brand-word">GreyFundr</div>
    </div>
    ${
      ogImage
        ? `<div class="hero" role="img" aria-label="${ogTitle}"></div>`
        : `<div class="hero-fallback" aria-hidden="true">GreyFundr</div>`
    }
    <h2 id="title">${ogTitle}</h2>
    <p class="sub">${ogDescription}</p>
    <div class="status" id="status">
      <span class="pulse" aria-hidden="true"></span>
      <span>Opening the app…</span>
    </div>
    <div class="actions" id="actions">
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
      ${
        guestWebUrl
          ? `<a class="btn btn-guest" href="${this.escapeHtml(guestWebUrl)}" id="guestBtn">
               Continue in browser instead
             </a>`
          : ''
      }
    </div>
    <div class="foot">Secured by GreyFundr · ${new Date().getFullYear()}</div>
  </div>

  <script>
  (function () {
    var deepLink = ${JSON.stringify(deepLink)};
    var status   = document.getElementById('status');
    var actions  = document.getElementById('actions');
    var appLaunched = false;

    // Try the deep link immediately. If the app handles it the page
    // backgrounds (blur / visibilitychange fires) and we hide the
    // fallback. Otherwise after 2.5s we show the store buttons.
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
