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

@Controller({ version: VERSION_NEUTRAL })
export class DynamicLinkRedirectController {
  constructor(
    private readonly dynamicLinkService: DynamicLinkService,
    private readonly projectRepo: DynamicLinkProjectRepository,
  ) {}

  @Get('l/:shortCode')
  async redirect(
    @Param('shortCode') shortCode: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { link, project } =
        await this.dynamicLinkService.resolveAndTrack(shortCode);
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
        paths: ['/l/*'],
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${ogTitle}</title>

  <!-- Open Graph for rich previews in WhatsApp, iMessage, etc. -->
  <meta property="og:title"       content="${ogTitle}"/>
  <meta property="og:description" content="${ogDescription}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:type"        content="website"/>

  <!-- iOS Universal Links & Smart App Banner -->
  <meta name="apple-itunes-app" content="app-id=${project.ios?.bundleId ?? ''}"/>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f7f7fb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 40px 32px;
      text-align: center;
      max-width: 380px;
      width: 90%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .logo { font-size: 28px; font-weight: 800; color: #6C63FF; margin-bottom: 8px; }
    h2 { font-size: 20px; color: #1a1a2e; margin-bottom: 8px; }
    p  { font-size: 14px; color: #666; margin-bottom: 24px; }
    .loader {
      border: 3px solid #f0f0f0;
      border-top: 3px solid #6C63FF;
      border-radius: 50%;
      width: 36px; height: 36px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .store-btns { display: none; flex-direction: column; gap: 12px; }
    .btn {
      display: block;
      padding: 14px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
    }
    .btn-ios     { background: #000; color: #fff; }
    .btn-android { background: #3DDC84; color: #000; }
    .btn-open    {
      background: #6C63FF; color: #fff;
      margin-bottom: 16px;
      display: block;
      padding: 14px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
    }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">GreyFundr</div>
  <h2>${ogTitle}</h2>
  <p>${ogDescription}</p>
  <div class="loader" id="loader"></div>
  <a class="btn-open" href="${this.escapeHtml(deepLink)}" id="openBtn" style="display:none">
    Open in GreyFundr
  </a>
  <div class="store-btns" id="storeBtns">
    <p>Get the app to continue:</p>
    <a class="btn btn-ios"     href="${this.escapeHtml(iosStore)}">Download on App Store</a>
    <a class="btn btn-android" href="${this.escapeHtml(androidStore)}">Get it on Google Play</a>
  </div>
</div>

<script>
(function () {
  var deepLink    = ${JSON.stringify(deepLink)};
  var loader      = document.getElementById('loader');
  var openBtn     = document.getElementById('openBtn');
  var storeBtns   = document.getElementById('storeBtns');

  // Attempt to open the app immediately
  window.location.href = deepLink;

  // After 2.5s, if still here, show store buttons
  var fallback = setTimeout(function () {
    loader.style.display    = 'none';
    openBtn.style.display   = 'block';
    storeBtns.style.display = 'flex';
  }, 2500);

  // If the page blurs (app launched), cancel fallback
  window.addEventListener('blur', function () {
    clearTimeout(fallback);
    loader.style.display = 'none';
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(fallback);
      loader.style.display = 'none';
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
