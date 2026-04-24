/**
 * Node runtime PNG renderer for share cards.
 *
 * Uses Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG).
 * Fonts are loaded once from public/fonts/ and cached in module scope.
 *
 * Performance target: < 200ms per render (p95, warm).
 */
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { ShareCard, type CardProps } from './layout'

interface FontEntry {
  name: string
  data: Buffer
  weight: 400 | 700 | 800
  style: 'normal'
}

let _fonts: FontEntry[] | null = null

function loadFonts(): FontEntry[] {
  if (_fonts !== null) return _fonts

  const fontDir = join(process.cwd(), 'public', 'fonts')
  const fonts: FontEntry[] = []

  const regularPath = join(fontDir, 'Inter-Regular.ttf')
  const boldPath = join(fontDir, 'Inter-ExtraBold.ttf')

  if (existsSync(regularPath)) {
    fonts.push({
      name: 'Inter',
      data: readFileSync(regularPath),
      weight: 400,
      style: 'normal',
    })
  }

  if (existsSync(boldPath)) {
    fonts.push({
      name: 'Inter',
      data: readFileSync(boldPath),
      weight: 800,
      style: 'normal',
    })
  }

  _fonts = fonts
  return fonts
}

// Reset font cache (for testing)
export function _resetFontCache(): void {
  _fonts = null
}

/**
 * Render a share card to PNG bytes.
 * @throws if Satori or Resvg fails
 */
export async function renderCardPng(props: CardProps): Promise<Buffer> {
  const fonts = loadFonts()

  const svg = await satori(
    React.createElement(ShareCard, props),
    {
      width: 1200,
      height: 630,
      fonts,
    }
  )

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  })

  return Buffer.from(resvg.render().asPng())
}
