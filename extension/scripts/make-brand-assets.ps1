# Generează toate imaginile de brand Arbitra din logo-ul sursă, fără dependențe npm
# (Windows PowerShell + System.Drawing).
#
# Rulare, din rădăcina repo-ului:
#   powershell -NoProfile -ExecutionPolicy Bypass -File extension/scripts/make-brand-assets.ps1
#
# Ieșiri:
#   apps/web/public/brand/logo.png          512x512, fundal transparent
#   apps/web/public/brand/logo-on-dark.png  512x512, căruciorul în #F4F7F5 pentru fundaluri închise
#   apps/web/src/app/icon.png               512x512 (convenția Next.js "icon")
#   apps/web/src/app/apple-icon.png         180x180, fundal alb opac (iOS rotunjește singur colțurile)
#   extension/icons/icon-{16,32,48,128}.png pe un pătrat rotunjit deschis la culoare
param(
  [string]$Source = (Join-Path $PSScriptRoot "../../apps/web/public/brand/logo-source.png")
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$Source = (Resolve-Path $Source).Path

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ArbitraBrand
{
    // Pixelii cu toate canalele >= FLOOD_MIN și legați de margine sunt fundal (sau anti-aliasing spre fundal).
    const int FLOOD_MIN = 100;
    // Zgomot tolerat în albul fundalului: sub pragul ăsta pixelul devine complet transparent.
    const int NOISE = 8;

    static int[] ReadPixels(Bitmap bmp)
    {
        Rectangle rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
        BitmapData data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int[] px = new int[bmp.Width * bmp.Height];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        bmp.UnlockBits(data);
        return px;
    }

    static Bitmap FromPixels(int[] px, int w, int h)
    {
        Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        return bmp;
    }

    static int Argb(int a, int r, int g, int b)
    {
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    static int Clamp(double v)
    {
        if (v < 0) return 0;
        if (v > 255) return 255;
        return (int)Math.Round(v);
    }

    /// Decupează logo-ul: fundalul alb exterior devine transparent, interiorul (zigzagul alb,
    /// gaura etichetei) rămâne opac; rezultatul e tăiat la conținut, cu margine egală, pătrat.
    /// onDark: pixelii aproape negri (căruciorul) sunt recolorați în #F4F7F5.
    public static Bitmap Cutout(string path, bool onDark, double marginRatio)
    {
        int w, h;
        int[] px;
        using (Bitmap raw = new Bitmap(path))
        {
            w = raw.Width;
            h = raw.Height;
            using (Bitmap flat = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(flat))
                {
                    g.Clear(Color.White);
                    g.DrawImage(raw, 0, 0, w, h);
                }
                px = ReadPixels(flat);
            }
        }

        // 1. flood fill (4-conex) din margini peste pixelii deschiși la culoare
        bool[] bg = new bool[w * h];
        Queue<int> queue = new Queue<int>();
        for (int x = 0; x < w; x++) { Seed(px, bg, queue, x, 0, w); Seed(px, bg, queue, x, h - 1, w); }
        for (int y = 0; y < h; y++) { Seed(px, bg, queue, 0, y, w); Seed(px, bg, queue, w - 1, y, w); }
        while (queue.Count > 0)
        {
            int i = queue.Dequeue();
            int x = i % w, y = i / w;
            if (x > 0) Seed(px, bg, queue, x - 1, y, w);
            if (x < w - 1) Seed(px, bg, queue, x + 1, y, w);
            if (y > 0) Seed(px, bg, queue, x, y - 1, w);
            if (y < h - 1) Seed(px, bg, queue, x, y + 1, w);
        }

        // 2. "color to alpha" față de alb, doar pe regiunea de fundal: marginile anti-aliased
        //    primesc alfa parțial, iar culoarea lor e separată de alb (fără halou deschis)
        int[] outPx = new int[w * h];
        for (int i = 0; i < px.Length; i++)
        {
            int p = px[i];
            int r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
            int a = 255;
            if (bg[i])
            {
                int minC = Math.Min(r, Math.Min(g, b));
                double alpha = ((255 - minC) - NOISE) / (255.0 - NOISE);
                if (alpha <= 0.02)
                {
                    outPx[i] = 0;
                    continue;
                }
                if (alpha > 1) alpha = 1;
                r = Clamp((r - (1 - alpha) * 255) / alpha);
                g = Clamp((g - (1 - alpha) * 255) / alpha);
                b = Clamp((b - (1 - alpha) * 255) / alpha);
                a = Clamp(alpha * 255);
            }
            if (onDark)
            {
                int mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b));
                if (mx - mn < 40 && mx < 110)
                {
                    r = 0xF4; g = 0xF7; b = 0xF5;
                }
            }
            outPx[i] = Argb(a, r, g, b);
        }

        // 3. tăiere la conținut + margine egală + pătrat
        int x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                if (((outPx[y * w + x] >> 24) & 255) > 10)
                {
                    if (x < x0) x0 = x;
                    if (x > x1) x1 = x;
                    if (y < y0) y0 = y;
                    if (y > y1) y1 = y;
                }
            }
        }
        int bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        int content = Math.Max(bw, bh);
        int margin = (int)Math.Round(content * marginRatio);
        int side = content + 2 * margin;
        int offX = (side - bw) / 2, offY = (side - bh) / 2;
        int[] sq = new int[side * side];
        for (int y = 0; y < bh; y++)
        {
            Array.Copy(outPx, (y0 + y) * w + x0, sq, (offY + y) * side + offX, bw);
        }
        return FromPixels(sq, side, side);
    }

    static void Seed(int[] px, bool[] bg, Queue<int> queue, int x, int y, int w)
    {
        int i = y * w + x;
        if (bg[i]) return;
        int p = px[i];
        int r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
        if (Math.Min(r, Math.Min(g, b)) < FLOOD_MIN) return;
        bg[i] = true;
        queue.Enqueue(i);
    }

    static Graphics HighQuality(Bitmap bmp)
    {
        Graphics g = Graphics.FromImage(bmp);
        g.CompositingMode = CompositingMode.SourceOver;
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        return g;
    }

    /// Desenează imaginea (redimensionată bicubic, cu pre-filtrare) în dreptunghiul dat.
    static void DrawScaled(Graphics g, Bitmap src, RectangleF dst)
    {
        // sursă premultiplicată: interpolarea nu aduce margini întunecate din pixelii transparenți
        using (Bitmap pre = src.Clone(new Rectangle(0, 0, src.Width, src.Height), PixelFormat.Format32bppPArgb))
        using (ImageAttributes ia = new ImageAttributes())
        {
            ia.SetWrapMode(WrapMode.TileFlipXY);
            g.DrawImage(pre, new Rectangle((int)Math.Round(dst.X), (int)Math.Round(dst.Y), (int)Math.Round(dst.Width), (int)Math.Round(dst.Height)),
                0, 0, pre.Width, pre.Height, GraphicsUnit.Pixel, ia);
        }
    }

    public static void SaveResized(Bitmap src, int size, string outPath)
    {
        using (Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = HighQuality(dst))
            {
                g.Clear(Color.Transparent);
                DrawScaled(g, src, new RectangleF(0, 0, size, size));
            }
            dst.Save(outPath, ImageFormat.Png);
        }
    }

    /// Fundal alb opac pe tot pătratul (iOS aplică singur masca rotunjită) + logo cu spațiu în jur.
    public static void SaveAppleIcon(Bitmap logo, int size, double padRatio, string outPath)
    {
        using (Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = HighQuality(dst))
            {
                g.Clear(Color.White);
                float pad = (float)(size * padRatio);
                DrawScaled(g, logo, new RectangleF(pad, pad, size - 2 * pad, size - 2 * pad));
            }
            dst.Save(outPath, ImageFormat.Png);
        }
    }

    static GraphicsPath RoundedRect(RectangleF r, float radius)
    {
        GraphicsPath path = new GraphicsPath();
        float d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    /// Iconiță de extensie: pătrat rotunjit deschis (cu contur discret) și logo-ul centrat,
    /// ca să se vadă pe bara Chrome atât în tema deschisă, cât și în cea închisă.
    public static void SaveExtensionIcon(Bitmap logo, int size, string outPath)
    {
        // Chrome recomandă pentru 128 o zonă utilă de ~96 px, cu spațiu transparent în jur
        float inset = size >= 128 ? size * 0.0625f : 0f;
        float box = size - 2 * inset;
        float radius = box * 0.22f;
        float stroke = Math.Max(1f, size / 48f);
        using (Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = HighQuality(dst))
            {
                g.Clear(Color.Transparent);
                RectangleF rect = new RectangleF(inset + stroke / 2, inset + stroke / 2, box - stroke, box - stroke);
                using (GraphicsPath path = RoundedRect(rect, radius))
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(255, 0xF6, 0xFA, 0xF7)))
                using (Pen border = new Pen(Color.FromArgb(size <= 16 ? 70 : 55, 0x0F, 0x3D, 0x2E), stroke))
                {
                    g.FillPath(fill, path);
                    g.DrawPath(border, path);
                }
                // logo-ul are deja o margine mică; la 16 px îl lăsăm aproape la marginea pătratului
                float pad = box * (size <= 16 ? 0.02f : 0.06f);
                DrawScaled(g, logo, new RectangleF(inset + pad, inset + pad, box - 2 * pad, box - 2 * pad));
            }
            dst.Save(outPath, ImageFormat.Png);
        }
    }
}
"@

$brandDir = Join-Path $root "apps/web/public/brand"
$appDir = Join-Path $root "apps/web/src/app"
$iconDir = Join-Path $root "extension/icons"
New-Item -ItemType Directory -Force $brandDir | Out-Null

$logo = [ArbitraBrand]::Cutout($Source, $false, 0.04)
$logoDark = [ArbitraBrand]::Cutout($Source, $true, 0.04)
try {
  [ArbitraBrand]::SaveResized($logo, 512, (Join-Path $brandDir "logo.png"))
  [ArbitraBrand]::SaveResized($logoDark, 512, (Join-Path $brandDir "logo-on-dark.png"))
  [ArbitraBrand]::SaveResized($logo, 512, (Join-Path $appDir "icon.png"))
  [ArbitraBrand]::SaveAppleIcon($logo, 180, 0.1, (Join-Path $appDir "apple-icon.png"))
  foreach ($size in 16, 32, 48, 128) {
    [ArbitraBrand]::SaveExtensionIcon($logo, $size, (Join-Path $iconDir "icon-$size.png"))
  }
} finally {
  $logo.Dispose()
  $logoDark.Dispose()
}

Write-Output "Imagini de brand generate din $Source"
